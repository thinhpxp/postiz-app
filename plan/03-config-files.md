# Giai Đoạn 2 — Tạo Tệp Cấu Hình Production

## Mục Tiêu
Khởi tạo tệp `docker-compose.yml` và template tệp môi trường `.env` tại thư mục `/opt/postiz/`. Dừng lại để người dùng tự điền mật khẩu bí mật (Valkey, PostgreSQL, JWT, NextAuth).

---

## Môi Trường Thực Hiện: MÁY CHỦ ONLINE (`sshh.thinhpxp.io.vn`)
> Tất cả các bước sau được thực hiện qua kết nối SSH tới server `sshh.thinhpxp.io.vn`.

```bash
ssh sshh.thinhpxp.io.vn
cd /opt/postiz
```

---

### Bước 2.1 — Tạo Tệp `/opt/postiz/docker-compose.yml`

Agent thực thi tạo tệp cấu hình Docker Compose chính thức:

```bash
cat > /opt/postiz/docker-compose.yml << 'EOF'
# ============================================================
# Docker Compose — Postiz Production Stack
# Server: sshh.thinhpxp.io.vn
# Deploy Directory: /opt/postiz
# Domain: post.thinhpxp.io.vn
# ============================================================

name: postiz

services:

  # === Postiz Application (All-in-One với PM2) ===
  postiz:
    image: postiz:slim-custom
    container_name: postiz
    restart: unless-stopped
    ports:
      - "127.0.0.1:5000:5000"   # Frontend Next.js → Nginx reverse proxy
      - "127.0.0.1:5001:3000"   # Backend API NestJS → Nginx reverse proxy
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

  # === PostgreSQL Database (Dùng chung cho Postiz + Temporal) ===
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

  # === Temporal Workflow Engine (Chế độ SQL Visibility) ===
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
EOF
```

Kiểm tra nội dung tệp vừa tạo:
```bash
head -n 25 /opt/postiz/docker-compose.yml
```

---

### Bước 2.2 — Tạo Tệp Mẫu `/opt/postiz/.env`

> [!IMPORTANT]
> Agent TẠO tệp template với các placeholder `FILL_ME_*`, **TUYỆT ĐỐI KHÔNG** tự sinh mật khẩu giả hoặc hỏi mật khẩu Valkey của người dùng.

```bash
cat > /opt/postiz/.env << 'EOF'
# ============================================================
# Postiz Production Environment Variables
# Directory: /opt/postiz/.env
# Domain: post.thinhpxp.io.vn
# ============================================================
# HƯỚNG DẪN: Mở file này và thay thế tất cả giá trị "FILL_ME_*"
# Sinh mật khẩu ngẫu nhiên bằng lệnh: openssl rand -hex 32
# ============================================================

# === Cơ sở dữ liệu (PostgreSQL Container) ===
DATABASE_URL=postgresql://postiz-user:FILL_ME_POSTGRES_PASSWORD@postiz-postgres:5432/postiz-db-local
POSTGRES_PASSWORD=FILL_ME_POSTGRES_PASSWORD

# === Native Valkey (Host server, DB index 3) ===
# Dùng DB 3 để phân vùng độc lập, không ảnh hưởng tới DB 0 của sapnhap-api
REDIS_URL=redis://:FILL_ME_VALKEY_PASSWORD@host.docker.internal:6379/3

# === Đường dẫn ứng dụng (Production Domain) ===
MAIN_URL=https://post.thinhpxp.io.vn
FRONTEND_URL=https://post.thinhpxp.io.vn
NEXT_PUBLIC_BACKEND_URL=https://post.thinhpxp.io.vn/api
BACKEND_INTERNAL_URL=http://localhost:3000
CANVA_APP_ORIGIN=https://post.thinhpxp.io.vn

# === Khóa bảo mật (BẮT BUỘC tạo chuỗi ngẫu nhiên dài ít nhất 32 ký tự) ===
JWT_SECRET=FILL_ME_JWT_SECRET_MIN_32_CHARS
NEXTAUTH_SECRET=FILL_ME_NEXTAUTH_SECRET_MIN_32_CHARS

# === Temporal Engine ===
TEMPORAL_ADDRESS=temporal:7233

# === Cấu hình hệ thống & Node.js ===
IS_GENERAL=true
DISABLE_REGISTRATION=false
NODE_OPTIONS=--max-old-space-size=512

# === Tự động dọn dẹp thông báo (Sau 15 ngày) ===
NOTIFICATIONS_RETENTION_DAYS=15

# === Lưu trữ tệp tin tải lên (Local Storage) ===
STORAGE_PROVIDER=local
UPLOAD_DIRECTORY=/uploads
NEXT_PUBLIC_UPLOAD_DIRECTORY=/uploads

# === Tích hợp AI (Tùy chọn) ===
OPENAI_API_KEY=
API_LIMIT=30

# === Cấu hình mạng xã hội (Người dùng có thể bổ sung sau khi web chạy) ===
X_URL=
X_API_KEY=
X_API_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
BEEHIIVE_API_KEY=
BEEHIIVE_PUBLICATION_ID=
THREADS_APP_ID=
THREADS_APP_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
TIKTOK_CLIENT_ID=
TIKTOK_CLIENT_SECRET=
TIKTOK_BUSINESS_CLIENT_ID=
TIKTOK_BUSINESS_CLIENT_SECRET=
PINTEREST_CLIENT_ID=
PINTEREST_CLIENT_SECRET=
DRIBBBLE_CLIENT_ID=
DRIBBBLE_CLIENT_SECRET=
TUMBLR_CLIENT_ID=
TUMBLR_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN_ID=
SLACK_ID=
SLACK_SECRET=
SLACK_SIGNING_SECRET=
MASTODON_URL=https://mastodon.social
MASTODON_CLIENT_ID=
MASTODON_CLIENT_SECRET=
EOF
```

