// 设置弹窗：配置各 AI 功能的「免费 / 自定义API」
//
// 每个 AI 功能独立配置：
//   - 免费（默认）：使用自带方案，无需任何配置
//   - 自定义 API：填入 URL + Key + 响应类型

import { useState, useEffect } from 'react';
import { X, Settings, Save, Info, Cloud, Scissors } from 'lucide-react';
import { getSettings, saveSettings, type AppSettings, type AiProvider, type ResponseType } from '../services/settings';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface FeatureSectionProps {
  icon: typeof Cloud;
  title: string;
  freeDesc: string;
  provider: AiProvider;
  onProviderChange: (p: AiProvider) => void;
  config: AppSettings['upscale']['customApi'];
  onConfigChange: (c: AppSettings['upscale']['customApi']) => void;
  /** 该功能的额外表单字段说明 */
  extraFields?: string;
}

function FeatureSection({
  icon: Icon,
  title,
  freeDesc,
  provider,
  onProviderChange,
  config,
  onConfigChange,
  extraFields,
}: FeatureSectionProps) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={18} className="text-brand-600 dark:text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      </div>

      {/* Provider 选择 */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onProviderChange('free')}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            provider === 'free'
              ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          免费模型（默认）
        </button>
        <button
          type="button"
          onClick={() => onProviderChange('custom')}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            provider === 'custom'
              ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          自定义 API
        </button>
      </div>

      {provider === 'free' ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{freeDesc}</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              API 地址
            </label>
            <input
              type="url"
              value={config.url}
              onChange={(e) => onConfigChange({ ...config, url: e.target.value })}
              placeholder="https://your-api.com/upscale"
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              API Key（可选）
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => onConfigChange({ ...config, apiKey: e.target.value })}
              placeholder="sk-..."
              className="input-field"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              响应格式
            </label>
            <div className="flex gap-2">
              {([
                { value: 'blob' as ResponseType, label: '直接返回图片' },
                { value: 'json-url' as ResponseType, label: '返回 JSON (含 url)' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onConfigChange({ ...config, responseType: opt.value })}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                    config.responseType === opt.value
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {extraFields && (
            <div className="flex items-start gap-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>额外字段：{extraFields}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  useEffect(() => {
    if (open) setSettings(getSettings());
  }, [open]);

  const handleSave = () => {
    saveSettings(settings);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-brand-600 dark:text-brand-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">AI 功能设置</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="space-y-4 p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            所有 AI 功能默认使用免费模型，无需配置。如果你想接入自己的付费/更强大的 API，
            可将对应功能切换为「自定义 API」并填入信息。
          </p>

          <FeatureSection
            icon={Cloud}
            title="图片放大 / 模糊修复"
            freeDesc="使用 image-upscaling.net 免费 Real-ESRGAN + 扩散模型，无需配置"
            provider={settings.upscale.provider}
            onProviderChange={(p) => setSettings((s) => ({ ...s, upscale: { ...s.upscale, provider: p } }))}
            config={settings.upscale.customApi}
            onConfigChange={(c) => setSettings((s) => ({ ...s, upscale: { ...s.upscale, customApi: c } }))}
            extraFields="scale(2/4) · mode(upscale/restore) · face_enhance(true/false)"
          />

          <FeatureSection
            icon={Scissors}
            title="AI 抠图 / 证件照换底"
            freeDesc="使用浏览器本地 MODNet 模型，完全离线，无需配置。同时作用于「AI 抠图」和「证件照换底」两个功能"
            provider={settings.removeBg.provider}
            onProviderChange={(p) => setSettings((s) => ({ ...s, removeBg: { ...s.removeBg, provider: p } }))}
            config={settings.removeBg.customApi}
            onConfigChange={(c) => setSettings((s) => ({ ...s, removeBg: { ...s.removeBg, customApi: c } }))}
          />

          {/* API 契约说明 */}
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <div className="mb-2 flex items-center gap-1.5">
              <Info size={14} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">自定义 API 契约</span>
            </div>
            <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-600 dark:text-slate-400"><code>{`请求：
  POST {你的API地址}
  Headers: Authorization: Bearer {apiKey}
  Body: multipart/form-data
    image: PNG 图片文件
    scale: "2" | "4"          (仅放大)
    mode: "upscale"|"restore" (仅放大)
    face_enhance: "true"|"false"(仅放大)

响应（二选一）：
  blob    → 直接返回图片二进制
  json-url→ {"url": "https://结果图URL"}`}</code></pre>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button type="button" onClick={handleSave} className="btn-primary">
            <Save size={16} /> 保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
