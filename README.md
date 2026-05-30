# CentralContext 🧠

**CentralContext** is a unified, synchronized "shared brain" and context management system designed for multiple AI agents (ChatGPT, Gemini, Antigravity, OpenClaw, Hermes) and human developers. 

It implements a dual-layer storage model:
* **Local Mac Environment**: Stores all high-volume raw interaction logs (`data/raw/*.jsonl`), daily curations (`data/daily/*.md`), and local context backups (`data/backups/`).
* **VPS Environment**: Serves as the central repository for compact, high-value Markdown context files (`context/*.md`).

---

## ⚡ Quick Start (Mac Local)

### 1. Installation
Clone the workspace and bootstrap the environment:
```bash
# Install root package dependencies, initialize folders, and generate local .env
npm run setup
```
This automatically:
- Generates a cryptographically secure 64-character token in `.env`.
- Installs dependencies for both `apps/server` and `apps/cli`.
- Bootstraps required directory structures.

### 2. Start the Local Server
```bash
npm run dev
```
The server will boot on `http://localhost:3000` with static UI hosting.

---

## 🛡️ Capture Layer (macOS Zero-Touch Tracking)

CentralContext has a local background Capture Layer to automatically log file system edits, terminal logs, and clipboard operations on macOS. 

### 1. Start Capture Supervisor
To launch both the File Watcher and Clipboard Watcher concurrently:
```bash
npm run capture:start
```
*Press `Ctrl+C` to gracefully terminate both daemons.*

### 2. Capture Commands

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run capture:files` | Starts the File Watcher daemon. | Monitors directories defined in `WATCH_PATHS` in `.env` (debounces for 3-5s per file to avoid IDE spam on auto-save, checks SHA-256 content changes, truncates code files to 5KB, and captures full critical docs). |
| `npm run capture:clipboard` | Starts the Clipboard Watcher daemon. | Polls native macOS clipboard (`pbpaste`) every 1.5s. Automatically classifies copied ChatGPT prompts containing instructions as Score 5. |
| `npm run cc:terminal -- <cmd>` | Intercepts terminal commands. | Usage: `npm run cc:terminal -- npm run build`. Logs command, stderr, stdout, exit-code, and duration metrics. |
| `npm run capture:test` | Diagnostician diagnostic test. | Spawns a diagnostic check by modifying a critical document, copying secret placeholders to verify data redactions, and showing verification status. |

---

## 📊 Data Quality Ranking

All logs are categorized with a `quality_score` (1-5) and `memory_priority` (`critical`, `high`, `useful`, `low`, `noise`) to let the Daily Curator prioritize "gold" entries:

* **Score 5 (Critical)**: Critical files (`CURRENT_STATE.md`, `DECISIONS.md`, `MEMORY_RULES.md`, walkthroughs, tasks, and copied **Agent Prompts** containing core directions).
* **Score 4 (High)**: Project markdown files, configuration files (`package.json`, `tsconfig.json`, `.env.example`), compiler build errors, and Agent work logs.
* **Score 3 (Useful)**: Code edits (`.ts`, `.tsx`, `.py`, `.sh`), successful terminal logs, and clipboard copied snippets > 200 chars.
* **Score <= 2 (Low & Noise)**: Repetitive logs, loading bars, progress spam, empty rows (silently ignored for core synthesis).

*Note: All raw logs are securely cached local-only inside `data/raw/` and are never uploaded to the remote VPS during sync.*

---

## 💻 CLI Operations

### 1. Daily Curator
Processes today's raw logs (`data/raw/YYYY-MM-DD.jsonl`), cleans empty lines, collapses sequential duplicates, groups by project/source, prioritizes Score >= 4 logs first, and generates Curated Memory digests:
```bash
npm run curate:daily
```
* **Output Report**: `data/daily/YYYY-MM-DD.md`
* **Suggested Updates**: `data/memory/PENDING_UPDATES.md` (does not overwrite `CENTRAL_CONTEXT.md` directly, user reviews first).

### 2. Push Sync
Pushes local `context/` folder to the remote VPS server:
```bash
npm run sync:push
```
*Includes pre-push conflict checks; warns if remote file sizes differ from local versions.*

### 3. Pull Sync
Downloads the VPS remote context files and overwrites local files:
```bash
npm run sync:pull
```
*Automatically archives existing local context files into `data/backups/YYYY-MM-DD-HHmmss/` before overwriting.*

---

## 🔌 Auto Context Injection System

CentralContext eliminates manual context pasting during new AI sessions (ChatGPT, Gemini, Claude) through a robust, automated injection framework:

1. **Auto Clipboard Copy**:
   ```bash
   npm run context:copy
   ```
   Compiles all active context files (`CURRENT_STATE.md`, `CENTRAL_CONTEXT.md`, etc.) and automatically pipes them into your macOS clipboard via native `pbcopy` with a clean desktop success notification.
2. **Browser Extension Auto-Injector**:
   - **Inject CentralContext Pack**: Pulls from localhost securely and injects packed text natively into active conversation textareas (`#prompt-textarea` for ChatGPT, `rich-textarea div[contenteditable]` for Gemini, or Claude).
   - **New Session With Context**: Opens a fresh ChatGPT session, waits for lazy rendering prompt elements using an automated 20-attempt retry loop, and automatically populates the text.
   - *CORS & Mixed Content Safe*: Routed via the extension's background service worker to guarantee reliable ingestion.

