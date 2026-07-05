import { useState, useEffect } from 'react';
import { X, Key, ExternalLink, Shield, Check } from 'lucide-react';
import { getReplicateToken, setReplicateToken } from '../services/cloudSuperResolution';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Token 变更回调（用于父组件刷新状态） */
  onTokenChange?: (token: string) => void;
}

/**
 * 设置弹窗：用户填入 Replicate API Token
 *
 * Token 仅保存在用户本地 localStorage，不上传到任何服务器。
 */
export default function SettingsModal({ open, onClose, onTokenChange }: SettingsModalProps) {
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setToken(getReplicateToken());
      setSaved(false);
    }
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    const trimmed = token.trim();
    setReplicateToken(trimmed);
    onTokenChange?.(trimmed);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const handleClear = () => {
    setToken('');
    setReplicateToken('');
    onTokenChange?.('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X size={20} />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <Key size={20} className="text-brand-600" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">设置 API Token</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Replicate API Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Token 以 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">r8_</code> 开头
            </p>
          </div>

          {/* 教程 */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <p className="mb-2 font-medium text-slate-700 dark:text-slate-200">如何获取 Token？</p>
            <ol className="list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              <li>
                注册 Replicate 账号（GitHub/Google 登录）：
                <a
                  href="https://replicate.com/signup"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-brand-600 hover:underline"
                >
                  replicate.com/signup <ExternalLink size={12} />
                </a>
              </li>
              <li>新用户送 $0.10 免费额度（约 29 次超分）</li>
              <li>
                访问 API Token 页面：
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-brand-600 hover:underline"
                >
                  account/api-tokens <ExternalLink size={12} />
                </a>
              </li>
              <li>点击「Create token」→ 复制生成的 Token 粘贴到上方</li>
            </ol>
          </div>

          {/* 隐私说明 */}
          <div className="flex items-start gap-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
            <Shield size={14} className="mt-0.5 shrink-0" />
            <p>
              Token 仅保存在你的浏览器本地（localStorage），不会上传到任何服务器。
              图片会发送到 Replicate 进行 AI 推理，请勿上传敏感图片。
            </p>
          </div>

          {/* 费用说明 */}
          <div className="text-xs text-slate-500 dark:text-slate-400">
            单次超分约 <span className="font-medium text-slate-700 dark:text-slate-200">$0.0034</span>，
            新用户免费额度约可放大 29 次。超过后需在 Replicate 充值（最低 $5）。
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!token.trim() || saved}
              className="btn-primary flex-1"
            >
              {saved ? (
                <>
                  <Check size={16} /> 已保存
                </>
              ) : (
                '保存'
              )}
            </button>
            {token && (
              <button type="button" onClick={handleClear} className="btn-secondary">
                清除
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
