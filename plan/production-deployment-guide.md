# Hướng Dẫn Triển Khai Postiz Production — Kinh Nghiệm Thực Chiến

> **Mục đích:** Tài liệu hướng dẫn chi tiết quy trình đưa hệ thống Postiz phiên bản Slim (tối ưu hóa tài nguyên) lên máy chủ Linux production, đúc kết toàn bộ bài học và xử lý sự cố thực tế.
> **Đối tượng:** Kỹ sư hệ thống (DevOps), Quản trị viên máy chủ hoặc AI Agent tiếp quản vận hành.

---

## 1. Kiến Trúc & Tiêu Chuẩn Hệ Thống

### 1.1. Tiêu chuẩn thư mục máy chủ
Mọi ứng dụng chạy production trên máy chủ Linux cần tuân thủ quy ước đặt tại thư mục `/opt/`:
* Thư mục dự án: `/opt/postiz/`
* Quyền sở hữu: Gán cho user vận hành (ví dụ: `thinhpxp:thinhpxp`), không chạy ứng dụng bằng `root`.

```
/opt/postiz/
├── docker-compose.yml            # Khởi chạy 3 container: postiz, temporal, postiz-postgres
├── .env                          # Biến môi trường và khóa bí mật (permission 600)
├── dynamicconfig/
│   └── development-sql.yaml      # Cấu hình SQL Visibility cho Temporal
├── postgres-data/                # Dữ liệu lưu trữ PostgreSQL (bind mount)
└── uploads/                      # Tệp tải lên từ người dùng (ảnh, video)
```

### 1.2. Chiến lược tối ưu tài nguyên (Slim Postiz)
Cấu hình mặc định gốc của Postiz tiêu thụ hơn **2.3 GB RAM** (chạy Elasticsearch, 2 PostgreSQL riêng biệt, Redis riêng). Phiên bản tối ưu Slim chỉ tiêu thụ **~700 MB – 850 MB RAM**:

1. **Hợp nhất cơ sở dữ liệu:** Dùng duy nhất 1 container `postgres:17-alpine` tạo sẵn 3 cơ sở dữ liệu nội bộ: `postiz-db-local`, `temporal`, `temporal_visibility`.
2. **Khai tử Elasticsearch:** Cấu hình Temporal Server chạy ở chế độ **SQL Visibility**, loại bỏ hoàn toàn container Java Elasticsearch (tiết kiệm ~600 MB RAM).
3. **Tái sử dụng Native Valkey/Redis:** Sử dụng dịch vụ Valkey/Redis có sẵn trên máy chủ host qua `host.docker.internal:6379`, gán **Database index 3** để phân vùng độc lập, không cần chạy thêm container Redis.
4. **All-in-One Container PM2:** Postiz chạy Next.js (frontend), NestJS (backend) và Orchestrator chung một container qua PM2.

---

## 2. Quy Trình Triển Khai Chi Tiết

### Bước 1: Khởi tạo thư mục và phân quyền một lần
Trên máy chủ Linux, chạy lệnh cấp quyền:

```bash
sudo mkdir -p /opt/postiz/{postgres-data,uploads,dynamicconfig}
sudo chown -R thinhpxp:thinhpxp /opt/postiz
```
*Lợi ích:* Sau lệnh này, mọi thao tác tạo file cấu hình, quản trị Docker Compose không cần dùng `sudo`.

---

### Bước 2: Chuẩn bị tệp cấu hình Temporal
Tạo tệp `/opt/postiz/dynamicconfig/development-sql.yaml`:

```yaml
limit.maxIDLength:
  - value: 255
    constraints: {}
system.forceSearchAttributesCacheRefreshOnRead:
  - value: true
    constraints: {}
```

---

### Bước 3: Tạo tệp `docker-compose.yml`
Tạo tệp `/opt/postiz/docker-compose.yml`:

```yaml
name: postiz

services:
  # === Postiz Application ===
  postiz:
    image: postiz:slim-custom
    container_name: postiz
    restart: unless-stopped
    ports:
      - "127.0.0.1:5000:5000"   # Cổng Nginx nội bộ container -> Nginx host
      - "127.0.0.1:5001:3000"   # Backend NestJS trực tiếp (dự phòng)
    env_file:
      - .env
    volumes:
      - ./uploads:/uploads
    networks:
      - postiz_net
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      postiz-postgres:
        condition: service_healthy
      temporal:
        condition: service_started

  # === PostgreSQL Hợp Nhất ===
  postiz-postgres:
    image: postgres:17-alpine
    container_name: postiz-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postiz-user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: postiz-db-local
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    networks:
      - postiz_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postiz-user -d postiz-db-local"]
      interval: 5s
      timeout: 3s
      retries: 5

  # === Temporal Engine (SQL Visibility) ===
  temporal:
    container_name: temporal
    image: temporalio/auto-setup:1.28.1
    restart: unless-stopped
    depends_on:
      postiz-postgres:
        condition: service_healthy
    environment:
      - DB=postgres12
      - DB_PORT=5432
      - POSTGRES_USER=postiz-user
      - POSTGRES_PWD=${POSTGRES_PASSWORD}
      - POSTGRES_SEEDS=postiz-postgres
      - DBNAME=temporal
      - VISIBILITY_DBNAME=temporal_visibility
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development-sql.yaml
      - ENABLE_ES=false
      - SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES=true
      - TEMPORAL_NAMESPACE=default
    networks:
      - postiz_net
    volumes:
      - ./dynamicconfig:/etc/temporal/config/dynamicconfig

networks:
  postiz_net:
    driver: bridge
    name: postiz_net
```

