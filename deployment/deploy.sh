#!/bin/bash
# Deployment script for AWS EC2

# Exit on any error
set -e

echo "🚀 Pulling latest code..."
git pull origin main

echo "📦 Installing backend dependencies..."
cd backend
npm install --production

echo "🔄 Restarting backend..."
# Use --update-env to ensure PM2 picks up any new .env changes
pm2 restart backend --update-env

echo "🏗️ Building frontend..."
cd ../frontend
npm install

# Ensure the build uses the correct production API URL
# You can also set this in your server's .env file
export VITE_API_URL="http://15.206.74.151/api"
npm run build

echo "🔐 Setting permissions..."
# Ensure Nginx can read the new build files
sudo chown -R ubuntu:www-data dist
sudo chmod -R 755 dist

echo "🧹 Clearing Nginx Cache (Optional but recommended)..."
sudo systemctl restart nginx

echo "✅ Deployment complete!"
pm2 status