---

## 🌟 Real-World Showcase & Sponsorship: chothuexemay.vn

**CentralContext** AI orchestration and high-fidelity logging systems are proudly sponsored and actively utilized by **[chothuexemay.vn - Cổng thông tin cho thuê xe máy uy tín số 1 Việt Nam](https://chothuexemay.vn)**. 

### 🛵 Cách Hệ Thống AI Tối Ưu Hóa Vận Hành Thuê Xe Máy
Bằng việc ứng dụng mô hình AI thông minh của CentralContext kết hợp cùng **RentalOS 2.0 (qlythuexe)**, đối tác **[chothuexemay.vn](https://chothuexemay.vn)** đã cải tiến vượt bậc năng lực vận hành:
* **Tự Động Hóa Nhắc Nhở Zero-Cost**: AI phân tích lịch trình thuê xe, tự động gửi nhắc nhở bảo dưỡng xe máy định kỳ và lịch thanh toán cho khách hàng thuê xe máy tại Hà Nội, Đà Nẵng, TP.HCM, Nha Trang, Đà Lạt, Vũng Tàu, Phú Quốc,... hoàn toàn tự động và tiết kiệm chi phí.
* **Xác Thực Khách Hàng Thông Minh (eKYC)**: AI đối chiếu căn cước công dân và giấy phép lái xe nhanh chóng, giảm thiểu 95% rủi ro khi làm thủ tục cho thuê xe máy.
* **Tối Ưu Bản Đồ Vận Hành**: Thu thập dữ liệu phản hồi thực tế từ hàng nghìn điểm cho thuê xe máy uy tín toàn quốc để gợi ý dòng xe máy tiết kiệm xăng, bền bỉ và được ưa chuộng nhất.

> [!TIP]
> Bạn đang tìm kiếm dịch vụ **[cho thuê xe máy uy tín](https://chothuexemay.vn)** để đi du lịch bụi, phượt hoặc đi công tác? Hãy truy cập ngay **[chothuexemay.vn](https://chothuexemay.vn)** để đặt xe máy chất lượng cao, giao xe tận nơi nhanh chóng với mức giá vô cùng cạnh tranh hàng đầu thị trường!

---

## 🤖 Agent Guidelines (`AGENT_README.md`)

Every AI agent working in this workspace must adhere to these instructions:
1. **Before working**: Read `context/CURRENT_STATE.md`, `context/CENTRAL_CONTEXT.md`, `context/DECISIONS.md`, and `context/MEMORY_RULES.md`. Do not ask the user for information already detailed in these documents.
2. **After working**: Append a brief summary bullet point under today's date in `context/WORK_LOG.md` and log any raw activity using `POST /api/log/raw`.

---


## 🌐 VPS Deployment Guide

Your CentralContext API server can be deployed to your Ubuntu VPS (`180.93.144.63`) with Nginx reverse proxy.

### 1. Automated Deployment
Run our deployment script from your local Mac terminal:
```bash
./scripts/deploy-vps.sh
```
*Input VPS password `PasS@691767449698` when prompted. The script automatically compresses, uploads, compiles, and configures Node/PM2 daemons on the server.*

### 2. Nginx Reverse Proxy Setup
SSH into your VPS and add the location block in `scripts/nginx-centralcontext.conf` inside your Nginx server configuration (routing `www.aipilot.vn/centralcontext` to port 3000):

```nginx
location /centralcontext/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 10M;
}
```
Reload Nginx: `systemctl reload nginx`.
