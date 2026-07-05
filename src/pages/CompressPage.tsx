import { useState, useCallback, useMemo } from 'react';
import { Archive, Loader2, Download, Layers } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import { compressImage } from '../services/imageCompression';
import { downloadAsZip } from '../utils/file';
import { downloadBlob, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { ImageFormat } from '../types';

interface CompressedItem {
  originalName: string;
  originalSize: number;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'png', label: 'PNG' },
];

/**
 * 图片压缩页：支持批量压缩 + ZIP 打包下载
 */
export default function CompressPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState(0.8);
  const [format, setFormat] = useState<ImageFormat>('webp');
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<CompressedItem[]>([]);

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

  const handleCompress = useCallback(async () => {
    if (files.length === 0) return;
    setProcessing(true);
    try {
      const items: CompressedItem[] = [];
      for (const file of files) {
        try {
          const r = await compressImage(file, { quality, format });
          items.push({
            originalName: file.name,
            originalSize: file.size,
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
  }, [files, quality, format]);

  const handleDownloadZip = useCallback(async () => {
    if (results.length === 0) return;
    const zipFiles = results.map((r) => ({
      name: buildOutputFilename(r.originalName, 'compressed', format),
      blob: r.blob,
    }));
    await downloadAsZip(zipFiles, `pic-better-compressed-${Date.now()}.zip`);
  }, [results, format]);

  const totalOriginal = useMemo(
    () => files.reduce((s, f) => s + f.size, 0),
    [files]
  );
  const totalCompressed = useMemo(
    () => results.reduce((s, r) => s + r.blob.size, 0),
    [results]
  );
  const savedRatio =
    totalOriginal > 0 && totalCompressed > 0
      ? Math.max(0, (1 - totalCompressed / totalOriginal) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-md">
            <Archive size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">图片压缩</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Canvas 重编码压缩，支持批量处理与 ZIP 打包下载</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左：上传 + 配置 */}
        <div className="space-y-4 lg:col-span-1">
          <div className="card p-5">
            <ImageUploader multiple onFiles={handleFiles} hint="可一次选择多张图片批量压缩" />

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
                输出格式
              </label>
              <div className="grid grid-cols-4 gap-2">
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
                  <span>压缩质量</span>
                  <span className="text-brand-600">{Math.round(quality * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <p className="mt-1 text-xs text-slate-400">数值越低，文件越小，画质越差</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleCompress}
              disabled={files.length === 0 || processing}
              className="btn-primary mt-4 w-full"
            >
              {processing ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
              {processing ? '压缩中...' : `压缩 ${files.length} 张图片`}
            </button>
          </div>
        </div>

        {/* 右：结果列表 */}
        <div className="card p-5 lg:col-span-2">
          {results.length === 0 ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <Layers size={48} className="mb-3" />
              <p className="text-sm">压缩后的图片会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 统计 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800/50">
                  <p className="text-xs text-slate-500 dark:text-slate-400">原始总大小</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {formatBytes(totalOriginal)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800/50">
                  <p className="text-xs text-slate-500 dark:text-slate-400">压缩后大小</p>
                  <p className="text-lg font-semibold text-brand-600">{formatBytes(totalCompressed)}</p>
                </div>
                <div className="rounded-lg bg-accent-50 p-3 text-center dark:bg-accent-900/30">
                  <p className="text-xs text-slate-500 dark:text-slate-400">节省</p>
                  <p className="text-lg font-semibold text-accent-600">{savedRatio.toFixed(1)}%</p>
                </div>
              </div>

              <button type="button" onClick={handleDownloadZip} className="btn-primary w-full">
                <Download size={16} />
                打包下载全部（ZIP）
              </button>

              {/* 结果列表 */}
              <ul className="space-y-2">
                {results.map((r, i) => {
                  const ratio = r.originalSize > 0 ? (1 - r.blob.size / r.originalSize) * 100 : 0;
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                    >
                      <img
                        src={r.url}
                        alt={r.originalName}
                        className="h-12 w-12 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {r.originalName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatBytes(r.originalSize)} → {formatBytes(r.blob.size)} · {r.width}×{r.height}
                        </p>
                      </div>
                      <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
                        -{ratio.toFixed(1)}%
                      </span>
                      <button
                        onClick={() =>
                          downloadBlob(
                            r.blob,
                            buildOutputFilename(r.originalName, 'compressed', format)
                          )
                        }
                        className="btn-ghost p-2"
                        aria-label="下载"
                      >
                        <Download size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
