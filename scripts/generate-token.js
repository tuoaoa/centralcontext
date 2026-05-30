const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateToken() {
  // Generate 32 bytes of secure random bytes, represented as a 64-character hex string
  return crypto.randomBytes(32).toString('hex');
}

function setupEnv() {
  const rootDir = path.resolve(__dirname, '..');
  const envPath = path.join(rootDir, '.env');
  const envExamplePath = path.join(rootDir, '.env.example');

  console.log('--- CentralContext Token Generator ---');

  const token = generateToken();
  console.log(`Generated secure token (64 characters):\n\x1b[36m${token}\x1b[0m\n`);

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      let exampleContent = fs.readFileSync(envExamplePath, 'utf8');
      const updatedContent = exampleContent.replace(
        'YOUR_SECURE_48_TO_64_CHAR_API_KEY_HERE_EXACTLY',
        token
      );
      fs.writeFileSync(envPath, updatedContent, 'utf8');
      console.log('\x1b[32mSuccessfully created .env file with your new secure API key!\x1b[0m');
      console.log('Keep this token secure. You will need it to sync with VPS.');
    } else {
      console.log('\x1b[31mError: .env.example not found. Please create .env manually.\x1b[0m');
    }
  } else {
    console.log('\x1b[33mNote: .env file already exists. Your existing API key was NOT overwritten.\x1b[0m');
    console.log(`You can copy the generated token above if you want to replace it manually.`);
  }
}

setupEnv();
