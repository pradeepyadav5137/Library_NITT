#!/bin/bash
# Deployment script for AWS EC2

echo "Pulling latest code..."
git pull origin main

echo "Installing backend dependencies..."
cd backend
npm install --production

echo "Restarting backend..."
pm2 restart backend

echo "Building frontend..."
cd ../frontend
npm install
npm run build

echo "Setting permissions..."
sudo chmod -R 755 dist

echo "Restarting Nginx..."
sudo systemctl restart nginx

echo "Deployment complete!"
pm2 status
