# BROWSER_CAPTURE_TEST_PLAN (Browser Capture Verification Guide)

Tài liệu hướng dẫn lắp đặt, build và chạy thử nghiệm thực tế **CentralContext Browser Capture Extension** trên trình duyệt Chrome để kiểm chứng việc đồng bộ hóa dữ liệu chat tự động.

---

## 🛠️ Bước 1: Khởi tạo thư mục extension cục bộ

Chúng ta sẽ tạo một thư mục chuyên dụng chứa mã nguồn extension nằm ngay trong workspace để dễ dàng quản lý:

```bash
# Tạo thư mục extension
mkdir -p apps/browser-extension
```

Sau đó, sao chép 2 tệp tin sau từ tài liệu thiết kế [BROWSER_CAPTURE_ARCHITECTURE.md](file:///Users/tuoaoa/Tuoaoa/devflow/centalcontext/BROWSER_CAPTURE_ARCHITECTURE.md) vào thư mục mới:
1. Tạo tệp [apps/browser-extension/manifest.json](file:///Users/tuoaoa/Tuoaoa/devflow/centalcontext/apps/browser-extension/manifest.json) chứa cấu hình Manifest V3.
2. Tạo tệp [apps/browser-extension/content.js](file:///Users/tuoaoa/Tuoaoa/devflow/centalcontext/apps/browser-extension/content.js) chứa mã nguồn theo dõi DOM.

---

## 🔌 Bước 2: Hướng dẫn cài đặt Extension lên Google Chrome

1. Mở trình duyệt Chrome trên MacBook và truy cập địa chỉ: `chrome://extensions/`
2. Bật công tắc **Developer mode** (Chế độ nhà phát triển) ở góc trên cùng bên phải màn hình.
3. Bấm vào nút **Load unpacked** (Tải thư mục đã giải nén) ở góc trái màn hình.
4. Trỏ đường dẫn đến thư mục chứa extension vừa tạo:  
   `/Users/tuoaoa/Tuoaoa/devflow/centalcontext/apps/browser-extension`
5. Xác nhận extension **CentralContext Browser Capture** hiển thị thành công trong danh sách với trạng thái active (🟢 Kích hoạt).

---

## 🔍 Bước 3: Quy trình kiểm thử thực tế (Test execution)

### 1. Đảm bảo Server CentralContext đang chạy ngầm
* Kiểm tra xem máy chủ Express local có đang mở cổng 3000 không (đang chạy ngầm dưới ID `task-350`):
  ```bash
  # Lệnh kiểm tra port 3000 local
  curl -I http://localhost:3000
  ```

### 2. Kiểm thử với ChatGPT
1. Truy cập trang web: `https://chatgpt.com/`
2. Tạo một cuộc hội thoại mới và gõ câu hỏi:  
   `"CentralContext verification browser test. Hãy tóm tắt các tính năng chính của CentralContext."`
3. Nhận phản hồi từ ChatGPT Assistant.
4. Mở cửa sổ kiểm tra Console (F12) trên Chrome, lọc log để kiểm tra xem có dòng sau xuất hiện không:
   `"CentralContext Chat Capture Engine initialized."`

### 3. Kiểm thử với Gemini
1. Truy cập trang web: `https://gemini.google.com/`
2. Gõ câu hỏi kiểm thử:  
   `"Test đồng bộ bối cảnh trình duyệt sang CentralContext DB."`
3. Nhận phản hồi từ Gemini.

---

## 📊 Bước 4: Xác minh dữ liệu trong Raw Logs

Sau khi hoàn thành các câu hỏi trên trình duyệt, dữ liệu hội thoại bắt buộc phải được tự động truyền về máy chủ local và lưu trữ trọn vẹn. Chúng ta tiến hành xác minh qua 2 cách:

### Cách 1: Đọc tệp tin JSONL thô trong ngày
Mở file [data/raw/2026-05-30.jsonl](file:///Users/tuoaoa/Tuoaoa/devflow/centalcontext/data/raw/2026-05-30.jsonl) (hoặc file ngày hiện tại) và kiểm tra các dòng cuối cùng xem có các bản ghi có định dạng sau không:

```json
{
  "timestamp": "2026-05-30T14:15:30.123Z",
  "source": "browser_chat",
  "project": "centalcontext",
  "type": "ai_conversation_snapshot",
  "quality_score": 4,
  "memory_priority": "high",
  "file_name": "chatgpt_main_session.md",
  "extension": ".md",
  "content": "[Platform: CHATGPT] [Conversation ID: ...] [Role: USER]\n\nCentralContext verification browser test..."
}
```

### Cách 2: Truy vấn cơ sở dữ liệu SQLite Cache
Mở database SQLite và truy vấn trực tiếp bảng `raw_logs`:

```bash
sqlite3 data/centralcontext.db "SELECT timestamp, source, type, content FROM raw_logs WHERE source='browser_chat' ORDER BY timestamp DESC LIMIT 5;"
```
* **Kết quả mong đợi**: Trả về chính xác nội dung tin nhắn bạn vừa gõ và tin nhắn phản hồi của AI cùng mốc thời gian thực tế.
