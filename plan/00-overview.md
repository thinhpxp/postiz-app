# Kế Hoạch Deploy Postiz — Tổng Quan

## Thông Tin Chung

| Mục | Máy DEV (Phát triển) | Máy Chủ Production (Online) |
|-----|----------------------|------------------------------|
| **Host / IP** | Localhost (máy hiện tại) | `sshh.thinhpxp.io.vn` (IP nội bộ: 192.168.3.60) |
| **User** | `thinhpxp` | `thinhpxp` (nhóm `docker`, `wheel`) |
| **Thư mục dự án** | `/home/thinhpxp/Documents/postiz-app` | **`/opt/postiz`** |
| **Ứng dụng** | Source code & dev container | Custom image `postiz:slim-custom` (PM2 all-in-one) |
| **Domain** | N/A | `post.thinhpxp.io.vn` |
| **Cloudflare Tunnel** | N/A | Người dùng tự cấu hình trên Cloudflare Dashboard |
| **Đơn vị thực thi** | AI Agent lập kế hoạch | **AI Agent khác tiếp quản thi hành** (theo tài liệu này) |

---

## 📁 Thư Mục Triển Khai Trên Máy Chủ Online: `/opt/postiz`

> [!IMPORTANT]
> **Phân định rõ ràng giữa Môi Trường DEV và SERVER ONLINE:**
> - **Máy DEV:** Source code đặt tại `/home/thinhpxp/Documents/postiz-app`.
> - **Máy chủ ONLINE (`sshh.thinhpxp.io.vn`):** Toàn bộ các dịch vụ production trên máy chủ này đều theo chuẩn đặt tại thư mục `/opt/` (như `/opt/ghost/`, `/opt/sapnhap/`, `/opt/smartdraftinghub/`). Do đó, Postiz production **bắt buộc đặt tại `/opt/postiz`**, tuyệt đối không đặt trong thư mục cá nhân `~/Documents/`.

Cấu trúc thư mục tại `/opt/postiz/` trên server:

```
/opt/postiz/
├── docker-compose.yml            ← Cấu hình Docker Compose production
├── .env                          ← Biến môi trường & bí mật (permission 600)
├── dynamicconfig/
│   └── development-sql.yaml      ← Cấu hình Temporal workflow engine (SQL Visibility)
├── postgres-data/                ← Dữ liệu lưu trữ PostgreSQL (bind mount)
└── uploads/                      ← Thư mục lưu trữ media (ảnh, video tải lên)
```

**Lệnh phân quyền ban đầu (thực hiện một lần ở Giai đoạn 1):**
```bash
sudo mkdir -p /opt/postiz/{postgres-data,uploads,dynamicconfig}
sudo chown -R thinhpxp:thinhpxp /opt/postiz
```
Sau lệnh này, user `thinhpxp` có toàn quyền đọc/ghi trên `/opt/postiz`, không cần dùng `sudo` cho các lệnh quản trị Docker hay chỉnh sửa file cấu hình.

**Lệnh backup nhanh:**
```bash
# Backup dữ liệu Postiz
sudo rsync -av /opt/postiz/postgres-data/ ~/backup/postiz-postgres-$(date +%Y%m%d)/
sudo rsync -av /opt/postiz/uploads/       ~/backup/postiz-uploads-$(date +%Y%m%d)/
```

---

## Danh Sách Các Tài Liệu Kế Hoạch Chi Tiết

