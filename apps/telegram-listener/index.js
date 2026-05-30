const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Get project root path (2 levels up)
const rootDir = path.resolve(__dirname, '../..');

// Zero-dependency synchronous .env parser
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach(line => {
      if (line.trim().startsWith('#') || !line.includes('=')) return;
      const parts = line.split('=');
      const key = parts[0].trim();
      let value = parts.slice(1).join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    });
  }
}

// Load env
loadEnv();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const apiKey = process.env.CENTRAL_CONTEXT_API_KEY;
const port = process.env.PORT || 3000;
const apiUrl = `http://localhost:${port}/api/log/raw`;

console.log('\x1b[35m========== CentralContext Telegram Bot Live Capture ==========\x1b[0m');

if (!apiKey) {
  console.error('\x1b[31mError: CENTRAL_CONTEXT_API_KEY is not configured in .env\x1b[0m');
  process.exit(1);
}

if (!botToken) {
  console.warn('\x1b[33mWarning: TELEGRAM_BOT_TOKEN is not configured in .env.\x1b[0m');
  console.warn('\x1b[36mTo enable Live Telegram Capture:\x1b[0m');
  console.warn('1. Create a bot using @BotFather on Telegram.');
  console.warn('2. Add "TELEGRAM_BOT_TOKEN=your_token_here" to your .env file.');
  console.warn('3. Add your bot to your OpenClaw/Hermes chat group.');
  console.warn('\x1b[33mEntering idle standby mode...\x1b[0m\n');
  
  // Idle standby loop to prevent process termination (allows hot reload or dry runs)
  setInterval(() => {}, 60000);
  return;
}

const telegramUrl = `https://api.telegram.org/bot${botToken}`;
let lastUpdateOffset = 0;

// Helper to bhash SHA-256
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Check for sensitive credentials, phone numbers, or tokens
function isSensitive(text) {
  const lower = text.toLowerCase();
  
  // Token/Key regexes
  const hasToken = /bot[0-9]+:[a-zA-Z0-9_\-]+/.test(text) || 
                   /sk-[a-zA-Z0-9]{32,}/.test(text) ||
                   /[a-zA-Z0-9]{64}/.test(text); // potential API key
                   
  // Phone numbers regex
  const hasPhone = /\+?[0-9]{10,15}/.test(text);
  
  return hasToken || hasPhone;
}

// Mappings of chat titles to devflow projects
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

// Quality scoring for live chats
function getQualityScore(text) {
  if (!text || text.length < 5) return 1;
  const lower = text.toLowerCase();
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
                                lower.includes('suy luận');
                                
  if (text.length > 200 || hasStrategicKeywords) {
    return 5;
  }
  return 3;
}

async function postToCentralContext(payload) {
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

async function handleMessage(message) {
  if (!message) return;

  const text = message.text || message.caption || '';
  
  // 6. Bỏ qua sticker, binary, file, hoặc tin nhắn rác không có chữ
  if (!text || text.trim().length === 0) {
    return;
  }
  
  // Bỏ qua tin nhắn nhạy cảm (token, số điện thoại)
  if (isSensitive(text)) {
    console.log(`[Telegram Listener] Filtered message containing potential credentials/phone numbers.`);
    return;
  }

  const chatId = message.chat.id;
  const chatTitle = message.chat.title || 'Private Chat';
  const senderId = message.from.id;
  const senderName = message.from.first_name + (message.from.last_name ? ` ${message.from.last_name}` : '');
  const messageId = message.message_id;
  const timestamp = new Date(message.date * 1000).toISOString();
  const replyTo = message.reply_to_message ? message.reply_to_message.message_id : null;
  const project = inferProject(chatTitle);

  // Giới hạn 20KB
  let content = text;
  if (content.length > 20 * 1024) {
    content = content.substring(0, 20 * 1024) + '\n\n... [TRUNCATED 20KB LIMIT] ...';
  }

  const contentHash = sha256(content);
  const qualityScore = getQualityScore(content);
  const memoryPriority = qualityScore >= 4 ? 'high' : 'useful';

  // Format human-readable metadata block
  const formattedContent = `[Metadata]
platform: telegram
source: telegram_chat
chat_id: ${chatId}
chat_title: ${chatTitle}
message_id: ${messageId}
sender: ${senderName} (ID: ${senderId})
timestamp: ${timestamp}
reply_to_message_id: ${replyTo}
content_hash: ${contentHash}
[End Metadata]

${content}`;

  const payload = {
    source: 'telegram_chat',
    platform: 'telegram',
    project: project,
    type: 'telegram_message_live',
    quality_score: qualityScore,
    memory_priority: memoryPriority,
    content: formattedContent,
    content_hash: contentHash,
    file_name: `telegram_${chatId}_${messageId}.txt`,
    extension: '.txt',
    // Spread dynamic fields for JSONL
    chat_id: chatId,
    chat_title: chatTitle,
    sender_id: senderId,
    sender_name: senderName,
    message_id: messageId,
    timestamp: timestamp,
    reply_to_message_id: replyTo
  };

  console.log(`[Telegram Listener] Processing message ID ${messageId} from "${senderName}" in "${chatTitle}"`);
  
  const result = await postToCentralContext(payload);
  if (result.success) {
    if (result.duplicated) {
      console.log(`[Telegram Listener] Skip duplicate message: ${messageId}`);
    } else {
      console.log(`[Telegram Listener] Successfully synced message: ${messageId}`);
    }
  } else {
    console.error(`[Telegram Listener] Ingest failed:`, result.error);
  }
}

async function pollUpdates() {
  const url = `${telegramUrl}/getUpdates?offset=${lastUpdateOffset}&timeout=30`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Telegram Listener] Failed to get updates: HTTP ${response.status}`);
      setTimeout(pollUpdates, 5000);
      return;
    }
    const data = await response.json();
    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        lastUpdateOffset = update.update_id + 1;
        const message = update.message || update.edited_message;
        if (message) {
          await handleMessage(message);
        }
      }
    }
    setTimeout(pollUpdates, 1000);
  } catch (err) {
    console.error('[Telegram Listener] Connection polling error:', err.message || err);
    setTimeout(pollUpdates, 5000);
  }
}

console.log(`[Telegram Listener] Bot polling successfully initialized on origin: https://api.telegram.org`);
pollUpdates();
