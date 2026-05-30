# PROJECT_INTELLIGENCE_aimemory.md

## Project Purpose
aimemory (AI Memory OS) là một ứng dụng Android đóng vai trò như một "Bộ não thứ hai" (Second Brain) được hỗ trợ bởi trí tuệ nhân tạo chạy hoàn toàn ngoại tuyến (Offline-first). Dự án tự động ghi lại, phân loại và truy xuất các ký ức trong cuộc sống hàng ngày của người dùng, từ các cuộc đối thoại trực tiếp, tin nhắn chat, vị trí địa lý, cho đến ghi chú viết tay.

## Core Problem
Dự án giải quyết 2 nỗi sợ lớn nhất của con người thời hiện đại:
1. **Nỗi sợ quên lãng (Memory Decay)**: Con người tiếp nhận hàng nghìn thông tin mỗi ngày (giao dịch với khách hàng, lời hứa với người thân, ý tưởng vụt sáng) và quên đến 80% trong số đó.
2. **Nỗi sợ mất quyền riêng tư (Privacy Exposure)**: Các trợ lý ảo hiện tại (Google Assistant, Siri, các chatbot đám mây) bắt buộc phải gửi dữ liệu âm thanh và hành vi lên máy chủ cloud để xử lý, làm tăng nguy cơ rò rỉ dữ liệu cá nhân nhạy cảm. AI Memory OS đưa toàn bộ mô hình AI (Whisper, ONNX Runtime) xuống xử lý trực tiếp trên chip điện thoại (On-device AI) để bảo đảm an toàn thông tin tuyệt đối.

## Current Status
* **MVP / Active Development** (Ứng dụng Android chạy tốt phần core VAD + Whisper offline, backend đồng bộ dữ liệu SQLite đã hoạt động, đang tích hợp giao thức Model Context Protocol và Telegram Bridge).

## Key Features
- **Auto Audio Capture (VAD + Whisper.cpp)**: Sử dụng thuật toán Voice Activity Detection (VAD) siêu tiết kiệm pin để phát hiện khi có giọng nói, tự động ghi âm và chuyển đổi thành văn bản (Speech-to-Text) bằng mô hình whisper.cpp chạy offline.
- **Notification Spier**: Theo dõi và thu thập thông báo từ các ứng dụng nhắn tin phổ biến (Zalo, Messenger, Telegram, WhatsApp) để lưu trữ nội dung hội thoại quan trọng.
- **Natural Recall (Semantic Search)**: Cho phép người dùng tìm kiếm ký ức bằng ngôn ngữ tự nhiên thông qua mô hình nhúng văn bản MiniLM chạy bằng ONNX Runtime trực tiếp trên điện thoại (ví dụ: "Khách hàng nói gì về việc đổi pin hôm qua?").
- **Telegram Bridge & Bot Listener**: Một máy chủ cầu nối Python giúp người dùng tương tác, ghi nhận bộ nhớ từ xa hoặc gửi lệnh điều khiển thông qua bot Telegram bảo mật.
- **Model Context Protocol (MCP) Server**: Tích hợp giao thức MCP qua SSE giúp các LLM Agent bên ngoài có thể kết nối trực tiếp vào bộ não SQLite (`global_ai_brain.db`) để truy xuất bối cảnh thực tế của người dùng.

## Important Files
1. `README.md`: Tổng quan về kiến trúc offline-first, tính năng và tech stack.
2. `backend/server.js`: Máy chủ đồng bộ hóa dữ liệu quy mô lớn (59KB) chứa toàn bộ các API đồng bộ bộ nhớ, tìm kiếm vector, chatbot hỏi đáp và tích hợp MCP SSE.
3. `backend/test_mcp_sse.js`: Script thử nghiệm kết nối giao thức MCP qua server-sent events.
4. `scripts/telegram_bot_listener.py`: Script Python lắng nghe tin nhắn từ Telegram Bot gửi về hệ thống bộ nhớ.
5. `scripts/telegram_bridge.py`: Cầu nối truyền tải thông tin đồng bộ giữa thiết bị Android và Telegram Bot.
6. `build.gradle.kts` & `settings.gradle.kts`: Định nghĩa cấu hình project Kotlin Android và các module app/backend.

## Key Decisions
- **On-device AI**: Chấp nhận hy sinh tốc độ ban đầu để sử dụng whisper.cpp và ONNX MiniLM chạy offline trên chip ARM của điện thoại nhằm cam kết bảo mật 100%.
- **Encryption**: Sử dụng SQLCipher mã hóa cơ sở dữ liệu Room Database bằng AES-256-GCM kết hợp Android Keystore phần cứng để chống hack dữ liệu vật lý khi mất máy.
- **Architectural moats**: Tích hợp giao thức MCP (Model Context Protocol). Đây là quyết định mang tính chiến lược, biến bộ nhớ cá nhân thành một cổng API chuẩn hóa mà bất kỳ AI Agent nào (Gemini, Antigravity, Claude) cũng có thể đọc hiểu nếu được cấp quyền.

## Current Tasks
- Tối ưu hiệu năng của mô hình Whisper trên các dòng máy Android cấu hình trung bình để bảo đảm lượng pin tiêu thụ dưới 5% mỗi ngày.
- Hoàn thiện luồng tiến hóa tự động dựa trên phản hồi của người dùng thông qua endpoint `/api/feedback/evolve` trên backend.

## Open Questions
- Làm sao để xử lý tình trạng nhiễu âm thanh môi trường xung quanh (ambient noise) khiến VAD kích hoạt ghi âm nhầm liên tục gây hao pin và rác bộ nhớ?
- Việc dịch chuyển/phân tách ngữ cảnh hội thoại đa ngôn ngữ (Tiếng Việt pha tiếng Anh) của Whisper.cpp chạy offline đã thực sự mượt mà chưa?

## Risk Assessment
* **Technical Risks**: Nguy cơ hệ điều hành Android tự động kill các service chạy ngầm (Background Battery Optimization) của ứng dụng để tiết kiệm pin, làm gián đoạn tính năng auto-capture.
* **Product Risks**: Vấn đề pháp lý liên quan đến việc tự động ghi âm cuộc gọi/hội thoại trực tiếp mà không có sự đồng ý của đối phương (quy định pháp luật tùy quốc gia).
* **Missing Information**: Chưa có tài liệu chi tiết về dung lượng lưu trữ tăng trưởng trung bình mỗi ngày của file DB khi lưu trữ nhiều hội thoại âm thanh nén.

## Confidence Score
* **90%**  
* *Giải thích*: Có đầy đủ file README rõ ràng, mã nguồn backend Express (`server.js`) cực kỳ đầy đủ chứa toàn bộ logic API thực tế của hệ thống, cùng các file cầu nối Telegram/MCP cụ thể giúp suy luận chính xác hướng đi của sản phẩm.

---

## Project Understanding Score
* Artifact Coverage: 85%
* Decision Coverage: 92%
* Task Coverage: 88%
* Purpose Coverage: 95%
* **Overall Understanding Score: 90.00%**
