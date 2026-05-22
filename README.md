# Google Dịch & Chat Bảo Mật

Ứng dụng web dịch thuật mượt mà, tích hợp phòng chat bảo mật ngụy trang và thông báo đẩy thông minh.

## 🚀 Tính Năng Nổi Bật
- **Google Translate Proxy**: Tốc độ dịch siêu nhanh thông qua kết nối trực tiếp đến Google Translate Web API & lưu bộ nhớ đệm (cache) tự động. Sử dụng Gemini 3.5 làm lớp dịch dự phòng khi cần thiết.
- **Phòng Chat Bí Mật**: Nhập mật mã bí ẩn để biến giao diện dịch thuật thành đoạn hội thoại bí mật riêng tư.
- **iOS Chime & Notification Banner**: Hỗ trợ âm thanh thông báo đẩy iOS và banner trượt xuống mô phỏng giao thức iOS nguyên bản cho người dùng sử dụng iPhone/iPad để bạn không bao giờ bỏ lỡ tin nhắn chưa xem.
- **Dọn Sạch Tức Thì**: Chế độ tự huỷ phòng chat bằng nút Panic xóa mọi vết tích cuộc trò chuyện ngay lập tức.

---

## 🛠 Hướng Dẫn Deploy Lên Vercel & GitHub

Dự án này được thiết kế và cấu trúc sẵn sàng để deploy lên **Vercel** thông qua **GitHub** mà không cần thay đổi bất cứ dòng code nào!

### Bước 1: Đẩy code lên GitHub cá nhân
1. Tạo một Repository mới trên GitHub của bạn (ví dụ: `google-translate-secret`).
2. Mở cửa sổ terminal trong thư mục code này và chạy các lệnh Git sau:
   ```bash
   git init
   git add .
   git commit -m "feat: chuẩn bị cấu trúc deploy Vercel"
   git branch -M main
   git remote add origin https://github.com/TÊN_GITHUB_CỦA_BẠN/TÊN_REPO.git
   git push -u origin main
   ```

### Bước 2: Deploy lên Vercel
1. Truy cập vào trang quản lý [Vercel](https://vercel.com/) và đăng nhập.
2. Nhấn nút **Add New** -> chọn **Project**.
3. Kết nối với tài khoản GitHub sở hữu repo của bạn, chọn repo vừa đẩy lên và nhấn **Import**.
4. **Cấu hình Biến Môi Trường (Environment Variables)**:
   Mở phần **Environment Variables** trong Vercel UI và thêm biến sau để bật dịch thuật thông minh dự phòng:
   - `GEMINI_API_KEY`: *Nhập API Key Gemini của bạn từ Google AI Studio.*
5. Nhấn nút **Deploy**. Vercel sẽ tự động:
   - Biên dịch tài nguyên giao diện động (Vite) thành dạng tĩnh chạy trên hệ thống CDN toàn cầu của Vercel cực kỳ mượt mà.
   - Nhận diện thư mục `/api/index.ts` và chạy Backend Express Server dưới dạng **Vercel Serverless Function** để xử lý các yêu cầu API an toàn mà không làm lộ API Key của bạn.

---

## 💻 Chạy Dưới Local
Để test hoặc chạy dự án trên máy tính cá nhân của bạn:

1. Cài đặt các thư viện liên quan:
   ```bash
   npm install
   ```
2. Thêm file `.env` ở thư mục gốc và cấu hình API Key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
3. Chạy môi trường phát triển (Development Mode):
   ```bash
   npm run dev
   ```
4. Build phiên bản tối ưu và chạy thử máy chủ cục bộ:
   ```bash
   npm run build
   npm start
   ```