---

### 🛑 ĐIỂM DỪNG BẮT BUỘC CHO AGENT THỰC THI (CHECKPOINT 1)

Sau khi tạo tệp template `/opt/postiz/.env`, Agent phải in thông báo sau cho người dùng và **DỪNG LẠI CHỜ XÁC NHẬN**:

```
====================================================================
⚠️  HÀNH ĐỘNG THỦ CÔNG: ĐIỀN THÔNG TIN BẢO MẬT VÀO /opt/postiz/.env
====================================================================
Vui lòng mở tệp trên server và cập nhật 4 thông số:
  Lệnh mở: nano /opt/postiz/.env   (hoặc vi /opt/postiz/.env)

1. FILL_ME_VALKEY_PASSWORD:
   Mật khẩu máy chủ Valkey của bạn (dành cho REDIS_URL).

2. FILL_ME_POSTGRES_PASSWORD:
   Mật khẩu cho container PostgreSQL nội bộ (điền giống nhau ở cả
   DATABASE_URL và POSTGRES_PASSWORD). Gợi ý tạo: openssl rand -hex 20

3. FILL_ME_JWT_SECRET_MIN_32_CHARS:
   Chuỗi bí mật JWT. Gợi ý tạo: openssl rand -hex 32

4. FILL_ME_NEXTAUTH_SECRET_MIN_32_CHARS:
   Chuỗi bí mật NextAuth. Gợi ý tạo: openssl rand -hex 32

Sau khi điền và lưu tệp, vui lòng nhắn xác nhận để Agent tiếp tục.
====================================================================
```

---

### Bước 2.3 — Kiểm Tra Xác Minh Tệp `.env`

Sau khi người dùng thông báo đã điền xong, Agent chạy lệnh kiểm tra:

```bash
grep "FILL_ME" /opt/postiz/.env
```

**Kết quả mong đợi:**
Lệnh không trả về dòng nào (không còn chứa chuỗi `FILL_ME`).

> [!CAUTION]
> Nếu vẫn còn chứa `FILL_ME`, Agent phải liệt kê các dòng chưa điền và yêu cầu người dùng hoàn tất trước khi tiếp tục.

---

### Bước 2.4 — Phân Quyền Bảo Mật Cho Tệp `.env`

Giới hạn quyền đọc/ghi chỉ cho user `thinhpxp`:

```bash
chmod 600 /opt/postiz/.env
```

Kiểm tra quyền:
```bash
ls -l /opt/postiz/.env
```
*(Kết quả: `-rw------- 1 thinhpxp thinhpxp ... /opt/postiz/.env`)*

---

## Xác Nhận Hoàn Thành Giai Đoạn 2

- [ ] Tệp `/opt/postiz/docker-compose.yml` đã được tạo hoàn chỉnh.
- [ ] Tệp `/opt/postiz/.env` đã được người dùng điền đầy đủ các khóa bảo mật.
- [ ] Lệnh `grep "FILL_ME" /opt/postiz/.env` không trả về kết quả nào.
- [ ] Tệp `.env` đã được đặt quyền `600`.

👉 **Tiếp tục thực hiện:** Chuyển sang tài liệu [`04-nginx.md`](file:///home/thinhpxp/Documents/postiz-app/plan/04-nginx.md).
