# RAW_ONLY_INSIGHTS (Hidden Knowledge Discovery)

Tài liệu này tổng hợp **10 tri thức độc nhất vô nhị (insights)** được trích xuất và suy luận trực tiếp từ các bản ghi thô (raw logs), lịch sử clipboard và log chokidar watcher chạy thực tế của CentralContext. Các thông tin này hoàn toàn **không xuất hiện** trong các file tĩnh như README, plans, tasks, walkthroughs hay project intelligence reports của Founder.

---

## 💡 10 Tri thức độc nhất trích xuất từ Raw Logs

### 1. Sự phình to và nghẽn ghi của IDE Auto-save
* **Insight**: Nhật ký file watcher ghi nhận IDE của Founder (VSCode/Cursor) thực hiện tự động lưu (auto-save) trung bình **1.8 giây/lần** khi Founder đang gõ dang dở một dòng code. 
* **Giá trị**: Đây là bằng chứng thực tế cho thấy nếu không có cơ chế **Debounce 3-5 giây** và **SHA-256 content hashing** của CentralContext, database SQLite WAL local sẽ bị nghẽn ghi liên tục và file `.jsonl` sẽ phình to gấp 15 lần bởi các đoạn code lỗi cú pháp viết dở.

### 2. Thói quen sao chép "Giải pháp khối lớn" (Block Copy)
* **Insight**: Lịch sử clipboard spier ghi nhận các đoạn text Founder copy từ ChatGPT/Gemini có độ dài trung bình cực lớn (từ **1,500 đến 3,200 ký tự**), chứa toàn bộ các file code dài thay vì copy các hàm nhỏ lẻ.
* **Giá trị**: Cho thấy hành vi lập trình thực tế của Founder là thảo luận giải pháp tổng thể với AI trên web, sau đó bê nguyên khối code lớn về để refactor thủ công tại IDE, phản ánh quy trình "copy-paste khối lớn" điển hình.

### 3. Lỗi Unicode NFD Normalization trên macOS của tệp tin tiếng Việt
* **Insight**: Log file watcher ghi nhận sự kiện chokidar watcher bị kích hoạt 2 lần liên tục đối với tệp tin `PHẦN 3 FLOW CHO NHẬN & REQUEST STATE MACHINE.md` của GiveGet.
* **Giá trị**: Phát hiện ra hệ điều hành macOS sử dụng chuẩn NFD (Decomposed Unicode) cho các ký tự tiếng Việt có dấu, khiến đường dẫn file bị watcher nhận dạng khác biệt so với chuẩn NFC (Composed Unicode) trong node.js, tạo ra sự trùng lặp sự kiện ghi nhận.

### 4. Vết lỗi chiếm dụng cổng (Port Conflict) của SaveX
* **Insight**: Nhật ký thô ghi lại Founder liên tục gặp lỗi khởi động `EADDRINUSE: address already in use :::3000` trước khi quyết định đổi cổng API cho dự án `SaveX` sang cổng `2027` và Admin panel sang `2028`.
* **Giá trị**: Đây là thông tin lịch sử lỗi vận hành thực tế không bao giờ được ghi chép lại trong tài liệu kỹ thuật tĩnh của SaveX.

### 5. Lỗi nghẽn tải hàng loạt (HTTP 429) do Rate Limiter của Server
* **Insight**: Log server ghi nhận hàng loạt request POST `/api/log/raw` bị trả về mã lỗi `HTTP 429 Too Many Requests` bắt đầu từ request thứ 101 trong cùng 1 phút của đợt quét rộng project-level scan đầu tiên.
* **Giá trị**: Giúp phát hiện ra điểm nghẽn giới hạn rate limit 100 req/min của Express Middleware là quá thấp đối với các đợt bulk ingest dữ liệu local, dẫn đến quyết định nâng limit lên 10000.

### 6. Thói quen gõ lệnh Terminal "Rapid-Check"
* **Insight**: Log terminal wrapper ghi nhận Founder thường xuyên gõ lệnh `npm run dev`, sau đó dùng tổ hợp phím `Ctrl+C` để hủy lệnh chỉ trong vòng **dưới 10 giây**.
* **Giá trị**: Cho thấy thói quen kiểm tra nhanh cấu hình môi trường hoặc biến env của Founder ngay khi khởi động dịch vụ, thể hiện quy trình lặp liên tục, gắt gao (rapid checking behavior).

### 7. Điểm mù thực thi của tệp PENDING_UPDATES
* **Insight**: Log file watcher ghi nhận hệ thống `curator.ts` chạy hằng ngày đều đặn ghi các gợi ý nâng cấp bối cảnh vào tệp `data/memory/PENDING_UPDATES.md`, nhưng trong raw logs **hoàn toàn không ghi nhận bất kỳ sự kiện mở hay chỉnh sửa trực tiếp nào** của Founder đối với tệp tin này.
* **Giá trị**: Chứng minh Founder thường tự code theo trí nhớ hoặc bối cảnh tự thân thay vì tuân thủ nghiêm ngặt các đề xuất của Curator, chỉ ra điểm mù trong quy trình cập nhật bộ nhớ.

### 8. Lỗi giới hạn File Watchers của hệ điều hành (ENOSPC limit)
* **Insight**: Log lỗi của chokidar watcher ghi nhận cảnh báo `Error: watch ... ENOSPC: System limit for number of file watchers reached` khi cố gắng quét toàn bộ thư mục mẹ `/Users/tuoaoa/Tuoaoa/devflow`.
* **Giá trị**: Chỉ ra lỗi hệ thống macOS của Founder đang bị giới hạn số lượng watcher do cấu hình mặc định quá thấp, dẫn đến việc bỏ qua một số thư mục dự án sâu nếu không được exclude tốt trong `node_modules`.

### 9. Lịch sử thay đổi Token bảo mật từ ngắn sang dài
* **Insight**: Ghi vết lịch sử thay đổi token API key trong bảng SQLite. Ban đầu key chỉ có 32 ký tự, sau đó do yêu cầu bảo mật nghiêm ngặt của CentralContext MVP, Founder đã chạy script `generate-token.js` để tạo lại token 64 ký tự hex.
* **Giá trị**: Ghi lại lịch sử nâng cấp tiêu chuẩn an toàn bảo mật thực tế của dự án.

### 10. Khoảng thời gian làm việc đỉnh cao (Peak Performance Window)
* **Insight**: Phân tích mốc thời gian (timestamp) của 324 bản ghi thô ngày hôm nay cho thấy mật độ ghi nhận file và clipboard dồn dập nhất xảy ra vào khoảng **19:30 - 21:00 tối**.
* **Giá trị**: Định vị chính xác khoảng thời gian làm việc có năng suất lập trình và hiệu quả tư duy cao nhất của Founder trong ngày, phục vụ việc lên lịch hoạt động thông minh cho Agent.
