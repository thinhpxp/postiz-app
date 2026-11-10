# Kế hoạch chi tiết: Frontend UI (Phase 2)

> **Tệp:** `plan/dynamic-bot-selector/02-frontend-ui.md`  
> **Mục tiêu:** Cung cấp hướng dẫn chi tiết về xây dựng giao diện cấu hình DOM Selector trong Postiz Frontend, kết nối API backend và đồng bộ với hệ thống Design System của dự án.

---

## 1. Thiết kế Component `bot.config.modal.tsx`

Tạo tệp mới: `apps/frontend/src/components/launches/bot.config.modal.tsx`.

### 1.1. Mục tiêu giao diện
1. Hiển thị form gồm các trường selector được phân nhóm logic:
   - **Trang cá nhân:** Nút mở soạn bài, Khung soạn thảo, Nút Đăng, Nút Tiếp.
   - **Hội nhóm (Group):** Hộp mở bài viết nhóm, Khung soạn thảo, Nút Đăng.
   - **Tải tệp & Bình luận:** Input upload media, Nút mở bình luận, Ô nhập comment, Nút gửi comment.
2. Hiển thị giá trị mặc định hệ thống dưới dạng `placeholder` để người dùng dễ quan sát.
3. Cung cấp:
   - Nút **"Lưu cấu hình"**: Gọi `PUT /integrations/:id/bot-config`.
   - Nút **"Khôi phục mặc định"**: Xóa các selector tùy biến để hệ thống dùng lại bộ selector mặc định.
   - Khung **Hướng dẫn nhanh**: Chỉ rõ cách dùng DevTools (F12) hoặc extension SelectorsHub để copy selector.

### 1.2. Mã nguồn mẫu chi tiết cho `bot.config.modal.tsx`

```tsx
import React, { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface SelectorGroupField {
  key: string;
  label: string;
  description: string;
}

const SELECTOR_FIELDS: { groupTitle: string; fields: SelectorGroupField[] }[] = [
  {
    groupTitle: '1. Soạn bài Trang cá nhân (Profile)',
    fields: [
      {
        key: 'profileFeedBox',
        label: 'Hộp mở soạn bài (Feed Box)',
        description: 'Nút "Bạn đang nghĩ gì?" trên trang cá nhân',
      },
      {
        key: 'profileEditor',
        label: 'Khung nhập nội dung (Editor)',
        description: 'Ô nhập text [contenteditable="true"] trong dialog',
      },
      {
        key: 'profileSubmit',
        label: 'Nút Đăng bài (Submit)',
        description: 'Nút "Đăng" hoặc "Post" trong dialog',
      },
      {
        key: 'profileNextBtn',
        label: 'Nút Tiếp (Next)',
        description: 'Nút "Tiếp" nếu xuất hiện màn hình chọn đối tượng xem',
      },
    ],
  },
  {
    groupTitle: '2. Soạn bài trong Hội nhóm (Groups)',
    fields: [
      {
        key: 'groupFeedBox',
        label: 'Hộp mở soạn bài Nhóm',
        description: 'Nút "Bạn viết gì đi..." trên đầu nhóm Facebook',
      },
      {
        key: 'groupEditor',
        label: 'Khung nhập bài nhóm',
        description: 'Khung soạn thảo văn bản trong dialog của nhóm',
      },
      {
        key: 'groupSubmit',
        label: 'Nút Đăng trong nhóm',
        description: 'Nút "Đăng" bài vào nhóm',
      },
    ],
  },
  {
    groupTitle: '3. Media & Bình luận đầu tiên (First Comment)',
    fields: [
      {
        key: 'mediaInput',
        label: 'Input tải ảnh/video',
        description: 'Selector thẻ input file [type="file"] đính kèm ảnh',
      },
      {
        key: 'commentButton',
        label: 'Nút mở bình luận',
        description: 'Nút "Bình luận" trên card bài viết vừa đăng',
      },
      {
        key: 'commentTextbox',
        label: 'Ô nhập bình luận',
        description: 'Khung gõ nội dung bình luận dưới bài viết',
      },
      {
        key: 'commentSubmitBtn',
        label: 'Nút gửi bình luận',
        description: 'Nút gửi bình luận hoặc icon máy bay',
      },
    ],
  },
];

export const BotConfigModal: FC<{
  integrationId: string;
  channelName: string;
  onClose: () => void;
}> = ({ integrationId, channelName, onClose }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await (await fetch(`/integrations/${integrationId}/bot-config`)).json();
        setDefaults(res.defaults || {});
        setConfig(res.custom || {});
      } catch (e) {
        toast.show(t('cannot_load_bot_config', 'Không thể tải cấu hình Bot'), 'danger');
      } finally {
        setLoading(false);
      }
    })();
  }, [integrationId]);

  const handleFieldChange = (key: string, val: string) => {
    setConfig((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Làm sạch các trường chỉ toàn khoảng trắng
      const cleanedConfig: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) {
        if (v && v.trim()) {
          cleanedConfig[k] = v.trim();
        }
      }

      await fetch(`/integrations/${integrationId}/bot-config`, {
        method: 'PUT',
        body: JSON.stringify({ botConfig: cleanedConfig }),
      });

      toast.show(t('bot_config_saved', 'Đã lưu cấu hình Bot Selector thành công!'), 'success');
      modal.closeAll();
      onClose();
    } catch (err: any) {
      toast.show(err.message || 'Lưu cấu hình thất bại', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig({});
    toast.show(t('reset_to_default_hint', 'Đã xóa tùy biến. Bot sẽ dùng bộ Selector mặc định.'), 'info');
  };

  if (loading) {
    return <div className="p-8 text-center text-white">Đang tải cấu hình...</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-h-[75vh] overflow-y-auto px-2 pr-4 text-white">
      {/* Banner hướng dẫn */}
      <div className="p-4 bg-seventh/40 border border-sixth rounded-lg text-sm text-gray-300">
        <p className="font-semibold text-primary mb-1">💡 Hướng dẫn lấy Selector khi Facebook đổi giao diện:</p>
        <ul className="list-disc pl-5 space-y-1 text-xs">
          <li>Mở Facebook trên trình duyệt máy tính, nhấn <code>F12</code> để bật DevTools.</li>
          <li>Bấm vào biểu tượng trỏ phần tử (Ctrl+Shift+C), click vào nút bấm hoặc ô nhập cần lấy.</li>
          <li>Nhấp chuột phải vào dòng code HTML tương ứng → Chọn <strong>Copy</strong> → <strong>Copy selector</strong>.</li>
          <li>Dán vào ô tương ứng bên dưới. Nếu để trống, hệ thống sẽ tự động dùng Selector mặc định.</li>
        </ul>
      </div>

      {/* Danh sách các nhóm trường */}
      {SELECTOR_FIELDS.map((group) => (
        <div key={group.groupTitle} className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-primary uppercase tracking-wider">
            {group.groupTitle}
          </h4>
          <div className="flex flex-col gap-3 bg-secondary/30 p-3 rounded-lg border border-sixth/50">
            {group.fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-200">
                  {f.label}
                  <span className="text-[11px] text-gray-400 ml-2 font-normal">
                    ({f.description})
                  </span>
                </label>
                <input
                  type="text"
                  value={config[f.key] || ''}
                  placeholder={defaults[f.key] || 'Selector mặc định...'}
                  onChange={(e) => handleFieldChange(f.key, e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-input border border-customColor rounded font-mono text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Nút hành động */}
      <div className="flex justify-between items-center pt-4 border-t border-sixth">
        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-xs text-red-400 hover:text-red-300 underline"
        >
          Khôi phục tất cả về mặc định
        </button>
        <div className="flex gap-2">
          <Button secondary onClick={() => modal.closeAll()}>
            Đóng
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </Button>
        </div>
      </div>
    </div>
  );
};
```

