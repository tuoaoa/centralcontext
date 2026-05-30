# BROWSER_CAPTURE_ARCHITECTURE (Web Chat Sync Design)

Tài liệu thiết kế kiến trúc hệ thống thu thập bối cảnh hội thoại AI của Founder trên các trình duyệt (ChatGPT, Gemini, Claude). Đây là mảnh ghép chiến lược để nâng tỷ lệ capture coverage tổng thể từ 38% lên trên 80%.

---

## 📊 1. Đánh giá 4 phương án thiết kế (Option Matrix)

| Tiêu Chí Đánh Giá | Option A: Clipboard Only | Option B: Chrome Extension (Khuyên Dùng) | Option C: Browser DOM Scraping | Option D: OCR / Screen Capture |
| :--- | :---: | :---: | :---: | :---: |
| **Độ khó hiện thực** | **1/5** (Thấp nhất) | **3/5** (Trung bình) | **4/5** (Khó) | **5/5** (Cực khó) |
| **Độ ổn định vận hành** | **5/5** (Tuyệt đối) | **4/5** (Rất cao) | **2/5** (Kém - Dễ bị chặn) | **3/5** (Trung bình) |
| **Bảo mật & Riêng tư** | **2/5** (Dễ lộ mật khẩu) | **4/5** (Rất tốt - Giới hạn host) | **3/5** (Trung bình) | **1/5** (Cực kỳ nguy hiểm) |
| **Chi phí Token / CPU** | **1/5** (Không đáng kể) | **1/5** (Rất thấp) | **2/5** (Trung bình) | **5/5** (Cực kỳ tốn kém) |
| **Chi phí bảo trì** | **1/5** (Gần như bằng 0) | **3/5** (Khi DOM đổi CSS) | **4/5** (Cập nhật driver) | **3/5** (Ổn định mô hình) |
| **Xếp hạng lựa chọn** | **HẠNG 3** (Dùng tạm) | **HẠNG 1 (TỐI ƯU NHẤT)** | **HẠNG 4 (LOẠI BỎ)** | **HẠNG 2 (FALLBACK)** |

### Phân tích phản biện
* **Option A (Clipboard only)**: Quá thụ động. Founder phải nhớ copy tin nhắn. Bỏ lỡ 90% luồng tư duy tự nhiên.
* **Option B (Chrome Extension)**: **Giải pháp tốt nhất**. Tự động chạy ngầm, không tốn tài nguyên, bắt chính xác tin nhắn của user và AI theo thời gian thực. Quyền riêng tư được bảo đảm bằng cách giới hạn extension chỉ hoạt động trên đúng 3 domain (`chatgpt.com`, `gemini.google.com`, `claude.ai`).
* **Option C (DOM Scraping via Playwright)**: Không thực tế cho môi trường chạy hàng ngày. Việc chạy debug port sẽ làm trình duyệt hoạt động bất thường, dễ kích hoạt cơ chế chống bot của Cloudflare khiến user liên tục phải giải mã Captcha.
* **Option D (OCR Screen Capture)**: Tốn CPU kinh khủng, làm MacBook nóng lên và hao pin nhanh. Ghi lại mọi thông tin nhạy cảm trên màn hình (mật khẩu, số dư ngân hàng, chat cá nhân) là thảm họa bảo mật. Chỉ dùng làm phương án cứu cánh cuối cùng cho các ứng dụng destop không có API/DOM.

---

## 🏗️ 2. Thiết kế Chrome Extension MVP (Manifest V3)

### A. Manifest File (`manifest.json`)
Sử dụng Manifest V3 bảo đảm hiệu năng tối ưu và bảo mật cao theo tiêu chuẩn hiện đại của Chrome:

```json
{
  "manifest_version": 3,
  "name": "CentralContext Browser Capture",
  "version": "1.0.0",
  "description": "Automatically syncs ChatGPT, Claude, and Gemini chats to CentralContext raw logs database.",
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://*.chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "http://localhost:3000/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://chatgpt.com/*",
        "https://*.chatgpt.com/*",
        "https://claude.ai/*",
        "https://gemini.google.com/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### B. Lõi Content Script (`content.js`)
Content script lắng nghe sự thay đổi của DOM bằng `MutationObserver` để tự động bắt các tin nhắn mới mà không gây lag trình duyệt:

```javascript
// Local cache to prevent duplication in single session
const capturedHashes = new Set();
const API_URL = 'http://localhost:3000/api/log/raw';
const API_KEY = '2578420fb040d51884e5c656b4bae6b2a2f594867749f24cefcaf01a95b683b3';

// Generate unique hash for deduplication
function generateHash(role, content) {
  let hash = 0;
  const str = role + content;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}

// Detect active platform from URL
function getPlatform() {
  const host = window.location.hostname;
  if (host.includes('chatgpt')) return 'chatgpt';
  if (host.includes('claude')) return 'claude';
  if (host.includes('gemini')) return 'gemini';
  return 'unknown';
}

// Post spied message back to local CentralContext server
async function postToCentralContext(role, content) {
  const platform = getPlatform();
  const convId = window.location.pathname.split('/').pop() || 'main_session';
  const hash = generateHash(role, content);

  if (capturedHashes.has(hash)) return; // Ignore local duplicates
  capturedHashes.add(hash);

  const payload = {
    source: 'browser_chat',
    type: 'ai_conversation_snapshot',
    project: 'centalcontext', // Default, daily curator will re-classify by keywords
    file_name: `${platform}_${convId}.md`,
    extension: '.md',
    quality_score: 4,
    memory_priority: 'high',
    content: `[Platform: ${platform.toUpperCase()}] [Conversation ID: ${convId}] [Role: ${role.toUpperCase()}]\n\n${content}`
  };

  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Fail silently in browser console
  }
}

// DOM Parsers for each platform
function scanDOM() {
  const platform = getPlatform();
  
  if (platform === 'chatgpt') {
    // ChatGPT DOM structure
    const messages = document.querySelectorAll('[data-message-author-role]');
    messages.forEach(msg => {
      const role = msg.getAttribute('data-message-author-role'); // 'user' | 'assistant'
      const textContainer = msg.querySelector('.markdown') || msg.querySelector('.whitespace-pre-wrap');
      if (textContainer) {
        postToCentralContext(role, textContainer.innerText.trim());
      }
    });
  } 
  
  else if (platform === 'claude') {
    // Claude DOM structure (messages are grouped by role styles)
    const userMessages = document.querySelectorAll('.font-user-message');
    userMessages.forEach(msg => {
      postToCentralContext('user', msg.innerText.trim());
    });
    const assistantMessages = document.querySelectorAll('.font-claude-message');
    assistantMessages.forEach(msg => {
      postToCentralContext('assistant', msg.innerText.trim());
    });
  } 
  
  else if (platform === 'gemini') {
    // Gemini DOM structure
    const userItems = document.querySelectorAll('.query-text');
    userItems.forEach(msg => {
      postToCentralContext('user', msg.innerText.trim());
    });
    const assistantItems = document.querySelectorAll('.message-content');
    assistantItems.forEach(msg => {
      postToCentralContext('assistant', msg.innerText.trim());
    });
  }
}

// Initialize MutationObserver to detect DOM shifts dynamically
const observer = new MutationObserver((mutations) => {
  let shouldScan = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldScan = true;
      break;
    }
  }
  if (shouldScan) {
    scanDOM();
  }
});

// Run initial scan on load and start observing
scanDOM();
observer.observe(document.body, { childList: true, subtree: true });
console.log('CentralContext Chat Capture Engine initialized.');
```
