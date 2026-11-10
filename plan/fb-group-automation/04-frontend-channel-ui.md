# Phase 4: Tích hợp Giao diện Người dùng Đa Kênh (Frontend Next.js)

> **Mục tiêu:** Bổ sung icon nhận diện cho `facebook-personal`, đăng ký vào bảng điều khiển soạn bài đa kênh (New Launch), và tối ưu giao diện chọn kênh giữa Trang cá nhân và Hội nhóm.

---

## 1. Icon Nhận diện Nền tảng

1. **Vị trí icon:**
   [`apps/frontend/public/icons/platforms/facebook-personal.png`](file:///home/thinhpxp/Documents/postiz-app/apps/frontend/public/icons/platforms/)
2. **Hình ảnh:**
   - Dùng icon Facebook có biểu tượng cá nhân / profile (hoặc dùng bản copy của `facebook.png` đổi tên thành `facebook-personal.png`).

---

## 2. Đăng ký Provider vào Trình soạn thảo (`show.all.providers.tsx`)

Mở file:
[`apps/frontend/src/components/new-launch/providers/show.all.providers.tsx`](file:///home/thinhpxp/Documents/postiz-app/apps/frontend/src/components/new-launch/providers/show.all.providers.tsx)

```typescript
import FacebookProvider from '@gitroom/frontend/components/new-launch/providers/facebook/facebook.provider';

export const Providers = [
  // ...
  {
    identifier: 'facebook',
    component: FacebookProvider, // Facebook Page chính quy
  },
  {
    identifier: 'facebook-personal',
    component: FacebookProvider, // Facebook Cá nhân (Profile & Groups)
  },
  // ...
];
```

---

## 3. Trải nghiệm Người dùng (UX Flow) Hoàn chỉnh

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant UI as Postiz Web UI
    participant Backend as NestJS Backend
    participant Adapter as FacebookAdapter
    participant Chrome as Browserless

    User->>UI: Bấm "Add Channel" -> Chọn "Facebook (Cá nhân & Nhóm)"
    UI->>User: Hiển thị form: Dán Facebook Cookie (JSON/String)
    User->>UI: Nhập Cookie -> Bấm Xác nhận
    UI->>Backend: Gửi dữ liệu mã hóa qua /integrations/social/facebook-personal
    Backend->>Adapter: validateSession(cookies)
    Adapter->>Chrome: Mở Facebook xác nhận phiên
    Chrome-->>Adapter: Trả về c_user, Tên User, Avatar
    Backend->>Adapter: getJoinedGroups(cookies)
    Adapter->>Chrome: Lấy danh sách nhóm
    Chrome-->>Adapter: Trả về danh sách Groups
    Backend-->>UI: Hiển thị Modal "Chọn Kênh quản lý"
    Note over UI,User: Danh sách gồm:<br/>1. Trang cá nhân (Nguyễn Văn A)<br/>2. [Nhóm] Hội Lập Trình Viên<br/>3. [Nhóm] Cộng Đồng AI
    User->>UI: Tích chọn Trang cá nhân VÀ các nhóm muốn quản lý
    UI->>Backend: Lưu các Channel vào Database
    UI-->>User: Các kênh mới xuất hiện ngay trên thanh Sidebar!
```

---

## 4. Quản lý Lịch Đăng Đa Nền tảng
- Trong màn hình Lịch (Calendar) hoặc Tạo bài mới (New Launch):
  - Người dùng có thể tích chọn đồng thời:
    - 🔵 `Facebook Page: Công ty XYZ` (chạy qua Meta Graph API)
    - 👤 `FB Profile: Nguyễn Văn A` (chạy qua Browserless)
    - 👥 `FB Group: Hội Khởi Nghiệp` (chạy qua Browserless)
    - 🐦 `X (Twitter)`
  - Chỉ với 1 lần bấm **Schedule**, Temporal sẽ tự động điều phối bài viết đến đúng từng kênh mà người dùng đã chọn.
