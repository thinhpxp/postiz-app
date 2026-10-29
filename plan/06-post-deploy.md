# Giai Đoạn 5 — Vận Hành & Kiểm Tra End-to-End

## Mục Tiêu
Kiểm tra toàn bộ luồng hoạt động thực tế của Postiz từ trình duyệt qua domain `post.thinhpxp.io.vn`, giám sát tài nguyên tiêu thụ trên máy chủ và cung cấp tài liệu vận hành (Runbook).

---

## Phần A — Kiểm Tra Trực Tiếp Trên Trình Duyệt

Agent hướng dẫn người dùng thực hiện kiểm tra tính năng thực tế:

```
====================================================================
KIỂM TRA END-TO-END QUA TRÌNH DUYỆT (NGƯỜI DÙNG THỰC HIỆN)
====================================================================
1. Mở trình duyệt và truy cập: https://post.thinhpxp.io.vn
   → Mong đợi: Giao diện đăng ký / đăng nhập của Postiz hiển thị nhanh chóng.

2. Đăng ký tài khoản Quản trị viên (Admin) đầu tiên:
   → Điền Email và Mật khẩu quản trị.

3. Đăng nhập vào bảng điều khiển (Dashboard):
   → Mong đợi: Hiển thị đầy đủ menu Lịch đăng bài, Bài viết, Tích hợp.

4. Cấu hình mạng xã hội (Settings → Social Platforms):
   → Kết nối ít nhất 1 tài khoản (Facebook Page, X/Twitter, LinkedIn...).

5. Lập lịch đăng bài thử nghiệm:
   → Tạo 1 bài đăng và đặt giờ xuất bản sau 2 phút.
   → Chờ đến giờ hẹn và kiểm tra xem bài viết có tự động được đăng không.

6. Kiểm tra trung tâm thông báo (Notifications):
   → Mong đợi: Xuất hiện thông báo xuất bản bài viết thành công.
====================================================================
```

---

## Phần B — Giám Sát Máy Chủ Sau Khi Hoàn Tất Deploy

Tất cả các lệnh sau được thực hiện qua SSH tới server `sshh.thinhpxp.io.vn`:

### Bước 5.1 — Kiểm Tra Trạng Thái Các Container

```bash
ssh sshh.thinhpxp.io.vn "cd /opt/postiz && docker compose ps"
```

**Kết quả mong đợi:**
Tất cả các container đều ở trạng thái `Up`:
```
NAME                STATUS
postiz              Up X minutes
postiz-postgres     Up X minutes (healthy)
temporal            Up X minutes
```

---

### Bước 5.2 — Kiểm Tra Mức Chiếm Dụng Tài Nguyên (RAM & CPU)

```bash
ssh sshh.thinhpxp.io.vn "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'"
```

**Ngưỡng tài nguyên tiêu chuẩn của phiên bản Slim:**
- `postiz`: RAM ~350 MB – 500 MB (với giới hạn GC `NODE_OPTIONS=--max-old-space-size=512`)
- `postiz-postgres`: RAM ~40 MB – 100 MB
- `temporal`: RAM ~150 MB – 220 MB
- **Tổng RAM toàn bộ stack:** **~600 MB – 850 MB** (tiết kiệm hơn 60% so với cấu hình mặc định gốc của Postiz).

---

### Bước 5.3 — Kiểm Tra Dung Lượng Ổ Đĩa Thư Mục `/opt/postiz`

```bash
ssh sshh.thinhpxp.io.vn "df -h / && du -sh /opt/postiz/"
```

---

### Bước 5.4 — Xác Minh Các Dịch Vụ Khác Trên Server Không Bị Ảnh Hưởng

Đảm bảo các ứng dụng đang chạy trước đó trên server vẫn phản hồi tốt:

