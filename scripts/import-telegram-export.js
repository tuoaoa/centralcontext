const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Get project root path
const rootDir = path.resolve(__dirname, '..');

// Zero-dependency synchronous .env parser
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach(line => {
      // Ignore comments and empty lines
      if (line.trim().startsWith('#') || !line.includes('=')) return;
      const parts = line.split('=');
      const key = parts[0].trim();
      let value = parts.slice(1).join('=').trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    });
  }
}

// Load env
loadEnv();

const apiKey = process.env.CENTRAL_CONTEXT_API_KEY;
const port = process.env.PORT || 3000;
const apiUrl = `http://localhost:${port}/api/log/raw`;

if (!apiKey) {
  console.error('\x1b[31mError: CENTRAL_CONTEXT_API_KEY is not configured in .env\x1b[0m');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node scripts/import-telegram-export.js <path_to_telegram_export_json>');
  process.exit(0);
}

const filePath = path.resolve(args[0]);
if (!fs.existsSync(filePath)) {
  console.error(`\x1b[31mError: File not found at ${filePath}\x1b[0m`);
  process.exit(1);
}

// Helper to safely parse Telegram rich text structure
function parseTelegramText(text) {
  if (typeof text === 'string') {
    return text;
  }
  if (Array.isArray(text)) {
    return text.map(item => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object' && item.text) {
        return item.text;
      }
      return '';
    }).join('');
  }
  return '';
}

// Calculate SHA-256 hash
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Infers project name from chat title or path
function inferProject(chatTitle) {
  if (!chatTitle) return 'General';
  const lower = chatTitle.toLowerCase();
  if (lower.includes('claw') || lower.includes('openclaw')) return 'OpenClaw';
  if (lower.includes('hermes')) return 'Hermes';
  if (lower.includes('cental') || lower.includes('context')) return 'centalcontext';
  if (lower.includes('give') || lower.includes('get')) return 'GiveGet';
  if (lower.includes('savex') || lower.includes('save x')) return 'SaveX';
  if (lower.includes('rent') || lower.includes('xe') || lower.includes('thue')) return 'qlythuexe';
  if (lower.includes('aimemory') || lower.includes('memory')) return 'aimemory';
  return chatTitle;
}

// Classify message quality scores (Score 1-5)
function getQualityScore(text, msgType) {
  if (msgType !== 'message' || !text || text.length < 5) {
    return 1;
  }
  const lower = text.toLowerCase();
  
  // Score 5: Strategic plan / decision / long prompt / technical details
  const hasStrategicKeywords = lower.includes('prompt') || 
                                lower.includes('decision') || 
                                lower.includes('plan') || 
                                lower.includes('kế hoạch') || 
                                lower.includes('quyết định') || 
                                lower.includes('yêu cầu') || 
                                lower.includes('task') || 
                                lower.includes('todo') || 
                                lower.includes('mvp') || 
                                lower.includes('moat') || 
                                lower.includes('suy luận') ||
                                lower.includes('arch') ||
                                lower.includes('kiến trúc');
                                
  if (text.length > 200 || hasStrategicKeywords) {
    return 5;
  }
  return 3; // Standard technical/chat message
}

async function postLog(payload) {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, duplicated: !!data.duplicated };
    }
    return { success: false, error: `HTTP ${response.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log(`\x1b[36mReading Telegram export file from: ${filePath}\x1b[0m`);
  let data;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(fileContent);
  } catch (e) {
    console.error('\x1b[31mFailed to parse JSON file:', e.message, '\x1b[0m');
    process.exit(1);
  }

  const chatName = data.name || 'Telegram Chat';
  const chatId = data.id || 'unknown';
  const messages = data.messages || [];
  const project = inferProject(chatName);

  console.log(`Chat Name: "${chatName}" (ID: ${chatId})`);
  console.log(`Project Mapped: "${project}"`);
  console.log(`Total messages in export: ${messages.length}`);

  let successCount = 0;
  let dupCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // Parse message details
    const text = parseTelegramText(msg.text);
    if (!text || text.trim().length === 0) {
      skipCount++;
      continue; // Skip sticker/empty/system messages with no text content
    }

    const sender = msg.from || `User_${msg.from_id || 'unknown'}`;
    const timestamp = msg.date ? new Date(msg.date).toISOString() : new Date().toISOString();
    const messageId = msg.id;
    const replyTo = msg.reply_to_message_id || null;
    
    // Enforce 20KB limit
    let content = text;
    if (content.length > 20 * 1024) {
      content = content.substring(0, 20 * 1024) + '\n\n... [TRUNCATED 20KB LIMIT] ...';
    }

    const contentHash = sha256(content);
    const qualityScore = getQualityScore(content, msg.type);
    const memoryPriority = qualityScore >= 4 ? 'high' : 'useful';

    // Format metadata block cleanly
    const formattedContent = `[Metadata]
platform: telegram
source: telegram_export
chat_id: ${chatId}
chat_title: ${chatName}
message_id: ${messageId}
sender: ${sender}
timestamp: ${timestamp}
reply_to_message_id: ${replyTo}
content_hash: ${contentHash}
[End Metadata]

${content}`;

    const payload = {
      source: 'telegram_export',
      platform: 'telegram',
      project: project,
      type: 'telegram_message_backfill',
      quality_score: qualityScore,
      memory_priority: memoryPriority,
      content: formattedContent,
      content_hash: contentHash,
      file_name: `telegram_${chatId}_${messageId}.txt`,
      extension: '.txt',
      // Dynamic fields for JSONL spread
      chat_id: chatId,
      chat_title: chatName,
      sender_id: msg.from_id || null,
      sender_name: sender,
      message_id: messageId,
      timestamp: timestamp,
      reply_to_message_id: replyTo
    };

    const result = await postLog(payload);
    if (result.success) {
      if (result.duplicated) {
        dupCount++;
      } else {
        successCount++;
      }
    } else {
      errorCount++;
      console.error(`Failed to post message ID ${messageId}:`, result.error);
    }
  }

  console.log('\n\x1b[32m========== Telegram Backfill Complete ==========\x1b[0m');
  console.log(`Total Scanned:  ${messages.length}`);
  console.log(`Successfully Logged: ${successCount}`);
  console.log(`Deduplicated:   ${dupCount}`);
  console.log(`Skipped Empty:  ${skipCount}`);
  console.log(`Failed Posts:   ${errorCount}`);
}

main().catch(err => {
  console.error('Fatal import error:', err);
});
