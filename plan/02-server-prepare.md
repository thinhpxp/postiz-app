# Giai Đoạn 1 — Chuẩn Bị Server Online

## Mục Tiêu
Khởi tạo cấu trúc thư mục `/opt/postiz` trên server production, phân quyền sở hữu cho user `thinhpxp`, nạp Docker image của Postiz và tải các image phụ trợ.

---

## Môi Trường Thực Hiện: MÁY CHỦ ONLINE (`sshh.thinhpxp.io.vn`)
> Tất cả các bước sau được thực hiện qua kết nối SSH tới server `sshh.thinhpxp.io.vn`.

```bash
ssh sshh.thinhpxp.io.vn
```

---

### Bước 1.1 — Khởi Tạo Thư Mục `/opt/postiz` Và Phân Quyền

Theo quy ước chuẩn trên server này (tương tự `/opt/ghost`, `/opt/sapnhap`, `/opt/smartdraftinghub`), toàn bộ stack Postiz sẽ nằm tại `/opt/postiz/`.

Thực hiện tạo thư mục và gán quyền sở hữu cho user `thinhpxp`:

```bash
sudo mkdir -p /opt/postiz/{postgres-data,uploads,dynamicconfig}
sudo chown -R thinhpxp:thinhpxp /opt/postiz
```

Kiểm tra thư mục vừa tạo:
```bash
ls -ld /opt/postiz
ls -la /opt/postiz/
```

**Kết quả mong đợi:**
Thư mục thuộc quyền `thinhpxp:thinhpxp` với 3 thư mục con:
```
drwxr-xr-x  dynamicconfig/
drwxr-xr-x  postgres-data/
drwxr-xr-x  uploads/
```

---

### Bước 1.2 — Chuyển Tệp Dynamicconfig Vào Vị Trí Chính Thức

Di chuyển tệp đã trung chuyển từ `/tmp` ở Giai đoạn 0 vào `/opt/postiz/dynamicconfig/`:

```bash
mv /tmp/development-sql.yaml /opt/postiz/dynamicconfig/development-sql.yaml
```

Kiểm tra tệp:
```bash
ls -la /opt/postiz/dynamicconfig/development-sql.yaml
head -n 15 /opt/postiz/dynamicconfig/development-sql.yaml
```

---

### Bước 1.3 — Nạp Docker Image `postiz:slim-custom`

Load image từ tệp nén đã chuyển sang `/tmp`:

```bash
docker load < /tmp/postiz-slim-custom.tar.gz
```

*Thời gian thực hiện:* 1 – 2 phút.

Kiểm tra image đã sẵn sàng trong Docker engine của server:
```bash
docker images postiz:slim-custom
```

**Kết quả mong đợi:**
Có dòng hiển thị image `postiz:slim-custom`.

Sau khi load thành công, có thể xóa file nén tạm trong `/tmp` để giải phóng dung lượng đĩa:
```bash
rm -f /tmp/postiz-slim-custom.tar.gz
```

---

### Bước 1.4 — Kéo Các Docker Image Phụ Trợ

Tải 2 image cần thiết từ Docker Hub (PostgreSQL và Temporal Engine):

```bash
docker pull postgres:17-alpine
docker pull temporalio/auto-setup:1.28.1
```

Kiểm tra lại toàn bộ các image cần thiết:
```bash
docker images | grep -E 'postiz|postgres|temporal'
```

---

### Bước 1.5 — Kiểm Tra Tính Sẵn Sàng Của Các Cổng Mạng

Xác nhận các cổng dự kiến sử dụng cho Postiz hiện đang trống:

```bash
ss -tlnp | grep -E ':(5000|5001|8087)'
```

**Kết quả mong đợi:**
Không có bất kỳ tiến trình nào đang chiếm dụng cổng `:5000`, `:5001` hoặc `:8087`.

> [!WARNING]
> Nếu có cổng nào đang bị chiếm, AI Agent phải kiểm tra tiến trình đang chạy và báo cáo người dùng hoặc đổi sang cổng khác an toàn.

---

### Bước 1.6 — Xác Minh Dịch Vụ Native Valkey Đang Hoạt Động

Kiểm tra xem Valkey native của server có đang lắng nghe trên cổng 6379 không:

```bash
ss -tlnp | grep :6379
```

**Kết quả mong đợi:**
Có tiến trình valkey-server lắng nghe trên `127.0.0.1:6379` hoặc `0.0.0.0:6379`.

*(Lưu ý: Mật khẩu Valkey sẽ do người dùng tự điền vào `.env` ở Giai đoạn 2, không kiểm tra mật khẩu bằng script ở bước này).*

---

## Xác Nhận Hoàn Thành Giai Đoạn 1

- [ ] Thư mục `/opt/postiz/` và các thư mục con đã được tạo và gán quyền `thinhpxp:thinhpxp`.
- [ ] Tệp `/opt/postiz/dynamicconfig/development-sql.yaml` đã có mặt.
- [ ] Image `postiz:slim-custom` đã nạp thành công vào Docker.
- [ ] Image `postgres:17-alpine` và `temporalio/auto-setup:1.28.1` đã pull xong.
- [ ] Các cổng `:5000`, `:5001`, `:8087` hoàn toàn trống.
- [ ] Valkey host đang lắng nghe trên cổng `:6379`.

👉 **Tiếp tục thực hiện:** Chuyển sang tài liệu [`03-config-files.md`](file:///home/thinhpxp/Documents/postiz-app/plan/03-config-files.md).
