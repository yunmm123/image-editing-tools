import { Loader2 } from 'lucide-react';
import { ProgressInfo } from '../types';

interface ProgressBarProps {
  /** 进度信息 */
  progress?: ProgressInfo;
  /** 是否处于处理中状态（无明确进度时使用 indeterminate） */
  indeterminate?: boolean;
  /** 标题 */
  label?: string;
}

/**
 * 模型下载 / 推理进度条
 */
export default function ProgressBar({ progress, indeterminate, label }: ProgressBarProps) {
  const value = progress?.progress ?? 0;
  const showIndeterminate = indeterminate || (value === 0 && !progress);

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        <Loader2 size={14} className="animate-spin text-brand-600" />
        <span>{label ?? progress?.stage ?? '处理中...'}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        {showIndeterminate ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" />
        ) : (
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-accent-500 transition-all duration-200"
            style={{ width: `${Math.min(100, value)}%` }}
          />
        )}
      </div>
      {progress?.file && (
        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{progress.file}</p>
      )}
      {!showIndeterminate && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {Math.round(value)}% {progress?.loaded && progress?.total ? '' : ''}
        </p>
      )}
    </div>
  );
}
