# Giai Đoạn 0 — Export Image & Transfer Sang Server

## Mục Tiêu
Xuất bản Docker image `postiz:slim-custom` đã được tùy biến (Slim PM2 + Notification Cleanup 15 ngày) từ máy DEV và chuyển các tệp cần thiết sang máy chủ production (`sshh.thinhpxp.io.vn`).

---

## Môi Trường Thực Hiện: MÁY DEV CỤC BỘ
> Tất cả các bước trong tài liệu này được chạy tại máy DEV (thư mục `/home/thinhpxp/Documents/postiz-app`).

---

### Bước 0.1 — Kiểm Tra Image Trên Máy DEV

```bash
docker images postiz:slim-custom
```

**Kết quả mong đợi:**
Xuất hiện ít nhất một dòng chứa `REPOSITORY: postiz`, `TAG: slim-custom`.

> [!CAUTION]
> Nếu không tìm thấy image, **DỪNG LẠI** và thông báo cho người dùng kiểm tra lại quá trình build image slim trên máy DEV.

---

### Bước 0.2 — Export Docker Image Ra Tệp Nén

```bash
docker save postiz:slim-custom | gzip > /tmp/postiz-slim-custom.tar.gz
```

- **Vị trí file tạm:** `/tmp/postiz-slim-custom.tar.gz` (trên máy DEV)
- **Thời gian ước tính:** 3 – 5 phút
- **Dung lượng xấp xỉ:** 400 MB – 800 MB

Kiểm tra kích thước file sau khi nén:
```bash
ls -lh /tmp/postiz-slim-custom.tar.gz
```

---

### Bước 0.3 — Chuyển File Image Sang Server Online

```bash
scp /tmp/postiz-slim-custom.tar.gz sshh.thinhpxp.io.vn:/tmp/postiz-slim-custom.tar.gz
```

- **Đích đến:** `/tmp/postiz-slim-custom.tar.gz` trên server `sshh.thinhpxp.io.vn`
- **Thời gian chuyển:** Tùy thuộc vào tốc độ đường truyền (thường 2 – 5 phút)

Kiểm tra file trên server qua SSH:
```bash
ssh sshh.thinhpxp.io.vn "ls -lh /tmp/postiz-slim-custom.tar.gz"
```

---

### Bước 0.4 — Chuyển Tệp Dynamicconfig Cho Temporal

Tệp cấu hình Temporal SQL Visibility nằm trong thư mục source code máy DEV:
`/home/thinhpxp/Documents/postiz-app/dynamicconfig/development-sql.yaml`

Chuyển tạm vào thư mục `/tmp` trên server (để chờ Giai đoạn 1 di chuyển vào `/opt/postiz/dynamicconfig/` sau khi đã cấp quyền):

```bash
scp /home/thinhpxp/Documents/postiz-app/dynamicconfig/development-sql.yaml \
    sshh.thinhpxp.io.vn:/tmp/development-sql.yaml
```

Kiểm tra tệp trên server:
```bash
ssh sshh.thinhpxp.io.vn "head -n 20 /tmp/development-sql.yaml"
```

---

## Xác Nhận Hoàn Thành Giai Đoạn 0

Agent thực thi cần kiểm tra các điều kiện sau trước khi chuyển sang Giai đoạn 1:

- [ ] File `/tmp/postiz-slim-custom.tar.gz` đã có trên server `sshh.thinhpxp.io.vn` với dung lượng đầy đủ.
- [ ] File `/tmp/development-sql.yaml` đã có trên server `sshh.thinhpxp.io.vn`.

👉 **Tiếp tục thực hiện:** Chuyển sang tài liệu [`02-server-prepare.md`](file:///home/thinhpxp/Documents/postiz-app/plan/02-server-prepare.md).
