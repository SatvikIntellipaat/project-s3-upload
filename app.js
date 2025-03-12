const express = require('express');
const multer = require('multer');
const { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  GetObjectCommand 
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Enable JSON body parsing
app.use(express.json());

// Available AWS regions
const availableRegions = {
  'us-east-1': 'US East (N. Virginia)',
  'ap-south-1': 'AP South (Mumbai)'
};

const getBucketNameForRegion = (region) => {
  const baseBucketName = process.env.S3_BUCKET_NAME || 'satvik-12012025';
  if (region === 'us-east-1') return baseBucketName;
  return `${baseBucketName}-${region.toLowerCase().replace(/-(\d)$/, '$1')}`;
};

// Function to create S3 client for a specific region
const getS3Client = (region = process.env.AWS_REGION) => {
  return new S3Client({
    region: region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
};

// Default S3 client
const s3Client = getS3Client();

// Serve static files
app.use(express.static('public'));

// Determine user's region using IP-based geolocation
const determineUserRegion = async (req) => {
  try {
    let ip = req.ip;
    console.log(`Raw IP from req.ip: ${ip}`);

    // Handle localhost with a known Indian IP
    if (ip === '::1' || ip === '127.0.0.1') {
      ip = '122.176.100.0'; // Updated sample Indian IP
      console.log(`Localhost detected, using sample Indian IP: ${ip}`);
    }

    const response = await axios.get(`http://ip-api.com/json/${ip}`);
    const countryCode = response.data.countryCode;
    console.log(`Country Code from ip-api: ${countryCode}`);

    if (!countryCode) {
      console.log('No country code returned, falling back to us-east-1');
      return 'us-east-1';
    }

    const region = countryCode === 'IN' ? 'ap-south-1' : 'us-east-1';
    console.log(`Determined Region: ${region}`);
    return region;
  } catch (error) {
    console.error('Geolocation failed:', error.message);
    return 'us-east-1'; // Fallback
  }
};

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const region = await determineUserRegion(req);
    console.log(`Selected Region: ${region}`); // Log the selected region
    if (!availableRegions[region]) {
      return res.status(400).json({ error: `Unsupported region: ${region}` });
    }

    const bucketName = getBucketNameForRegion(region);
    const regionS3Client = getS3Client(region);

    const fileExtension = path.extname(req.file.originalname);
    const randomString = crypto.randomBytes(8).toString('hex');
    const key = `uploads/${Date.now()}-${randomString}${fileExtension}`;

    const params = {
      Bucket: bucketName,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        'original-name': req.file.originalname
      }
    };

    const command = new PutObjectCommand(params);
    await regionS3Client.send(command);

    res.status(200).json({
      message: 'File uploaded successfully',
      fileUrl: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
      fileName: req.file.originalname,
      key: key,
      region: region,
      regionName: availableRegions[region]
    });
  } catch (error) {
    console.error('Error uploading to S3:', error);
    res.status(500).json({
      error: 'Failed to upload file to S3',
      details: error.message
    });
  }
});

// List files endpoint
app.get('/files', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: 'uploads/'
    });
    
    const response = await s3Client.send(command);
    
    const files = response.Contents ? response.Contents.map(item => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      fileName: item.Key.split('/').pop()
    })) : [];
    
    res.status(200).json({
      files: files,
      availableRegions: availableRegions
    });
  } catch (error) {
    console.error('Error listing files from S3:', error);
    res.status(500).json({
      error: 'Failed to list files from S3',
      details: error.message
    });
  }
});

// Download endpoint
app.post('/download', async (req, res) => {
  try {
    const { key, region } = req.body;
    if (!key) return res.status(400).json({ error: 'File key is required' });
    
    const selectedRegion = region && availableRegions[region] ? region : 'us-east-1';
    const bucketName = getBucketNameForRegion(selectedRegion);
    const regionS3Client = getS3Client(selectedRegion);
    
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    
    const signedUrl = await getSignedUrl(regionS3Client, command, { expiresIn: 300 });
    
    res.status(200).json({
      downloadUrl: signedUrl,
      region: selectedRegion,
      regionName: availableRegions[selectedRegion],
      bucketName: bucketName,
      expiresIn: '5 minutes'
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({
      error: 'Failed to generate download URL',
      details: error.message
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});