---

### Bước 4: Cấu hình biến môi trường `.env`
Tạo tệp `/opt/postiz/.env` và thiết lập quyền `chmod 600 /opt/postiz/.env`:

```env
# === Database ===
DATABASE_URL=postgresql://postiz-user:<POSTGRES_PASSWORD>@postiz-postgres:5432/postiz-db-local
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>

# === Native Valkey/Redis (DB index 3) ===
REDIS_URL=redis://:<VALKEY_PASSWORD>@host.docker.internal:6379/3

# === Domain & URLs ===
MAIN_URL=https://post.thinhpxp.io.vn
FRONTEND_URL=https://post.thinhpxp.io.vn
NEXT_PUBLIC_BACKEND_URL=https://post.thinhpxp.io.vn/api
BACKEND_INTERNAL_URL=http://localhost:3000
CANVA_APP_ORIGIN=https://post.thinhpxp.io.vn

# === Security Keys (Sinh bằng openssl rand -hex 32) ===
JWT_SECRET=<CHUỖI_BÍ_MẬT_32_KÝ_TỰ>
NEXTAUTH_SECRET=<CHUỖI_BÍ_MẬT_32_KÝ_TỰ>

# === Temporal & Runtime ===
TEMPORAL_ADDRESS=temporal:7233
IS_GENERAL=true
DISABLE_REGISTRATION=false
NODE_OPTIONS=--max-old-space-size=512

# === Tự Động Dọn Dẹp Thông Báo (15 Ngày) ===
NOTIFICATIONS_RETENTION_DAYS=15

# === Lưu Trữ Tệp Tải Lên ===
STORAGE_PROVIDER=local
UPLOAD_DIRECTORY=/uploads
NEXT_PUBLIC_UPLOAD_DIRECTORY=/uploads
```

---

### Bước 5: Cấu hình Nginx Reverse Proxy & SELinux
Tạo tệp cấu hình Virtual Host tại `/etc/nginx/conf.d/postiz.conf`:

```nginx
# ============================================================
# Nginx Virtual Host — post.thinhpxp.io.vn
# Upstream: Postiz Stack (127.0.0.1:5000)
# ============================================================

server {
    listen 127.0.0.1:8087;
    server_name post.thinhpxp.io.vn;

    # Nhận diện IP thực từ Cloudflare Tunnel
    real_ip_header CF-Connecting-IP;
    set_real_ip_from 127.0.0.1;

    client_max_body_size 100M;

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
```

> [!CAUTION]
> **Bài học SELinux trên RHEL / Fedora / CentOS / AlmaLinux:**
> Nếu hệ điều hành đang bật SELinux (Enforcing mode), Nginx sẽ **bị chặn không cho phép bind vào cổng 8087**, gây ra lỗi **502 Bad Gateway**.
> **Bắt buộc chạy lệnh sau trước khi reload Nginx:**
> ```bash
> sudo semanage port -a -t http_port_t -p tcp 8087
> sudo systemctl restart nginx
> ```

---

