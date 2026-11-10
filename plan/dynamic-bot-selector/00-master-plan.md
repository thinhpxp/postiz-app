# Kế hoạch triển khai: Dynamic Bot Selector Config (Hướng 2 - MVP)

> **Phiên bản:** 1.0 | **Ngày:** 2026-11-10 | **Tác giả:** Antigravity Agent
>
> **Dành cho:** AI Agent thực thi — đọc kỹ toàn bộ tài liệu này trước khi bắt đầu bất kỳ thay đổi nào.

---

## Mục tiêu

Thay thế toàn bộ CSS Selector đang hardcode trong `facebook.adapter.ts` bằng cơ chế nạp động từ cấu hình per-channel. Enduser có thể cập nhật selector ngay từ Postiz UI mà **không cần sửa code, không cần rebuild, không cần restart container**.

## Phạm vi (Scope)

| Thành phần | Có thay đổi | Ghi chú |
|---|:---:|---|
| `facebook.adapter.ts` | ✅ | Refactor — đọc selector động với fallback |
| `base-browser.bot.ts` | ❌ | Không đổi |
| `facebook.personal.provider.ts` | ✅ | Truyền `botConfig` vào adapter khi gọi publish/comment |
| `integration.repository.ts` | ❌ | Không đổi — tái dụng `updateProviderSettings` → `additionalSettings` |
| `integration.service.ts` | ❌ | Không đổi |
| `integrations.controller.ts` | ✅ | Thêm 2 endpoint: GET + PUT bot-config |
| `facebook.personal.dto.ts` | ✅ | Thêm field `botConfig` |
| `menu.tsx` | ✅ | Thêm mục "Cấu hình Bot" vào context menu channel |
| Component mới: `bot.config.modal.tsx` | ✅ | Modal nhập/lưu selector config |
| DB Schema / Migration | ❌ | Tái dụng trường `additionalSettings String?` đã có sẵn |

## Cấu trúc tài liệu

```
plan/dynamic-bot-selector/
├── 00-master-plan.md         ← File này: tổng quan + danh sách tác vụ
├── 01-backend-refactor.md    ← Chi tiết thay đổi Backend (adapter + controller)
├── 02-frontend-ui.md         ← Chi tiết thay đổi Frontend (modal + menu)
└── 03-deploy-verify.md       ← Hướng dẫn deploy lên server + kiểm thử
```

## Thứ tự thực thi bắt buộc

```
Phase 1 (Backend) → Phase 2 (Frontend) → Phase 3 (Deploy + Verify)
```

Hai phase 1 & 2 có thể thực thi song song nhau nhưng Phase 3 chỉ được bắt đầu sau khi cả 1 và 2 hoàn tất.

## Danh sách tác vụ (Task Checklist)

### Phase 1 — Backend

- [ ] **Task 1.1** — Định nghĩa TypeScript interface `BotSelectorConfig` và hàm helper `resolveSelector()` (xem chi tiết: `01-backend-refactor.md § 1.1`)
- [ ] **Task 1.2** — Refactor `publishToProfile()` trong `facebook.adapter.ts`: nhận `botConfig?: BotSelectorConfig`, thay hardcode selector bằng `resolveSelector()` (xem `01-backend-refactor.md § 1.2`)
- [ ] **Task 1.3** — Refactor `publishToGroup()` trong `facebook.adapter.ts`: tương tự Task 1.2 (xem `01-backend-refactor.md § 1.3`)
- [ ] **Task 1.4** — Refactor `addCommentToPost()` trong `facebook.adapter.ts`: nhận `botConfig`, thay selector bình luận (xem `01-backend-refactor.md § 1.4`)
- [ ] **Task 1.5** — Cập nhật `facebook.personal.provider.ts`: parse `additionalSettings` → truyền `botConfig` vào các lời gọi adapter (xem `01-backend-refactor.md § 1.5`)
- [ ] **Task 1.6** — Thêm endpoint `GET /integrations/:id/bot-config` vào `integrations.controller.ts` (xem `01-backend-refactor.md § 1.6`)
- [ ] **Task 1.7** — Thêm endpoint `PUT /integrations/:id/bot-config` vào `integrations.controller.ts` (xem `01-backend-refactor.md § 1.7`)

### Phase 2 — Frontend

- [ ] **Task 2.1** — Tạo component `bot.config.modal.tsx` (xem `02-frontend-ui.md § 2.1`)
- [ ] **Task 2.2** — Thêm mục "Cấu hình Bot (Selector)" vào `menu.tsx`, chỉ hiển thị khi `integration.providerIdentifier === 'facebook-personal'` (xem `02-frontend-ui.md § 2.2`)

### Phase 3 — Deploy & Verify

- [ ] **Task 3.1** — Build và deploy lên server `sshh.thinhpxp.io.vn` (xem `03-deploy-verify.md § 3.1`)
- [ ] **Task 3.2** — Kiểm thử end-to-end: cập nhật selector, lên lịch bài đăng, xác nhận bot hoạt động (xem `03-deploy-verify.md § 3.2`)

---

## Quy tắc quan trọng cho Agent thực thi

1. **Không xóa selector mặc định** — luôn giữ selector hardcode hiện tại làm giá trị fallback.
2. **Không migration DB** — dùng trường `additionalSettings` đã có, lưu JSON `{botConfig: {...}}` bên trong.
3. **Không thay đổi logic authentication/cookie** — chỉ thay đổi phần selector trong các method `publishToProfile`, `publishToGroup`, `addCommentToPost`.
4. **Giữ nguyên mọi comment, docstring** tiếng Việt hiện có trong code.
5. **Sau mỗi Phase 1 task**, chạy `pnpm tsc --noEmit` để xác nhận không có lỗi TypeScript trước khi tiếp tục.
6. **Commit riêng lẻ** từng Task với message format: `feat(bot-selector): <mô tả ngắn>`.

