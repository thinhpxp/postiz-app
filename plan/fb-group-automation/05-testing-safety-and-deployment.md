# Phase 5: Kiểm thử An toàn, Xử lý Checkpoint & Triển khai Production

> **Mục tiêu:** Quy chuẩn an toàn khi thử nghiệm tài khoản Facebook, ma trận kiểm thử toàn diện cho cả **Trang cá nhân (Profile)** và **Hội nhóm (Groups)**, và quy trình đóng gói cập nhật lên máy chủ `post.thinhpxp.io.vn`.

---

## 1. Nguyên tắc An toàn Tuyệt đối khi Thử nghiệm

> [!CAUTION]
> **Không sử dụng tài khoản Facebook cá nhân chính để test kịch bản tự động hóa trong giai đoạn đầu!**
> Việc debug click sai selector hoặc reload trang nhiều lần có thể kích hoạt hệ thống bảo vệ tự động của Facebook.

1. **Sử dụng tài khoản phụ (Clone / Secondary Account):** Tạo hoặc dùng tài khoản clone đã tham gia vào các nhóm cần test.
2. **Thiết lập quyền riêng tư "Chỉ mình tôi" (Only Me) khi test Profile:** Khi đăng bài thử nghiệm lên trang cá nhân, bot sẽ ưu tiên chọn chế độ "Chỉ mình tôi" hoặc đăng vào một nhóm kín (Private Group) do tài khoản phụ tạo ra.
3. **Cài đặt tiện ích Cookie-Editor:** Dùng để xuất nhanh cookie đầy đủ (chứa `c_user`, `xs`, `datr`, `sb`, `fr`).

---

## 2. Ma trận Kiểm thử Toàn diện (Comprehensive Test Matrix)

| STT | Kịch bản kiểm thử | Hành vi kỳ vọng | Tiêu chuẩn Đạt (Pass) |
| :--- | :--- | :--- | :--- |
| **TC-01** | Kết nối Cookie hợp lệ | Bot mở Facebook, đọc được User ID, Name, Avatar | Hiển thị modal gồm cả Profile và danh sách Groups |
| **TC-02** | Kết nối Cookie hết hạn/sai | Bot phát hiện chuyển hướng `/login/` hoặc `/checkpoint/` | Báo lỗi rõ ràng trên UI: "Cookie không hợp lệ" |
| **TC-03** | Đăng bài lên **Trang cá nhân (Profile)** | Bot vào `facebook.com/me`, gõ nội dung, bấm Đăng | Bài xuất hiện trên Timeline cá nhân, Postiz báo Completed |
| **TC-04** | Đăng bài vào **Hội nhóm (Groups)** | Bot vào `facebook.com/groups/{id}`, gõ nội dung, bấm Đăng | Bài xuất hiện trong Nhóm |
| **TC-05** | Đăng bài kèm hình ảnh/video | Bot đính kèm file từ `/uploads`, chờ upload xong mới bấm Đăng | Bài đăng hiển thị đầy đủ hình ảnh trên Facebook |
| **TC-06** | Nhóm có chế độ duyệt bài | Bot bấm Đăng, phát hiện toast "Đang chờ phê duyệt" | Postiz ghi nhận trạng thái pending, không báo lỗi đỏ |
| **TC-07** | Đăng đồng thời Profile + 2 Groups | Temporal gửi các job lần lượt hoặc queue qua Browserless | Không xảy ra lỗi nghẽn, các bài đăng hoàn tất tuần tự |
| **TC-08** | Giới hạn RAM trên Server | Đo `docker stats postiz-browserless` trong lúc đăng | RAM không vượt quá **350MB**, về lại **~70MB** sau khi xong |
| **TC-09** | Đăng bài kèm **First Comment (Link dưới bình luận)** | Bot đăng bài chính xong -> Tự động chuyển qua đăng comment dưới bài đó | Bài chính hiển thị nội dung, comment hiển thị link/hashtag chuẩn |

---

## 3. Quy trình Đóng gói & Cập nhật Máy chủ Production

### Bước 1: Build Image trên máy Dev
```bash
# Build lại backend và frontend
pnpm build

# Tạo docker image
docker build -t postiz:slim-custom -f Dockerfile .
```

> [!IMPORTANT]
> Đảm bảo biến môi trường `NEXT_PUBLIC_BACKEND_URL` được định nghĩa chính xác thành `https://post.thinhpxp.io.vn/api` khi build Next.js.

### Bước 2: Cập nhật Cấu hình trên Server `sshh.thinhpxp.io.vn`
1. SSH vào server: `ssh thinhpxp@sshh.thinhpxp.io.vn`
2. Mở `/opt/postiz/docker-compose.yaml`, bổ sung service `browserless` (theo hướng dẫn tại [Phase 1](file:///home/thinhpxp/Documents/postiz-app/plan/fb-group-automation/01-browserless-infrastructure.md)).
3. Cập nhật `/opt/postiz/.env` thêm các biến `BROWSERLESS_*`.

### Bước 3: Khởi động lại Stack và Xác minh
```bash
cd /opt/postiz
docker compose pull browserless
docker compose down
docker compose up -d

# Kiểm tra trạng thái
docker compose ps
docker logs -f postiz-browserless
```