```bash
ssh sshh.thinhpxp.io.vn "
echo '=== Kiểm tra sapnhap-api (:3000) ==='
curl -o /dev/null -s -w 'sapnhap-api HTTP Status: %{http_code}\n' http://127.0.0.1:3000

echo '=== Kiểm tra SmartDraftingHub (:8080) ==='
curl -o /dev/null -s -w 'SmartDraftingHub HTTP Status: %{http_code}\n' http://127.0.0.1:8080

echo '=== Kiểm tra Ghost Portfolio (:2368) ==='
curl -o /dev/null -s -w 'Ghost HTTP Status: %{http_code}\n' http://127.0.0.1:2368
"
```

**Kết quả mong đợi:** Tất cả đều trả về mã HTTP `200` hoặc `301/302`.

---

## Phần C — Cẩm Nang Lệnh Vận Hành Thường Dùng (Runbook)

Cung cấp cho người dùng để quản lý hệ thống về sau:

```bash
# 1. Xem logs thời gian thực của backend
ssh sshh.thinhpxp.io.vn "docker exec postiz pm2 logs backend"

# 2. Xem logs thời gian thực của frontend Next.js
ssh sshh.thinhpxp.io.vn "docker exec postiz pm2 logs frontend"

# 3. Khởi động lại riêng tiến trình backend
ssh sshh.thinhpxp.io.vn "docker exec postiz pm2 restart backend"

# 4. Khởi động lại toàn bộ stack Postiz
ssh sshh.thinhpxp.io.vn "cd /opt/postiz && docker compose restart"

# 5. Dừng hệ thống Postiz
ssh sshh.thinhpxp.io.vn "cd /opt/postiz && docker compose down"

# 6. Sao lưu cơ sở dữ liệu PostgreSQL
ssh sshh.thinhpxp.io.vn "docker exec postiz-postgres pg_dump -U postiz-user postiz-db-local > /opt/postiz/backup_\$(date +%Y%m%d).sql"

# 7. Sao lưu toàn bộ thư mục dữ liệu qua rsync
sudo rsync -av /opt/postiz/postgres-data/ ~/backup/postiz-postgres-$(date +%Y%m%d)/
sudo rsync -av /opt/postiz/uploads/       ~/backup/postiz-uploads-$(date +%Y%m%d)/
```

---

## Phần D — Hướng Dẫn Xử Lý Sự Cố Thường Gặp (Troubleshooting)

### 1. Lỗi 502 Bad Gateway khi truy cập `post.thinhpxp.io.vn`
- Kiểm tra Nginx có đang lắng nghe: `ss -tlnp | grep :8087`
- Kiểm tra các tiến trình PM2 trong container: `docker exec postiz pm2 status`
- Nếu backend bị `errored`, xem log: `docker exec postiz pm2 logs backend --lines 50 --nostream`

### 2. Lỗi `ECONNREFUSED` hoặc từ chối kết nối Redis/Valkey
- Kiểm tra Valkey trên server có đang chạy: `ss -tlnp | grep :6379`
- Kiểm tra mật khẩu trong `/opt/postiz/.env` tại biến `REDIS_URL`
- Lưu ý định dạng: `redis://:<password>@host.docker.internal:6379/3`

### 3. Lỗi đăng bài mạng xã hội không chạy khi tới giờ hẹn
- Kiểm tra container Temporal có đang chạy: `docker ps | grep temporal`
- Kiểm tra PM2 orchestrator: `docker exec postiz pm2 logs orchestrator --lines 50 --nostream`

---

## Báo Cáo Nghiệm Thu Hoàn Thành

Khi tất cả các giai đoạn đã được xác nhận, Agent hoàn tất triển khai và thông báo:

```
====================================================================
🎉 TRIỂN KHAI POSTIZ PRODUCTION THÀNH CÔNG!
====================================================================
- Địa chỉ truy cập: https://post.thinhpxp.io.vn
- Thư mục quản lý trên server: /opt/postiz
- Cấu hình: Slim Postiz (Frontend + Backend + Temporal + Native Valkey DB 3)
- Cơ chế bảo trì: Tự động dọn dẹp notifications cũ sau 15 ngày
====================================================================
```
