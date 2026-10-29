# Giai Đoạn 3 — Cấu Hình Nginx Reverse Proxy

## Mục Tiêu
Thiết lập Nginx Virtual Host trên máy chủ online lắng nghe tại `127.0.0.1:8087`, tiếp nhận lưu lượng từ Cloudflare Tunnel và điều phối tới Frontend Next.js (:5000) cùng Backend API NestJS (:5001).

---

## Môi Trường Thực Hiện: MÁY CHỦ ONLINE (`sshh.thinhpxp.io.vn`)
> Các bước sau yêu cầu quyền `sudo` để tạo cấu hình Nginx và reload dịch vụ.

```bash
ssh sshh.thinhpxp.io.vn
```

---

### Bước 3.1 — Tạo Tệp Cấu Hình Virtual Host `/etc/nginx/conf.d/postiz.conf`

```bash
sudo tee /etc/nginx/conf.d/postiz.conf > /dev/null << 'EOF'
# ============================================================
# Nginx Virtual Host — post.thinhpxp.io.vn
# Upstream: Postiz Stack tại /opt/postiz
# ============================================================

server {
    listen 127.0.0.1:8087;
    server_name post.thinhpxp.io.vn;

    # Nhận diện IP thực của người dùng từ Cloudflare Tunnel
    real_ip_header CF-Connecting-IP;
    set_real_ip_from 127.0.0.1;

    # Dung lượng tối đa tải tệp media lên (ảnh, video)
    client_max_body_size 100M;

    # Hỗ trợ giao thức WebSocket & Server-Sent Events (SSE) cho real-time updates
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 86400;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
    }
}
EOF
```

---

### Bước 3.2 — Cấp Quyền Cho Cổng 8087 Trên SELinux (Bắt Buộc)

Do máy chủ bật SELinux ở chế độ Enforcing, cần cấp quyền cho Nginx mở cổng 8087:

```bash
sudo semanage port -a -t http_port_t -p tcp 8087
```

---

### Bước 3.2 — Đảm Bảo Biến `$connection_upgrade` Tồn Tại Trong `nginx.conf`

Kiểm tra xem block map `connection_upgrade` đã có trong cấu hình chính chưa:

```bash
grep -n "connection_upgrade" /etc/nginx/nginx.conf
```

Nếu **chưa có**, thêm block sau vào bên trong khối `http { ... }` của `/etc/nginx/nginx.conf`:

```bash
sudo sed -i '/^http {/a\    map $http_upgrade $connection_upgrade {\n        default upgrade;\n        '"''"' close;\n    }' /etc/nginx/nginx.conf
```

---

### Bước 3.3 — Kiểm Tra Cú Pháp Cấu Hình Nginx

```bash
sudo nginx -t
```

**Kết quả mong đợi:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

---

### Bước 3.4 — Nạp Lại Dịch Vụ Nginx (Reload)

```bash
sudo systemctl reload nginx
sudo systemctl status nginx --no-pager | head -n 10
```

Xác nhận cổng `8087` đã được mở và lắng nghe cục bộ:
```bash
ss -tlnp | grep :8087
```

**Kết quả mong đợi:**
Xuất hiện dòng `127.0.0.1:8087` do tiến trình `nginx` quản lý.

---

### 🛑 ĐIỂM DỪNG BẮT BUỘC CHO AGENT THỰC THI (CHECKPOINT 2)

Sau khi hoàn tất cấu hình Nginx, Agent in hướng dẫn sau cho người dùng và **DỪNG LẠI CHỜ XÁC NHẬN**:

```
====================================================================
⚠️  HÀNH ĐỘNG THỦ CÔNG: CẤU HÌNH ROUTE TRÊN CLOUDFLARE DASHBOARD
====================================================================
Người dùng thực hiện trên giao diện https://dash.cloudflare.com:

1. Đăng nhập → Zero Trust → Networks → Tunnels.
2. Chọn tunnel hiện đang hoạt động cho domain `thinhpxp.io.vn`.
3. Nhấp "Configure" → Chuyển sang thẻ "Public Hostname".
4. Nhấp "Add a public hostname" và điền thông tin:
   - Subdomain: post
   - Domain: thinhpxp.io.vn
   - Type: HTTP
   - URL: localhost:8087  (hoặc 127.0.0.1:8087)
5. Nhấp "Save hostname".

Sau khi lưu thành công, vui lòng nhắn xác nhận để Agent tiếp tục khởi động hệ thống.
====================================================================
```

---

## Xác Nhận Hoàn Thành Giai Đoạn 3

- [ ] Tệp `/etc/nginx/conf.d/postiz.conf` đã được tạo chính xác.
- [ ] Lệnh `sudo nginx -t` kiểm tra cú pháp đạt 100%.
- [ ] Dịch vụ Nginx đã reload thành công và đang lắng nghe tại `127.0.0.1:8087`.
- [ ] Người dùng đã tạo route Public Hostname trên Cloudflare Tunnel Dashboard.

👉 **Tiếp tục thực hiện:** Chuyển sang tài liệu [`05-startup-verify.md`](file:///home/thinhpxp/Documents/postiz-app/plan/05-startup-verify.md).
