# Giai Đoạn 4 — Khởi Động & Xác Minh Hệ Thống

## Mục Tiêu
Khởi chạy toàn bộ stack Postiz từ thư mục `/opt/postiz` trên server production, kiểm tra chi tiết các tiến trình PM2, kết nối cơ sở dữ liệu, Valkey và endpoint nội bộ.

---

## Môi Trường Thực Hiện: MÁY CHỦ ONLINE (`sshh.thinhpxp.io.vn`)
> Tất cả các bước sau được thực hiện qua kết nối SSH tới server `sshh.thinhpxp.io.vn`.

```bash
ssh sshh.thinhpxp.io.vn
cd /opt/postiz
```

---

### Bước 4.1 — Kiểm Tra Tiền Trạm Lần Cuối (Pre-flight Check)

Đảm bảo đầy đủ các tệp cấu hình và thư mục tại `/opt/postiz/`:

```bash
cd /opt/postiz
ls -la /opt/postiz/
```
*Phải có:* `docker-compose.yml`, `.env`, `dynamicconfig/`, `postgres-data/`, `uploads/`.

Kiểm tra tệp `.env` không còn placeholder:
```bash
grep "FILL_ME" /opt/postiz/.env && echo "LỖI: Chưa điền hết FILL_ME!" || echo "OK: .env đã sẵn sàng"
```

Kiểm tra các Docker image:
```bash
docker images | grep -E 'postiz|postgres|temporal'
```

---

### Bước 4.2 — Khởi Động Stack Bằng Docker Compose

```bash
cd /opt/postiz
docker compose up -d
```

*Thời gian khởi tạo ban đầu:* Khoảng 1 – 2 phút (PostgreSQL khởi tạo database `postiz-db-local`, `temporal` và `temporal_visibility`).

---

### Bước 4.3 — Theo Dõi Quá Trình Khởi Động Qua Logs

```bash
docker compose logs -f --tail=50
```
*(Nhấn Ctrl+C để thoát chế độ xem log sau khi các tiến trình ổn định)*

**Dấu hiệu thành công trong log:**
- `postiz-postgres`: `database system is ready to accept connections`
- `temporal`: Server started, namespace `default` initialized
- `postiz`: Nest application successfully started trên port 3000 nội bộ

---

### Bước 4.4 — Kiểm Tra Trạng Thái PM2 Bên Trong Container `postiz`

Ứng dụng Postiz chạy đa tiến trình qua PM2 bên trong container:

```bash
docker exec postiz pm2 status
```

**Kết quả mong đợi:**
```
┌──┬──────────────┬─────────┬─────────┬────────┬──────┬───────────┐
│id│ name         │ mode    │ pid     │ uptime │  ↺   │ status    │
├──┼──────────────┼─────────┼─────────┼────────┼──────┼───────────┤
│0 │ frontend     │ fork    │ ...     │ ...    │ 0    │ online    │
│1 │ backend      │ fork    │ ...     │ ...    │ 0    │ online    │
│2 │ orchestrator │ fork    │ ...     │ ...    │ 0    │ online    │
└──┴──────────────┴─────────┴─────────┴────────┴──────┴───────────┘
```
Cả 3 tiến trình đều ở trạng thái `online` với số lần restart `↺ = 0`.

Nếu có tiến trình bị lỗi hoặc restart liên tục, xem log chi tiết:
```bash
docker exec postiz pm2 logs backend --lines 50 --nostream
docker exec postiz pm2 logs frontend --lines 50 --nostream
```

---

### Bước 4.5 — Xác Minh Kết Nối Valkey Host

Kiểm tra xem backend có gặp lỗi kết nối tới Valkey native của server không:

```bash
docker exec postiz pm2 logs backend --lines 100 --nostream | grep -i "ECONNREFUSED.*6379"
```

**Kết quả mong đợi:**
Không có dòng log nào xuất hiện. Nếu có lỗi từ chối kết nối, kiểm tra lại mật khẩu `REDIS_URL` trong `/opt/postiz/.env`.

---

### Bước 4.6 — Kiểm Tra Endpoint Frontend Cục Bộ (:5000)

```bash
curl -o /dev/null -s -w "Frontend HTTP Status: %{http_code}\n" http://127.0.0.1:5000
```

**Kết quả mong đợi:** `HTTP Status: 200` hoặc `HTTP Status: 307` (chuyển hướng đăng nhập).

---

### Bước 4.7 — Kiểm Tra Endpoint Backend API Cục Bộ (:5001)

```bash
curl -o /dev/null -s -w "Backend API HTTP Status: %{http_code}\n" http://127.0.0.1:5001/
```

**Kết quả mong đợi:** `HTTP Status: 200` hoặc `HTTP Status: 404` (cho thấy API server NestJS phản hồi bình thường).

---

### Bước 4.8 — Kiểm Tra Luồng Reverse Proxy Qua Nginx (:8087)

Giả lập request từ Cloudflare gửi tới Nginx host:

```bash
curl -o /dev/null -s -w "Nginx Proxy HTTP Status: %{http_code}\n" \
  -H "Host: post.thinhpxp.io.vn" http://127.0.0.1:8087
```

**Kết quả mong đợi:** `HTTP Status: 200` hoặc `HTTP Status: 307`.

---

### Bước 4.9 — Kiểm Tra Tính Năng Tự Động Dọn Dẹp Notifications (15 Ngày)

Chờ 15 – 20 giây sau khi khởi động để cron dọn dẹp chạy lượt đầu tiên:

```bash
docker exec postiz pm2 logs backend --lines 40 --nostream | grep -i "NotificationCleanup"
```

**Kết quả mong đợi:**
Xuất hiện log nhận diện cấu hình dọn dẹp, ví dụ:
```
[NotificationService] [NotificationCleanup] Checking for notifications older than 15 days...
```

---

## Xác Nhận Hoàn Thành Giai Đoạn 4

- [ ] Lệnh `docker compose up -d` tại `/opt/postiz` chạy không có lỗi.
- [ ] 3 tiến trình PM2 (`frontend`, `backend`, `orchestrator`) đều `online` với `restart = 0`.
- [ ] Kết nối Valkey thành công (không có lỗi ECONNREFUSED).
- [ ] Các endpoint cục bộ `:5000`, `:5001`, `:8087` đều phản hồi trạng thái hợp lệ.
- [ ] Module dọn dẹp thông báo tự động (15 ngày) hoạt động bình thường.

👉 **Tiếp tục thực hiện:** Chuyển sang tài liệu [`06-post-deploy.md`](file:///home/thinhpxp/Documents/postiz-app/plan/06-post-deploy.md).