### Bước 6: Định tuyến Cloudflare Tunnel
Trên bảng điều khiển [dash.cloudflare.com](https://dash.cloudflare.com):
1. **Zero Trust** → **Networks** → **Tunnels** → Chọn Tunnel của domain.
2. Thêm **Public Hostname**:
   * **Subdomain:** `post`
   * **Domain:** `thinhpxp.io.vn`
   * **Type:** `HTTP`
   * **URL:** `localhost:8087`

---

## 3. Các Bài Học & Xử Lý Sự Cố Thực Chiến (Crucial Gotchas)

### 3.1. Sự cố Next.js Build-Time Inlined URL (`localhost:4007`)
* **Hiện tượng:** Truy cập website bình thường, nhưng khi bấm đăng ký/đăng nhập tài khoản, trình duyệt báo lỗi:
  > `Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://localhost:4007/api/auth/register`
* **Nguyên nhân:** Next.js khi build production bundle sẽ nướng cứng (inline) biến `process.env.NEXT_PUBLIC_BACKEND_URL` thành chuỗi ký tự cố định vào các tệp chunk `.next/server/` và `.next/static/`. Nếu Docker image được build trên máy dev, giá trị `http://localhost:4007/api` sẽ bị lưu cứng trong mã client.
* **Cách khắc phục:**
  1. Chạy lệnh thay thế chuỗi trực tiếp bên trong container:
     ```bash
     docker exec postiz sh -c '
     for f in $(grep -rl "localhost:4007" /app/apps/frontend/.next); do
       sed -i "s|http://localhost:4007/api|https://post.thinhpxp.io.vn/api|g" "$f"
       sed -i "s|http://localhost:4007|https://post.thinhpxp.io.vn|g" "$f"
     done
     '
     ```
  2. Khởi động lại container: `docker compose restart postiz`
  3. **Lưu vĩnh viễn vào image:** 
     ```bash
     docker commit postiz postiz:slim-custom
     ```
     *(Bước commit này cực kỳ quan trọng để thay đổi không bị mất khi container bị recreate).*

---

### 3.2. Sự cố cấu hình Facebook OAuth App
* **Hiện tượng:** Khi kết nối Facebook Page trong Postiz, Facebook báo lỗi:
  > *"Miền của URL này không được đưa vào miền của ứng dụng. Để có thể tải URL này, hãy thêm tất cả các miền và miền phụ của ứng dụng vào trường Miền ứng dụng trong cài đặt ứng dụng của bạn."*
* **Nguyên nhân:**
  1. Trên localhost, Facebook tự động miễn trừ kiểm tra bảo mật domain. Nhưng trên domain thật, Facebook kiểm tra nghiêm ngặt.
  2. Ứng dụng Meta chưa được thêm sản phẩm **Facebook Login** (hoặc chưa thêm trường hợp sử dụng xác thực tài khoản).
  3. Chưa khai báo nền tảng **Website Platform** đi kèm.
* **Cách khắc phục chuẩn 100% trên developers.facebook.com:**
  1. **Thêm sản phẩm:** Trong menu bên trái, nhấp **Thêm sản phẩm (Add Product)** → Chọn **Facebook Login** → Bấm **Thiết lập (Set Up)**.
  2. **Thêm Platform Website:** Vào **Cài đặt ứng dụng** → **Thông tin cơ bản** → Cuộn xuống dưới cùng chọn **Thêm nền tảng (Add Platform)** → Chọn **Trang web (Website)** → Điền Site URL: `https://post.thinhpxp.io.vn/`.
  3. **Khai báo App Domains:** Tại phần trên, điền vào mục Miền ứng dụng: `post.thinhpxp.io.vn` và `thinhpxp.io.vn`. Điền link Chính sách quyền riêng tư: `https://post.thinhpxp.io.vn`. Bấm **Lưu thay đổi**.
  4. **Khai báo OAuth Redirect URI:** Vào **Facebook Login** → **Cài đặt (Settings)** → Thêm vào mục URI chuyển hướng OAuth hợp lệ:
     ```
     https://post.thinhpxp.io.vn/integrations/social/facebook
     ```
     Bấm **Lưu thay đổi**.

---

## 4. Cẩm Nang Vận Hành & Bảo Trì (Runbook)

### 4.1. Lệnh kiểm tra hệ thống

```bash
# Xem trạng thái các container
cd /opt/postiz && docker compose ps

# Xem trạng thái PM2 bên trong container
docker exec postiz pm2 status

# Giám sát mức tiêu thụ RAM / CPU thực tế
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Xem log thời gian thực của backend Postiz
docker exec postiz pm2 logs backend

# Xem log cron dọn dẹp notification cũ (15 ngày)
docker exec postiz pm2 logs backend --lines 50 --nostream | grep -i "NotificationCleanup"
```

### 4.2. Khởi động lại dịch vụ

```bash
# Khởi động lại riêng ứng dụng Postiz
cd /opt/postiz && docker compose restart postiz

# Khởi động lại toàn bộ stack (Postgres + Temporal + Postiz)
cd /opt/postiz && docker compose restart
```

### 4.3. Quy trình sao lưu dữ liệu (Backup)

```bash
# 1. Sao lưu cơ sở dữ liệu PostgreSQL
docker exec postiz-postgres pg_dump -U postiz-user postiz-db-local > /opt/postiz/backup_$(date +%Y%m%d).sql

# 2. Sao lưu thư mục dữ liệu uploads và database sang thư mục an toàn
sudo rsync -av /opt/postiz/postgres-data/ ~/backup/postiz-postgres-$(date +%Y%m%d)/
sudo rsync -av /opt/postiz/uploads/       ~/backup/postiz-uploads-$(date +%Y%m%d)/
```
