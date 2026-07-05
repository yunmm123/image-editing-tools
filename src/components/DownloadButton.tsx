import { useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { downloadBlob } from '../utils/image';
import { ImageFormat } from '../types';

interface DownloadButtonProps {
  /** 下载内容（Blob 或返回 Blob 的函数） */
  blob: Blob;
  /** 文件名 */
  filename: string;
  /** 可选的格式转换菜单（用于将结果重新编码为不同格式） */
  formats?: ImageFormat[];
  /** 按钮变体 */
  variant?: 'primary' | 'secondary';
  /** 自定义回调，用于格式转换场景下重新生成 Blob */
  onPickFormat?: (format: ImageFormat) => Promise<Blob> | Blob;
}

const FORMAT_LABELS: Record<ImageFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  avif: 'AVIF',
  bmp: 'BMP',
};

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/**
 * 下载按钮，支持可选的格式选择下拉
 */
export default function DownloadButton({
  blob,
  filename,
  formats,
  variant = 'primary',
  onPickFormat,
}: DownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDownload = (targetBlob: Blob, name: string) => {
    downloadBlob(targetBlob, name);
    setOpen(false);
  };

  const handlePickFormat = async (format: ImageFormat) => {
    if (!onPickFormat) {
      // 直接换扩展名下载
      const newName = filename.replace(/\.[^.]+$/, `.${format}`);
      handleDownload(blob, newName);
      return;
    }
    try {
      setBusy(true);
      const result = await onPickFormat(format);
      const newName = filename.replace(/\.[^.]+$/, `.${format}`);
      handleDownload(result, newName);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-block">
      <div className="flex">
        <button
          type="button"
          disabled={busy}
          onClick={() => handleDownload(blob, filename)}
          className={variant === 'primary' ? 'btn-primary rounded-r-none' : 'btn-secondary rounded-r-none'}
        >
          <Download size={16} />
          {busy ? '导出中...' : '下载'}
        </button>
        {formats && formats.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
            className={
              variant === 'primary'
                ? 'btn-primary rounded-l-none border-l border-brand-700/40 px-2'
                : 'btn-secondary rounded-l-none border-l border-slate-400/40 px-2'
            }
            aria-label="选择格式"
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {open && formats && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {formats.map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => handlePickFormat(fmt)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {FORMAT_LABELS[fmt]} (.{fmt})
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export { MIME_BY_FORMAT, FORMAT_LABELS };
