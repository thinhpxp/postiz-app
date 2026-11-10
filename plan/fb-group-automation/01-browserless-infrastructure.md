# Phase 1: Thiết lập Hạ tầng Headless Browser (Browserless Container)

> **Mục tiêu:** Bổ sung container `browserless/chromium` vào cụm Docker Compose hiện tại trên máy chủ production, cấu hình mạng nội bộ và đặt giới hạn cứng về tài nguyên (RAM, CPU) để không làm ảnh hưởng tới các dịch vụ Postiz, Temporal, Postgres và Valkey.

---

## 1. Phân tích Hạ tầng & Yêu cầu Kỹ thuật

1. **Giao tiếp mạng nội bộ:**
   - Container `postiz` cần kết nối đến trình duyệt qua giao thức Chrome DevTools Protocol (CDP) WebSocket: `ws://browserless:3000?token=SECRET_KEY`.
   - Cả 2 container cùng nằm trong mạng Docker nội bộ (`postiz-network`). Không mở port `3000` ra ngoài Internet qua Nginx hay Cloudflare Tunnel (đảm bảo an toàn tuyệt đối).

2. **Giới hạn tài nguyên (Tối ưu RAM/CPU):**
   - Headless Chromium rất tốn tài nguyên nếu không bị giới hạn.
   - Bắt buộc đặt `shm_size: '1gb'` (Shared Memory) để tránh Chromium bị crash `SIGSEGV` khi render các trang Facebook có nhiều ảnh/DOM nặng.
   - Giới hạn `CONCURRENT: 1` để đảm bảo tại 1 thời điểm chỉ có 1 tác vụ đăng bài được mở trình duyệt, tránh trường hợp nhiều tab bật cùng lúc gây quá tải RAM của server.
   - Đặt `TIMEOUT: 90000` (90 giây) để Browserless tự giải phóng session nếu kịch bản gặp lỗi ngoài ý muốn.

---

## 2. Cấu hình Docker Compose Chi tiết

Chỉnh sửa file `docker-compose.yaml` (trên máy chủ tại `/opt/postiz/docker-compose.yaml` hoặc repo):

```yaml
services:
  # ... (các dịch vụ hiện tại: postiz, temporal, postgres) ...

  browserless:
    image: ghcr.io/browserless/chromium:latest
    container_name: postiz-browserless
    restart: unless-stopped
    shm_size: '1gb'
    environment:
      # Giới hạn số lượng phiên chạy đồng thời
      - CONCURRENT=1
      # Hàng đợi tối đa khi có nhiều bài đăng cùng giờ
      - QUEUED=10
      # Thời gian sống tối đa của 1 session (90 giây)
      - TIMEOUT=90000
      # Tự động tắt browser khi không có kết nối
      - PREBOOT_CHROME=false
      - KEEP_ALIVE=false
      # Token bảo vệ kết nối nội bộ
      - TOKEN=${BROWSERLESS_TOKEN:-postiz_browserless_secure_key_2026}
      # Tắt các tính năng không cần thiết của Chrome để tiết kiệm RAM
      - CONNECTION_TIMEOUT=30000
      - CHROME_REFRESH_TIME=3600000
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1024M
        reservations:
          cpus: '0.2'
          memory: 256M
    networks:
      - postiz-network
    # Port 3000 chỉ expose trong mạng nội bộ Docker, KHÔNG mở ra host port nếu không cần debug
    expose:
      - "3000"

networks:
  postiz-network:
    name: postiz-network
    external: true
```

---

## 3. Các Biến Môi trường Cần Thêm vào Postiz (`.env`)

Cập nhật file `/opt/postiz/.env`:

```bash
# Cấu hình kết nối tới Browserless nội bộ
BROWSERLESS_HOST=browserless
BROWSERLESS_PORT=3000
BROWSERLESS_TOKEN=postiz_browserless_secure_key_2026
BROWSERLESS_WS_URL=ws://browserless:3000?token=postiz_browserless_secure_key_2026
```

---

## 4. Các Bước Kiểm tra & Xác minh (Verification Steps)

1. **Khởi động container:**
   ```bash
   docker compose up -d browserless
   ```

2. **Kiểm tra trạng thái tài nguyên:**
   ```bash
   docker stats postiz-browserless --no-stream
   ```
   *Kết quả mong đợi:* RAM trạng thái nghỉ (idle) chỉ từ **~60MB đến 85MB**.

3. **Kiểm tra kết nối từ container Postiz sang Browserless:**
   ```bash
   docker exec -it postiz curl -s http://browserless:3000/pressure?token=postiz_browserless_secure_key_2026
   ```
   *Kết quả mong đợi:* Trả về JSON tình trạng tài nguyên (CPU pressure, memory status) mã HTTP 200 OK:
   ```json
   {"isReady":true,"running":0,"queued":0,"pressure":{}}
   ```

