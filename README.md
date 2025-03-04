# Project Setup

## Prerequisites
- Install [Node.js](https://nodejs.org/)
- Install [Git](https://git-scm.com/)

## Installation
Clone the repository and install dependencies:

```sh
git clone <repository-url>
cd <project-directory>
npm install
```

## Environment Variables
Before running the project, create a `.env` file in the root directory with the following content:

```
PORT=3000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOURACCESSKEY
AWS_SECRET_ACCESS_KEY=YOURSECRETACCESSKEY
S3_BUCKET_NAME=satvik-12012025
```

**Important:** Never commit the `.env` file to the repository.

## Running the Project
Start the server with:

```sh
npm start
```

## Git Best Practices
Ensure the following files and folders are ignored by Git:

```
node_modules
.env
```

To apply this, add them to the `.gitignore` file and remove any previously committed versions:

```sh
echo "node_modules" >> .gitignore
echo ".env" >> .gitignore
git rm -r --cached node_modules .env
git commit -m "Updated .gitignore to exclude node_modules and .env"
```

## Contribution
Feel free to fork the repo and submit a pull request with improvements.
