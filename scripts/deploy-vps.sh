#!/bin/bash

# ==========================================================================
# CentralContext VPS Automated Deployment Script
# Target: Ubuntu 22.04 (Megahost.1767449698)
# IP: 180.93.144.63 | Port: 38472 | User: root
# Password: PasS@691767449698
# ==========================================================================

set -e

VPS_IP="180.93.144.63"
VPS_PORT="38472"
VPS_USER="root"
TARGET_DIR="/root/centralcontext"

echo -e "\x1b[36m========== CentralContext VPS Deployer ==========\x1b[0m"
echo -e "Target VPS: \x1b[33m${VPS_USER}@${VPS_IP}:${VPS_PORT}\x1b[0m"
echo -e "VPS Password: \x1b[32mPasS@691767449698\x1b[0m (Please copy this for the prompts below)"
echo -e "=================================================\n"

# 1. Packaging Project Files (excluding heavy logs and node_modules)
echo -e "\x1b[34m[1/4] Packaging project files locally...\x1b[0m"
TEMP_TAR="centralcontext.tar.gz"

tar --exclude="node_modules" \
    --exclude="dist" \
    --exclude="data/raw" \
    --exclude="data/backups" \
    --exclude=".env" \
    --exclude=".git" \
    --exclude="${TEMP_TAR}" \
    -czf "${TEMP_TAR}" -C .. .

echo -e "\x1b[32m✔ Packaging completed: ${TEMP_TAR}\x1b[0m"

# 2. Creating Remote Dir & Copying File to VPS
echo -e "\x1b[34m[2/4] Uploading archive to VPS (Enter password when prompted)...\x1b[0m"
ssh -p ${VPS_PORT} ${VPS_USER}@${VPS_IP} "mkdir -p ${TARGET_DIR}"
scp -P ${VPS_PORT} "${TEMP_TAR}" ${VPS_USER}@${VPS_IP}:${TARGET_DIR}/

echo -e "\x1b[32m✔ Upload completed successfully!\x1b[0m"

# 3. Extracting and Building on VPS
echo -e "\x1b[34m[3/4] Extracting files and compiling on VPS (Enter password when prompted)...\x1b[0m"
ssh -p ${VPS_PORT} ${VPS_USER}@${VPS_IP} "
  cd ${TARGET_DIR}
  tar -xzf ${TEMP_TAR}
  rm ${TEMP_TAR}
  
  echo 'Installing root dependencies...'
  npm install
  
  echo 'Setting up server...'
  cd apps/server
  npm install
  npm run build
  
  echo 'Setting up CLI...'
  cd ../cli
  npm install
  npm run build
"

# 4. Copying Env template & starting the server on VPS
echo -e "\x1b[34m[4/4] Starting API Server on VPS (Enter password when prompted)...\x1b[0m"
ssh -p ${VPS_PORT} ${VPS_USER}@${VPS_IP} "
  cd ${TARGET_DIR}
  
  # Configure remote .env if not exists
  if [ ! -f .env ]; then
    echo 'Creating remote .env configuration...'
    cp .env.example .env
    # Generate secure 64-char token for VPS
    SECURE_TOKEN=\$(node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")
    sed -i \"s/YOUR_SECURE_48_TO_64_CHAR_API_KEY_HERE_EXACTLY/\$SECURE_TOKEN/g\" .env
    sed -i \"s/NODE_ENV=development/NODE_ENV=production/g\" .env
  fi

  # Extract configured remote token to print
  VPS_TOKEN=\$(grep CENTRAL_CONTEXT_API_KEY .env | cut -d '=' -f2)

  echo 'Starting CentralContext using PM2 or background Node.js process...'
  if command -v pm2 &> /dev/null; then
    pm2 delete centralcontext &> /dev/null || true
    pm2 start apps/server/dist/index.js --name \"centralcontext\"
    pm2 save
    echo '✔ Server started successfully via PM2.'
  else
    echo 'Installing PM2 globally for production process management...'
    npm install -g pm2
    pm2 start apps/server/dist/index.js --name \"centralcontext\"
    pm2 save
    echo '✔ Server started successfully via PM2.'
  fi

  echo '---------------------------------------------------------'
  echo -e 'VPS Server Running on: \x1b[32mhttp://localhost:3000\x1b[0m'
  echo -e 'VPS API Key (Save this!): \x1b[36m'\$VPS_TOKEN'\x1b[0m'
  echo '---------------------------------------------------------'
"

# Clean up local package archive
rm -f "${TEMP_TAR}"

echo -e "\n\x1b[32m✔ VPS Deployment process completed successfully!\x1b[0m"
echo -e "Make sure to configure Nginx to route \x1b[33mwww.aipilot.vn/centralcontext\x1b[0m to port 3000."