---

## 2. Tích hợp nút mở Modal vào Menu Context (`menu.tsx`)

Trong tệp [`apps/frontend/src/components/launches/menu/menu.tsx`](file:///home/thinhpxp/Documents/postiz-app/apps/frontend/src/components/launches/menu/menu.tsx):

### 2.1. Import component
```tsx
import { BotConfigModal } from '@gitroom/frontend/components/launches/bot.config.modal';
```

### 2.2. Callback mở Modal
Thêm callback bên cạnh các hàm `additionalSettings`, `changeBotPicture`:
```tsx
  const openBotConfig = useCallback(() => {
    const findIntegration = integrations.find(
      (integration) => integration.id === id
    );
    modal.openModal({
      title: t('bot_selector_config', `Cấu hình Bot DOM: ${findIntegration?.name || ''}`),
      classNames: {
        modal: 'w-[100%] max-w-[700px] text-textColor',
      },
      children: (
        <BotConfigModal
          integrationId={id}
          channelName={findIntegration?.name || ''}
          onClose={() => {
            mutate();
          }}
        />
      ),
    });
    setShow(false);
  }, [integrations, id, t]);
```

### 2.3. Hiển thị mục trong menu thả xuống
Trong danh sách các `div` hành động, đặt ngay dưới mục `additionalSettings`:
```tsx
          {findIntegration?.providerIdentifier === 'facebook-personal' && (
            <div
              className="flex gap-[12px] items-center py-[8px] px-[10px] cursor-pointer hover:bg-seventh/40 rounded transition"
              onClick={openBotConfig}
            >
              <div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                  <path d="M2 14h2" />
                  <path d="M20 14h2" />
                  <path d="M15 13v2" />
                  <path d="M9 13v2" />
                </svg>
              </div>
              <div className="text-[14px]">
                {t('bot_selector_config', 'Cấu hình DOM Selector')}
              </div>
            </div>
          )}
```

---

## 3. Kiểm tra & Thẩm định Frontend

Sau khi hoàn thành Phase 2, chạy lệnh kiểm tra build frontend:
```bash
# Kiểm tra TypeScript
pnpm tsc --noEmit

# Kiểm tra build Next.js frontend
NODE_OPTIONS='--max-old-space-size=4096' pnpm --filter postiz-frontend run build
```
Quá trình biên dịch Next.js thành công mà không có lỗi JSX/TSX.

