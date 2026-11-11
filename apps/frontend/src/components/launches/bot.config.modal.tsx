'use client';

import { TopTitle } from '@gitroom/frontend/components/launches/helpers/top.title.component';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Integration } from '@prisma/client';

/** Danh sách selector cho Facebook */
const FB_SELECTOR_FIELDS = [
  {
    group: 'Trang cá nhân (Profile)',
    fields: [
      { key: 'profileFeedBox', label: 'Nút mở soạn bài (Feed Box)' },
      { key: 'profileEditor', label: 'Khung soạn thảo (Editor)' },
      { key: 'profileSubmit', label: 'Nút Đăng (Submit)' },
      { key: 'profileNextBtn', label: 'Nút Tiếp (Next — nếu có)' },
    ],
  },
  {
    group: 'Nhóm (Group)',
    fields: [
      { key: 'groupFeedBox', label: 'Nút mở soạn bài trong Group' },
      { key: 'groupEditor', label: 'Khung soạn thảo trong Group' },
      { key: 'groupSubmit', label: 'Nút Đăng trong Group' },
    ],
  },
  {
    group: 'Media & Bình luận',
    fields: [
      { key: 'mediaInput', label: 'Input tải file ảnh/video' },
      { key: 'commentButton', label: 'Nút mở bình luận' },
      { key: 'commentTextbox', label: 'Ô nhập bình luận' },
      { key: 'commentSubmitBtn', label: 'Nút gửi bình luận' },
    ],
  },
] as const;

/** Danh sách selector cho X / Twitter */
const X_SELECTOR_FIELDS = [
  {
    group: 'Soạn Tweet',
    fields: [
      { key: 'tweetEditor', label: 'Khung soạn thảo Tweet' },
      { key: 'tweetSubmit', label: 'Nút Đăng Tweet' },
      { key: 'mediaInput', label: 'Input tải ảnh / video' },
    ],
  },
  {
    group: 'Bình luận / Trả lời (Reply)',
    fields: [
      { key: 'replyEditor', label: 'Khung soạn thảo Reply' },
      { key: 'replySubmit', label: 'Nút gửi Reply' },
    ],
  },
] as const;

type SelectorKey = string;

interface BotConfigData {
  custom: Partial<Record<string, string>>;
  defaults: Record<string, string>;
  provider: string;
}

export const BotConfigModal: FC<{
  integration: Integration & { customer?: { id: string; name: string } };
  onClose: () => void;
}> = (props) => {
  const { integration, onClose } = props;
  const fetch = useFetch();
  const modal = useModals();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<BotConfigData | null>(null);
  // values: giá trị người dùng đang nhập (rỗng = dùng default)
  const [values, setValues] = useState<Partial<Record<SelectorKey, string>>>({});

  const isX =
    integration?.providerIdentifier === 'x-personal' ||
    (integration as any)?.identifier === 'x-personal' ||
    data?.provider === 'x-personal';

  const selectorGroups = isX ? X_SELECTOR_FIELDS : FB_SELECTOR_FIELDS;
  const platformName = isX ? 'X (Twitter)' : 'Facebook';

  /** Load cấu hình hiện tại từ server */
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/integrations/${integration.id}/bot-config`);
      if (res.ok) {
        const json: BotConfigData = await res.json();
        setData(json);
        setValues(json.custom || {});
      }
    } catch (err) {
      console.error('[BotConfigModal] loadConfig error', err);
    } finally {
      setLoading(false);
    }
  }, [integration.id, fetch]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleChange = useCallback((key: SelectorKey, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  /** Lưu cấu hình — chỉ lưu các trường không rỗng */
  const handleSave = useCallback(async () => {
    setSaving(true);
    // Loại bỏ các trường rỗng để không ghi đè default không cần thiết
    const cleaned: Partial<Record<SelectorKey, string>> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === 'string' && v.trim()) {
        cleaned[k as SelectorKey] = v.trim();
      }
    }
    try {
      const res = await fetch(`/integrations/${integration.id}/bot-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botConfig: cleaned }),
      });
      if (res.ok) {
        modal.closeAll();
        onClose();
      }
    } catch (err) {
      console.error('[BotConfigModal] save error', err);
    } finally {
      setSaving(false);
    }
  }, [values, integration.id, fetch, modal, onClose]);

  /** Reset tất cả về rỗng (hệ thống sẽ dùng default) */
  const handleReset = useCallback(async () => {
    setValues({});
  }, []);

  return (
    <div className="rounded-[4px] border border-tableBorder bg-sixth p-[20px] w-[600px] flex flex-col gap-[20px]">
      <TopTitle title="Cấu hình DOM Selector" />

      {/* Banner hướng dẫn */}
      <div className="bg-blue-900/30 border border-blue-500/40 rounded p-3 text-[13px] text-blue-200">
        <strong>Hướng dẫn:</strong> Để lấy CSS Selector đúng, mở {platformName} trong Chrome → F12 (DevTools)
        → chọn tab <strong>Elements</strong> → click chuột phải vào phần tử → <strong>Copy → Copy selector</strong>.
        Để trống ô nào thì hệ thống dùng selector mặc định cho ô đó.
      </div>

      {loading ? (
        <div className="text-center py-8 text-textColor/60">Đang tải cấu hình...</div>
      ) : (
        <div className="flex flex-col gap-[16px] max-h-[60vh] overflow-y-auto pr-1">
          {selectorGroups.map((group) => (
            <div key={group.group} className="flex flex-col gap-[8px]">
              <div className="text-[14px] font-semibold text-textColor border-b border-tableBorder pb-1">
                {group.group}
              </div>
              {group.fields.map((field) => {
                const key = field.key;
                const defaultVal = data?.defaults[key] ?? '';
                const currentVal = values[key] ?? '';
                return (
                  <div key={key} className="flex flex-col gap-[4px]">
                    <label className="text-[12px] text-textColor/70">{field.label}</label>
                    <input
                      type="text"
                      value={currentVal}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder={defaultVal}
                      className="
                        w-full px-3 py-2 rounded
                        bg-input border border-tableBorder
                        text-[12px] font-mono text-textColor
                        placeholder:text-textColor/30
                        focus:outline-none focus:border-blue-500
                      "
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-2 border-t border-tableBorder">
        <Button
          onClick={handleReset}
          className="bg-transparent border border-tableBorder text-textColor/70 hover:text-textColor"
          loading={false}
        >
          Đặt lại mặc định
        </Button>
        <Button onClick={handleSave} loading={saving}>
          Lưu cấu hình
        </Button>
      </div>
    </div>
  );
};
