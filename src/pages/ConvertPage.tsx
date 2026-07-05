import { useState, useCallback, useMemo } from 'react';
import { Repeat, Loader2, Download, Layers } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import { convertImage } from '../services/formatConversion';
import { downloadAsZip } from '../utils/file';
import { downloadBlob, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { ImageFormat } from '../types';

interface ConvertedItem {
  originalName: string;
  originalType: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'bmp', label: 'BMP' },
];

/**
 * 格式转换页：批量转换 + 打包下载
 */
export default function ConvertPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<ImageFormat>('webp');
  const [quality, setQuality] = useState(0.92);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ConvertedItem[]>([]);

  const handleFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setResults([]);
  }, []);

  const handleRemove = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setResults([]);
  };

  const handleClear = () => {
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setFiles([]);
    setResults([]);
  };

  const handleConvert = useCallback(async () => {
    if (files.length === 0) return;
    setProcessing(true);
    try {
      const items: ConvertedItem[] = [];
      for (const file of files) {
        try {
          const r = await convertImage(file, { format, quality });
          items.push({
            originalName: file.name,
            originalType: file.type || 'unknown',
            blob: r.blob,
            url: r.url,
            width: r.width,
            height: r.height,
          });
        } catch (err) {
          console.error(err);
        }
      }
      setResults(items);
    } finally {
      setProcessing(false);
    }
  }, [files, format, quality]);

  const handleDownloadZip = useCallback(async () => {
    if (results.length === 0) return;
    const zipFiles = results.map((r) => ({
      name: buildOutputFilename(r.originalName, 'converted', format),
      blob: r.blob,
    }));
    await downloadAsZip(zipFiles, `pic-better-converted-${Date.now()}.zip`);
  }, [results, format]);

  const totalOriginal = useMemo(
    () => files.reduce((s, f) => s + f.size, 0),
    [files]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-md">
            <Repeat size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">格式转换</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              PNG / JPEG / WebP / AVIF / BMP 互转，批量处理
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左：上传 + 配置 */}
        <div className="space-y-4 lg:col-span-1">
          <div className="card p-5">
            <ImageUploader multiple onFiles={handleFiles} hint="可一次选择多张图片批量转换" />

            {files.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    已选 {files.length} 张
                  </span>
                  <button onClick={handleClear} className="text-xs text-rose-600 hover:underline">
                    清空
                  </button>
                </div>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-500 dark:text-slate-400">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0">{formatBytes(f.size)}</span>
                      <button
                        onClick={() => handleRemove(i)}
                        className="shrink-0 text-slate-400 hover:text-rose-600"
                        aria-label="移除"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="card p-5">
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                目标格式
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormat(opt.value)}
                    className={`rounded-lg border px-2 py-1.5 text-xs ${
                      format === opt.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {format !== 'png' && format !== 'bmp' && (
              <div>
                <label className="mb-2 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200">
                  <span>质量</span>
                  <span className="text-brand-600">{Math.round(quality * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.02}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleConvert}
              disabled={files.length === 0 || processing}
              className="btn-primary mt-4 w-full"
            >
              {processing ? <Loader2 size={16} className="animate-spin" /> : <Repeat size={16} />}
              {processing ? '转换中...' : `转换为 ${format.toUpperCase()}`}
            </button>
          </div>
        </div>

        {/* 右：结果列表 */}
        <div className="card p-5 lg:col-span-2">
          {results.length === 0 ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <Layers size={48} className="mb-3" />
              <p className="text-sm">转换后的图片会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  共 {results.length} 张 · 原始总大小 {formatBytes(totalOriginal)}
                </p>
                <button type="button" onClick={handleDownloadZip} className="btn-primary">
                  <Download size={16} />
                  打包下载（ZIP）
                </button>
              </div>

              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {results.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <img
                      src={r.url}
                      alt={r.originalName}
                      className="h-14 w-14 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {buildOutputFilename(r.originalName, 'converted', format)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {r.width}×{r.height} · {formatBytes(r.blob.size)}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        downloadBlob(
                          r.blob,
                          buildOutputFilename(r.originalName, 'converted', format)
                        )
                      }
                      className="btn-ghost p-2"
                      aria-label="下载"
                    >
                      <Download size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
