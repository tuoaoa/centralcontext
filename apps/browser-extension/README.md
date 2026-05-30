# CentralContext Browser Capture Extension

This extension captures and syncs AI conversations from popular web platforms directly to your local **CentralContext** database.

## 🚀 Supported Platforms

- **ChatGPT**: `https://chatgpt.com/*`
- **Claude**: `https://claude.ai/*`
- **Gemini**: `https://gemini.google.com/*`

## 📦 How to Install

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select this folder: `apps/browser-extension/`.

## ⚙️ How it Works

- **Deduplication**: Uses SHA-256 hashing to make sure that duplicate messages are never synced twice.
- **Privacy-first**: Only transmits text payloads from the allowed platforms directly to your localhost server.
