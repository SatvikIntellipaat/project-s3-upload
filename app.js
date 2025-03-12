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

// Available AWS regions for downloading
const availableRegions = {
  'us-east-1': 'US East (N. Virginia)',
  'ap-south-1': 'AP South (Mumbai)'
  // Add more regions as needed
};

const getBucketNameForRegion = (region) => {
  const baseBucketName = process.env.S3_BUCKET_NAME || 'satvik-12012025'; // Default bucket name from .env
  if (region === 'us-east-1') {
    return baseBucketName; // Default bucket for N. Virginia
  }
  return `${baseBucketName}-${region.toLowerCase().replace(/-(\d)$/, '$1')}`; // e.g., satvik-12012025-ap-south1
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

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate unique file name to prevent overwriting
    const fileExtension = path.extname(req.file.originalname);
    const randomString = crypto.randomBytes(8).toString('hex');
    const key = `uploads/${Date.now()}-${randomString}${fileExtension}`;

    // Set up S3 upload parameters
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        'original-name': req.file.originalname
      }
    };

    // Upload to S3
    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Return success response
    res.status(200).json({
      message: 'File uploaded successfully',
      fileUrl: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
      fileName: req.file.originalname,
      key: key
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
    
    // Format the response
    const files = response.Contents ? response.Contents.map(item => {
      return {
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        // Extract filename from the key
        fileName: item.Key.split('/').pop()
      };
    }) : [];
    
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

// Generate download URL with region selection
app.post('/download', async (req, res) => {
  try {
    const { key, region } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'File key is required' });
    }
    
    // Validate region and default to us-east-1 if not provided or invalid
    const selectedRegion = region && availableRegions[region] ? region : 'us-east-1';
    
    // Determine bucket name based on region
    const bucketName = getBucketNameForRegion(selectedRegion);
    
    // Create S3 client for the selected region
    const regionS3Client = getS3Client(selectedRegion);
    
    // Generate a pre-signed URL for downloading
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    
    // URL expires after 5 minutes (300 seconds)
    const signedUrl = await getSignedUrl(regionS3Client, command, { expiresIn: 300 });
    
    res.status(200).json({
      downloadUrl: signedUrl,
      region: selectedRegion,
      regionName: availableRegions[selectedRegion],
      bucketName: bucketName, // Optional: for debugging
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