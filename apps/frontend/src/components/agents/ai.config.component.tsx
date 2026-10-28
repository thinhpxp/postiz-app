'use client';

import React, { FC, useState, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export interface AiConfigData {
  isConfigured: boolean;
  maskedKey: string;
  model: string;
  baseUrl: string;
  isAdmin: boolean;
}

interface Preset {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  placeholderKey: string;
  docUrl: string;
}

const PRESETS: Preset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    model: 'gpt-4.1',
    baseUrl: '',
    placeholderKey: 'sk-proj-...',
    docUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    model: 'openai/gpt-4o',
    baseUrl: 'https://openrouter.ai/api/v1',
    placeholderKey: 'sk-or-v1-...',
    docUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    placeholderKey: 'sk-...',
    docUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'custom',
    name: 'Custom / Proxy',
    model: 'gpt-4.1',
    baseUrl: 'http://localhost:11434/v1',
    placeholderKey: 'sk-...',
    docUrl: '',
  },
];

const QUICK_MODELS = [
  'gpt-4.1',
  'gpt-4o',
  'gpt-4o-mini',
  'deepseek-chat',
  'anthropic/claude-3.5-sonnet',
];

export const AiConfigSetup: FC<{
  config?: AiConfigData;
  onSaveSuccess: (updated: any) => void;
}> = ({ config, onSaveSuccess }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();

  const [activePreset, setActivePreset] = useState<string>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4.1');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectPreset = useCallback((preset: Preset) => {
    setActivePreset(preset.id);
    setModel(preset.model);
    setBaseUrl(preset.baseUrl);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toaster.show(
        t('ai_api_key_required', 'Vui lòng nhập API Key để kích hoạt AI'),
        'warning'
      );
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch('/copilot/config', {
        method: 'POST',
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          model: model.trim() || 'gpt-4.1',
          baseUrl: baseUrl.trim() || '',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || 'Không thể lưu cấu hình AI');
      }

      const updated = await res.json();
      toaster.show(
        t('ai_saved_success', 'Đã lưu và kích hoạt trợ lý AI thành công!'),
        'success'
      );
      onSaveSuccess(updated);
    } catch (err: any) {
      toaster.show(
        err?.message || t('ai_save_failed', 'Lỗi khi lưu cấu hình AI'),
        'warning'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const currentPreset = useMemo(
    () => PRESETS.find((p) => p.id === activePreset) || PRESETS[0],
    [activePreset]
  );

  if (!config?.isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 h-full">
        <div className="bg-newBgColor border border-newTableBorder rounded-2xl p-8 max-w-lg w-full text-center shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">
            {t('ai_assistant_not_configured', 'Trợ lý AI chưa được kích hoạt')}
          </h3>
          <p className="text-sm text-textColor/70 mb-4 leading-relaxed">
            {t(
              'ai_assistant_admin_only',
              'Chức năng AI Assistant chưa được cấu hình. Chỉ Quản trị viên (Admin) mới có quyền thiết lập API Key. Vui lòng liên hệ Admin của hệ thống để kích hoạt.'
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 h-full overflow-y-auto">
      <div className="bg-newBgColor border border-newTableBorder rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#612BD3] to-[#9E72FF] text-white flex items-center justify-center shadow-md shrink-0">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">
              {t(
                'ai_assistant_setup_title',
                'Cấu hình Trợ lý AI (Postiz AI Assistant)'
              )}
            </h2>
            <p className="text-xs sm:text-sm text-textColor/70 mt-1">
              {t(
                'ai_assistant_setup_desc',
                'Khai báo API Key của OpenAI hoặc nhà cung cấp AI tương thích ngay tại đây mà không cần sửa tệp cấu hình máy chủ.'
              )}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5">
          {/* Preset Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textColor/70 mb-2">
              {t('ai_provider_preset', 'Chọn nhà cung cấp AI')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => selectPreset(preset)}
                  className={clsx(
                    'px-3 py-2.5 rounded-lg text-xs font-medium border text-center transition-all',
                    activePreset === preset.id
                      ? 'bg-[#612BD3]/10 border-[#612BD3] text-[#612BD3] font-semibold'
                      : 'bg-newBgColorInner border-newTableBorder text-textColor hover:bg-boxHover'
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-textColor/70">
                {t('api_key_label', 'API Key')}{' '}
                <span className="text-red-500">*</span>
              </label>
              {currentPreset.docUrl && (
                <a
                  href={currentPreset.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#612BD3] hover:underline"
                >
                  {t('get_api_key_link', 'Lấy API Key')} &rarr;
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={currentPreset.placeholderKey}
                required
                className="w-full bg-newBgColorInner border border-newTableBorder rounded-lg px-3.5 py-2.5 text-sm text-textColor placeholder:text-textColor/40 focus:outline-none focus:border-[#612BD3] pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textColor/50 hover:text-textColor p-1"
                aria-label="Toggle password visibility"
              >
                {showKey ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[11px] text-textColor/50 mt-1">
              {t(
                'api_key_stored_securely',
                'Khóa API được mã hóa an toàn trong cơ sở dữ liệu và chỉ kích hoạt tại máy chủ của bạn.'
              )}
            </p>
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textColor/70 mb-1.5">
              {t('model_label', 'Mô hình AI (Model)')}
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4.1 hoặc deepseek-chat..."
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-lg px-3.5 py-2.5 text-sm text-textColor placeholder:text-textColor/40 focus:outline-none focus:border-[#612BD3] font-mono mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_MODELS.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setModel(m)}
                  className={clsx(
                    'text-[11px] px-2.5 py-1 rounded-full border transition-all font-mono',
                    model === m
                      ? 'bg-[#612BD3] text-white border-[#612BD3]'
                      : 'bg-newBgColorInner border-newTableBorder text-textColor/70 hover:text-textColor hover:bg-boxHover'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL (Optional) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textColor/70 mb-1.5">
              {t('base_url_label', 'API Base URL (Tùy chọn)')}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1 (để trống nếu dùng OpenAI mặc định)"
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-lg px-3.5 py-2.5 text-sm text-textColor placeholder:text-textColor/40 focus:outline-none focus:border-[#612BD3] font-mono text-xs"
            />
            <p className="text-[11px] text-textColor/50 mt-1">
              {t(
                'base_url_desc',
                'Hỗ trợ OpenRouter, DeepSeek, Ollama, vLLM hoặc Reverse Proxy tương thích với chuẩn OpenAI.'
              )}
            </p>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#612BD3] to-[#7B42F6] hover:opacity-95 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>{t('saving', 'Đang lưu & kết nối...')}</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>
                    {t('save_and_activate_ai', 'Lưu & Kích hoạt Trợ lý AI')}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AiConfigModal: FC<{
  isOpen: boolean;
  onClose: () => void;
  config?: AiConfigData;
  onSaveSuccess: (updated: any) => void;
  onDeleteSuccess: () => void;
}> = ({ isOpen, onClose, config, onSaveSuccess, onDeleteSuccess }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(config?.model || 'gpt-4.1');
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl || '');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync state if config changes
  React.useEffect(() => {
    if (config) {
      setModel(config.model || 'gpt-4.1');
      setBaseUrl(config.baseUrl || '');
      setApiKey('');
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const payload: { apiKey?: string; model?: string; baseUrl?: string } = {
        model: model.trim() || 'gpt-4.1',
        baseUrl: baseUrl.trim() || '',
      };
      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const res = await fetch('/copilot/config', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.message || 'Không thể cập nhật cấu hình AI');
      }

      const updated = await res.json();
      toaster.show(
        t('ai_saved_success', 'Đã lưu cấu hình AI thành công!'),
        'success'
      );
      onSaveSuccess(updated);
      onClose();
    } catch (err: any) {
      toaster.show(
        err?.message || t('ai_save_failed', 'Lỗi khi lưu cấu hình AI'),
        'warning'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        t(
          'ai_delete_confirm',
          'Bạn có chắc chắn muốn gỡ cấu hình AI? Trợ lý AI sẽ ngừng hoạt động cho đến khi được cấu hình lại.'
        )
      )
    ) {
      return;
    }

    try {
      setIsDeleting(true);
      const res = await fetch('/copilot/config', {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Không thể gỡ cấu hình AI');
      }

      toaster.show(t('ai_deleted_success', 'Đã gỡ cấu hình AI!'), 'success');
      onDeleteSuccess();
      onClose();
    } catch (err: any) {
      toaster.show(err?.message || 'Lỗi khi gỡ cấu hình', 'warning');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-newBgColor border border-newTableBorder rounded-2xl p-6 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-newTableBorder mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#612BD3]/10 text-[#612BD3] flex items-center justify-center">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {t('ai_settings_title', 'Cấu hình Trợ lý AI')}
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {t('ai_active', 'Đang hoạt động')}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-textColor/50 hover:text-textColor hover:bg-boxHover transition-all"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {/* Current Key Indicator & Replace */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textColor/70 mb-1.5">
              {t('api_key_label', 'API Key')}
            </label>
            {config?.maskedKey && (
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-newBgColorInner border border-newTableBorder text-xs font-mono text-textColor/80 flex items-center justify-between">
                <span>{t('current_key', 'Khóa hiện tại')}:</span>
                <span className="font-bold text-[#612BD3]">
                  {config.maskedKey}
                </span>
              </div>
            )}
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t(
                  'api_key_edit_placeholder',
                  'Nhập khóa mới nếu muốn thay đổi (bỏ trống để giữ khóa cũ)'
                )}
                className="w-full bg-newBgColorInner border border-newTableBorder rounded-lg px-3.5 py-2.5 text-xs text-textColor placeholder:text-textColor/40 focus:outline-none focus:border-[#612BD3] pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textColor/50 hover:text-textColor p-1"
              >
                {showKey ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textColor/70 mb-1.5">
              {t('model_label', 'Mô hình AI (Model)')}
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4.1"
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-lg px-3.5 py-2 text-xs text-textColor placeholder:text-textColor/40 focus:outline-none focus:border-[#612BD3] font-mono mb-1.5"
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_MODELS.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setModel(m)}
                  className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full border transition-all font-mono',
                    model === m
                      ? 'bg-[#612BD3] text-white border-[#612BD3]'
                      : 'bg-newBgColorInner border-newTableBorder text-textColor/70 hover:text-textColor'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textColor/70 mb-1.5">
              {t('base_url_label', 'API Base URL (Tùy chọn)')}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-newBgColorInner border border-newTableBorder rounded-lg px-3.5 py-2 text-xs text-textColor placeholder:text-textColor/40 focus:outline-none focus:border-[#612BD3] font-mono"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-newTableBorder flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-all border border-red-500/20 cursor-pointer"
            >
              {isDeleting
                ? t('deleting', 'Đang gỡ...')
                : t('remove_ai_config', 'Gỡ cấu hình AI')}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs px-3.5 py-2 rounded-lg border border-newTableBorder hover:bg-boxHover transition-all text-textColor cursor-pointer"
              >
                {t('cancel', 'Hủy')}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="text-xs px-4 py-2 rounded-lg bg-[#612BD3] hover:bg-[#5022B8] text-white font-medium transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSaving
                  ? t('saving', 'Đang lưu...')
                  : t('save_changes', 'Lưu thay đổi')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