| Tệp | Tên Giai Đoạn | Phạm Vi Thực Hiện | Vai Trò |
|-----|---------------|-------------------|---------|
| [`00-overview.md`](file:///home/thinhpxp/Documents/postiz-app/plan/00-overview.md) | Tổng quan hệ thống | Toàn bộ | Kiến trúc, cổng mạng, phân định thư mục |
| [`01-export-transfer.md`](file:///home/thinhpxp/Documents/postiz-app/plan/01-export-transfer.md) | Giai đoạn 0: Export & Transfer | **Máy DEV** | Export docker image và scp sang server |
| [`02-server-prepare.md`](file:///home/thinhpxp/Documents/postiz-app/plan/02-server-prepare.md) | Giai đoạn 1: Chuẩn bị Server | **Server Online** | Tạo `/opt/postiz`, load image, pull phụ trợ |
| [`03-config-files.md`](file:///home/thinhpxp/Documents/postiz-app/plan/03-config-files.md) | Giai đoạn 2: Tạo File Cấu Hình | **Server Online** | Tạo `docker-compose.yml`, template `.env` |
| [`04-nginx.md`](file:///home/thinhpxp/Documents/postiz-app/plan/04-nginx.md) | Giai đoạn 3: Nginx & Reverse Proxy | **Server Online** | Virtual host `:8087`, hỗ trợ WebSocket |
| [`05-startup-verify.md`](file:///home/thinhpxp/Documents/postiz-app/plan/05-startup-verify.md) | Giai đoạn 4: Khởi Động & Xác Minh | **Server Online** | Chạy `docker compose up -d`, kiểm tra PM2 |
| [`06-post-deploy.md`](file:///home/thinhpxp/Documents/postiz-app/plan/06-post-deploy.md) | Giai đoạn 5: Vận Hành & End-to-End | **Server & Trình duyệt** | Kiểm tra luồng đăng bài, cleanup 15 ngày |

---

## Kiến Trúc Hệ Thống Production

```
Internet
   │
   ▼
Cloudflare (DNS + SSL Edge)
   │
   ▼
Cloudflare Tunnel (cloudflared daemon chạy sẵn trên server)
   │  Route: post.thinhpxp.io.vn → http://localhost:8087
   ▼
Nginx trên Host (Listen 127.0.0.1:8087 — Reverse Proxy nội bộ)
   │
   ├── /api/*     → http://127.0.0.1:5001 (Postiz Backend API)
   ├── /uploads/* → http://127.0.0.1:5001 (Static uploads via NestJS)
   └── /*         → http://127.0.0.1:5000 (Postiz Frontend Next.js)
           │
           │ (Traffic vào Docker Network: postiz_net)
           ▼
   Container `postiz` (Image: postiz:slim-custom, Quản lý bởi PM2)
     ├── Process 0: frontend (Next.js)  → :5000 (map ra host 127.0.0.1:5000)
     ├── Process 1: backend  (NestJS)   → :3000 (map ra host 127.0.0.1:5001)
     └── Process 2: orchestrator (Cron / Background tasks)
           │
           ├──► Container `postiz-postgres` (Image: postgres:17-alpine)
           │      Internal port: 5432 (KHÔNG expose ra ngoài host)
           │      Data volume: /opt/postiz/postgres-data
           │
           ├──► Container `temporal` (Image: temporalio/auto-setup:1.28.1)
           │      Internal port: 7233 (KHÔNG expose ra ngoài host)
           │      Dùng chung PostgreSQL (DB: temporal, temporal_visibility)
           │      Dynamic Config: /opt/postiz/dynamicconfig
           │
           └──► Native Valkey (Host server, port 127.0.0.1:6379, có Auth)
                  Kết nối từ container qua: host.docker.internal:6379
                  Sử dụng Database index: 3 (tránh xung đột với sapnhap-api / app khác)
```

---

## Quy Hoạch Cổng Mạng (Port Allocation)

| Cổng | Giao Thức / Dịch Vụ | Phạm Vi Lắng Nghe | Mô Tả |
|------|---------------------|-------------------|-------|
| `127.0.0.1:8087` | Nginx Virtual Host | Nội bộ localhost | Nhận traffic từ Cloudflare Tunnel |
| `127.0.0.1:5000` | Postiz Frontend | Nội bộ localhost | Container map `5000:5000` |
| `127.0.0.1:5001` | Postiz Backend API | Nội bộ localhost | Container map `5001:3000` |
| `127.0.0.1:6379` | Valkey (Native host) | Nội bộ localhost | Postiz kết nối qua `host.docker.internal:6379/3` |
| Internal `:5432` | PostgreSQL (Container) | Mạng Docker `postiz_net` | Không mở ra host để bảo mật |
| Internal `:7233` | Temporal Server | Mạng Docker `postiz_net` | Không mở ra host để bảo mật |

> **Các cổng đang chạy trên server đã tránh:**
> - `:3000` (sapnhap-api)
> - `:8080` (SmartDraftingHub Frontend)
> - `:8000` (SmartDraftingHub Backend)
> - `:2368` (Ghost Portfolio)
> - `:8082`, `:8083`, `:8084` (Nginx virtual hosts hiện có)

---

## 2 Điểm Dừng Bắt Buộc Dành Cho AI Agent Thực Thi (Checkpoints)

1. **Điểm dừng 1 (Sau Giai đoạn 2 — `03-config-files.md`):**
   Agent tạo file template `/opt/postiz/.env`, sau đó **DỪNG LẠI** và yêu cầu người dùng tự điền mật khẩu bí mật (Valkey, PostgreSQL, JWT Secret, NextAuth Secret). Agent không được tự ý điền mật khẩu giả hay tiếp tục khi chưa có xác nhận từ người dùng.
2. **Điểm dừng 2 (Sau Giai đoạn 3 — `04-nginx.md`):**
   Agent tạo file Nginx và reload dịch vụ, sau đó **DỪNG LẠI** chờ người dùng lên giao diện Cloudflare Zero Trust để thêm hostname `post.thinhpxp.io.vn` trỏ về `http://localhost:8087`.
