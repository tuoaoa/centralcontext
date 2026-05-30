import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// 1. Config loading from project root
const rootDir = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(rootDir, '.env') });

const apiKey = process.env.CENTRAL_CONTEXT_API_KEY;
const vpsUrl = process.env.VPS_URL;

if (!apiKey || apiKey.length < 48) {
  console.error('\x1b[31mError: API key is not configured or too short (minimum 48 chars) in .env.\x1b[0m');
  process.exit(1);
}

if (!vpsUrl) {
  console.error('\x1b[31mError: VPS_URL is not configured in .env.\x1b[0m');
  process.exit(1);
}

const contextDir = path.join(rootDir, 'context');
const backupDirRoot = path.join(rootDir, 'data/backups');

const allowedFiles = [
  'CENTRAL_CONTEXT.md',
  'CURRENT_STATE.md',
  'DECISIONS.md',
  'ACTIVE_PROJECTS.md',
  'DAILY_SUMMARY.md',
  'WORK_LOG.md'
];

// Helper to create a backup folder before pull overwrite
function createLocalBackup(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const timestamp = `${dateStr}-${timeStr}`;
  
  const backupFolder = path.join(backupDirRoot, timestamp);
  
  if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder, { recursive: true });
  }

  if (fs.existsSync(contextDir)) {
    const files = fs.readdirSync(contextDir);
    files.forEach(file => {
      if (allowedFiles.includes(file)) {
        fs.copyFileSync(path.join(contextDir, file), path.join(backupFolder, file));
      }
    });
  }
  
  return timestamp;
}

// 2. Action: Pull VPS context files
async function pullContext() {
  console.log(`Pulling central context from VPS: ${vpsUrl}...`);
  
  try {
    const response = await fetch(`${vpsUrl}/api/sync/pull`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned status ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { files: Record<string, string> };
    
    // Create safety backup of local context before overwriting
    const backupId = createLocalBackup();
    console.log(`\x1b[32m✔ Local backup archived to data/backups/${backupId}\x1b[0m`);

    // Write pulled context files
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    Object.keys(data.files).forEach(file => {
      if (allowedFiles.includes(file)) {
        fs.writeFileSync(path.join(contextDir, file), data.files[file], 'utf8');
        console.log(`  Downloaded: ${file}`);
      }
    });

    console.log('\x1b[32m✔ Sync Pull completed successfully!\x1b[0m');
  } catch (error: any) {
    console.error('\x1b[31mSync Pull failed:\x1b[0m', error.message || error);
    process.exit(1);
  }
}

// 3. Action: Push local context files to VPS
async function pushContext() {
  console.log(`Pushing central context to VPS: ${vpsUrl}...`);

  try {
    // 3a. Conflict Check: Retrieve remote contents to verify changes
    const checkResponse = await fetch(`${vpsUrl}/api/sync/pull`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey
      }
    });

    if (checkResponse.ok) {
      const remoteData = (await checkResponse.json()) as { files: Record<string, string> };
      
      // Perform conflict detection (compare sizes or checksum tags)
      let conflictWarning = false;
      
      Object.keys(remoteData.files).forEach(file => {
        const localPath = path.join(contextDir, file);
        if (fs.existsSync(localPath)) {
          const localSize = fs.statSync(localPath).size;
          const remoteSize = remoteData.files[file].length;
          
          // Simple heuristic conflict alert: if file size differs substantially and local hasn't updated
          // Or if the remote file contains updates we don't have
          const localContent = fs.readFileSync(localPath, 'utf8');
          if (localContent !== remoteData.files[file]) {
            // Check if local has been updated recently (within 2 mins)
            const localMtime = fs.statSync(localPath).mtimeMs;
            const now = Date.now();
            
            // If local file is OLDER than remote data check, warn the developer of potential overwrite
            if (now - localMtime > 300 * 1000) {
              console.log(`\x1b[33m⚠ Warning: File '${file}' on remote VPS has different contents. Your local changes may overwrite remote edits.\x1b[0m`);
              conflictWarning = true;
            }
          }
        }
      });

      if (conflictWarning) {
        console.log('\x1b[33mPlease resolve differences or double check files before pushing.\x1b[0m');
      }
    }
  } catch (e) {
    console.log('\x1b[90mNote: Skipping pre-push conflict check (could not reach VPS server or pull endpoint).\x1b[0m');
  }

  // 3b. Compile local context package
  if (!fs.existsSync(contextDir)) {
    console.error('\x1b[31mError: Local context directory does not exist. Cannot push.\x1b[0m');
    process.exit(1);
  }

  const filesMap: Record<string, string> = {};
  const localFiles = fs.readdirSync(contextDir);

  localFiles.forEach(file => {
    if (allowedFiles.includes(file)) {
      filesMap[file] = fs.readFileSync(path.join(contextDir, file), 'utf8');
    }
  });

  if (Object.keys(filesMap).length === 0) {
    console.error('\x1b[31mError: No valid context files found in local context/ directory to push.\x1b[0m');
    process.exit(1);
  }

  // 3c. Send payload to VPS
  try {
    const response = await fetch(`${vpsUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: filesMap })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned status ${response.status}: ${errorText}`);
    }

    const resData = (await response.json()) as { success: boolean, backup: string };
    console.log(`\x1b[32m✔ Context successfully pushed to VPS!\x1b[0m`);
    console.log(`\x1b[32m✔ VPS safety backup created as: data/backups/${resData.backup}\x1b[0m`);
  } catch (error: any) {
    console.error('\x1b[31mSync Push failed:\x1b[0m', error.message || error);
    process.exit(1);
  }
}

// 4. Command Router
const action = process.argv[2];

if (action === 'push') {
  pushContext();
} else if (action === 'pull') {
  pullContext();
} else {
  console.log('Usage: npm run sync:push OR npm run sync:pull');
  process.exit(1);
}
