# Kế hoạch chi tiết: Deploy & Verification (Phase 3)

> **Tệp:** `plan/dynamic-bot-selector/03-deploy-verify.md`  
> **Mục tiêu:** Hướng dẫn từng bước cách triển khai các thay đổi lên máy chủ sản xuất `sshh.thinhpxp.io.vn`, xử lý an toàn tiến trình PM2, và thực hiện quy trình kiểm thử toàn diện (End-to-End Testing).

---

## 1. Danh sách tệp cần đồng bộ lên máy chủ

| STT | Đường dẫn cục bộ | Vị trí trong Container `postiz` |
|:---:|---|---|
| 1 | `libraries/nestjs-libraries/src/integrations/social/browser-bot/facebook.adapter.ts` | `/app/libraries/nestjs-libraries/src/integrations/social/browser-bot/facebook.adapter.ts` |
| 2 | `libraries/nestjs-libraries/src/integrations/social/facebook.personal.provider.ts` | `/app/libraries/nestjs-libraries/src/integrations/social/facebook.personal.provider.ts` |
| 3 | `apps/backend/src/api/routes/integrations.controller.ts` | `/app/apps/backend/src/api/routes/integrations.controller.ts` |
| 4 | `apps/frontend/src/components/launches/bot.config.modal.tsx` | `/app/apps/frontend/src/components/launches/bot.config.modal.tsx` |
| 5 | `apps/frontend/src/components/launches/menu/menu.tsx` | `/app/apps/frontend/src/components/launches/menu/menu.tsx` |

---

## 2. Quy trình đồng bộ & Biên dịch trên Server

### Bước 2.1: Đồng bộ mã nguồn từ máy local lên server
Sử dụng SSH/rsync hoặc copy từng file qua Docker:
```bash
# Ví dụ copy từ máy local lên server thông qua Cloudflare SSH:
scp -o ProxyCommand="cloudflared access ssh --hostname %h" \
  libraries/nestjs-libraries/src/integrations/social/browser-bot/facebook.adapter.ts \
  thinhpxp@sshh.thinhpxp.io.vn:/tmp/facebook.adapter.ts

ssh sshh.thinhpxp.io.vn "docker cp /tmp/facebook.adapter.ts postiz:/app/libraries/nestjs-libraries/src/integrations/social/browser-bot/facebook.adapter.ts"
```
*(Lặp lại cho các tệp còn lại trong danh sách)*

### Bước 2.2: Build các gói bên trong container `postiz`
Thực thi lệnh theo thứ tự phụ thuộc:
```bash
ssh sshh.thinhpxp.io.vn 'docker exec postiz bash -c "
  set -e
  echo \"==> 1. Build nestjs-libraries...\"
  NODE_OPTIONS=\"--max-old-space-size=4096\" pnpm --filter @gitroom/nestjs-libraries run build

  echo \"==> 2. Build backend...\"
  NODE_OPTIONS=\"--max-old-space-size=4096\" pnpm --filter postiz-backend run build

  echo \"==> 3. Build orchestrator...\"
  NODE_OPTIONS=\"--max-old-space-size=4096\" pnpm --filter postiz-orchestrator run build

  echo \"==> 4. Build frontend Next.js...\"
  NODE_OPTIONS=\"--max-old-space-size=4096\" pnpm --filter postiz-frontend run build
"'
```

### Bước 2.3: Khởi động lại dịch vụ an toàn (Tránh lỗi EADDRINUSE)
Quy trình restart triệt để không bị orphan node process:
```bash
ssh sshh.thinhpxp.io.vn 'docker exec postiz bash -c "
  # Dừng PM2
  pm2 stop all || true

  # Quét và dọn các PID mồ côi chiếm port 3000, 3002, 4200
  fuser -k 3000/tcp || true
  fuser -k 3002/tcp || true
  fuser -k 4200/tcp || true

  # Khởi động lại
  pm2 restart all
  pm2 status
"'
```

---

## 3. Quy trình Kiểm thử & Nghiệm thu (Verification Protocol)

### Test Case 1: Kiểm tra API đọc cấu hình mặc định (GET)
- **Lệnh kiểm tra:**
  ```bash
  curl -s -X GET "https://post.thinhpxp.io.vn/api/integrations/cmwabvrmb0003nu6ygywgx04z/bot-config" \
    -H "Cookie: <user_session_cookie>"
  ```
- **Kỳ vọng:**
  - HTTP Status: `200 OK`.
  - JSON trả về có trường `defaults` chứa đầy đủ 10 selector mặc định và trường `custom: {}`.

### Test Case 2: Kiểm tra API cập nhật cấu hình tùy biến (PUT)
- **Lệnh kiểm tra:**
  ```bash
  curl -s -X PUT "https://post.thinhpxp.io.vn/api/integrations/cmwabvrmb0003nu6ygywgx04z/bot-config" \
    -H "Content-Type: application/json" \
    -H "Cookie: <user_session_cookie>" \
    -d '{"botConfig": {"profileFeedBox": "[role=\"button\"][aria-label*=\"Bạn đang nghĩ gì\"]"}}'
  ```
- **Kỳ vọng:**
  - HTTP Status: `200 OK`.
  - Gọi lại GET bot-config thấy trường `custom.profileFeedBox` lưu đúng giá trị vừa truyền.

### Test Case 3: Kiểm tra giao diện người dùng (UI Modal)
1. Đăng nhập vào dashboard web `https://post.thinhpxp.io.vn`.
2. Tại danh sách Channel bên trái, tìm kênh **Facebook Profile** (`thinhpxp`).
3. Click vào biểu tượng menu ba chấm `...`.
4. Xác nhận mục **"Cấu hình DOM Selector"** xuất hiện với icon Robot.
5. Click mở modal:
   - Form hiển thị đầy đủ 3 nhóm trường.
   - Placeholder hiển thị giá trị mặc định hệ thống.
   - Nhập thử một selector tùy biến và bấm **"Lưu cấu hình"**.
   - Kiểm tra thông báo Toast: *"Đã lưu cấu hình Bot Selector thành công!"*.
   - Mở lại modal để đảm bảo giá trị đã được giữ nguyên.
   - Thử bấm **"Khôi phục tất cả về mặc định"** và xác nhận form được reset sạch sẽ.

### Test Case 4: Kiểm thử End-to-End đăng bài kèm First Comment
1. Tạo một bài viết thử nghiệm đặt lịch sau 1 phút vào kênh `cmwabvrmb0003nu6ygywgx04z` với First Comment.
2. Theo dõi logs container:
   ```bash
   ssh sshh.thinhpxp.io.vn "docker exec postiz pm2 logs orchestrator --lines 50"
   ```
3. Xác nhận trong logs:
   - Bot khởi động browserless thành công.
   - Bot nạp selector động (nếu có tùy biến) hoặc fallback về selector mặc định.
   - Trạng thái bài viết chuyển sang `PUBLISHED`.
   - Trạng thái First Comment chuyển sang `PUBLISHED`.

---

## 4. Đóng băng & Lưu trữ Image Docker sau khi hoàn tất

Sau khi tất cả test case trên đạt 100%, thực hiện commit image để lưu trạng thái bền vững:
```bash
ssh sshh.thinhpxp.io.vn "docker commit -p=false postiz postiz:slim-custom"
```
Đảm bảo container `postiz:slim-custom` ghi nhận layer mới với SHA256 thành công.

