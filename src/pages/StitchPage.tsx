import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Layers, ArrowUp, ArrowDown, X, Loader2 } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import DownloadButton from '../components/DownloadButton';
import {
  createCanvas,
  canvasToBlob,
  MIME_BY_FORMAT,
  isLossyFormat,
} from '../utils/canvas';
import { loadImageFromFile, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { ImageFormat } from '../types';

/** 拼接方向 */
type Direction = 'vertical' | 'horizontal';
/** 对齐方式：start/center/end，按方向映射到交叉轴位置 */
type Align = 'start' | 'center' | 'end';

/** 画布单边最大尺寸（超过则中止，避免触发浏览器画布上限） */
const MAX_DIMENSION = 16384;

/** 不同方向下的对齐标签 */
const ALIGN_LABELS: Record<Direction, Record<Align, string>> = {
  vertical: { start: '顶部', center: '居中', end: '底部' },
  horizontal: { start: '左', center: '居中', end: '右' },
};

/**
 * 图片拼接页：多张图片竖向/横向拼接成长图
 * 纯 Canvas 实现，所有处理在浏览器本地完成
 */
export default function StitchPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [direction, setDirection] = useState<Direction>('vertical');
  const [gap, setGap] = useState(0);
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [align, setAlign] = useState<Align>('center');

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 缩略图 URL 缓存：按 File 引用复用，重排序时不重建
  const thumbUrlsRef = useRef<Map<File, string>>(new Map());

  const getThumb = useCallback((file: File): string => {
    let url = thumbUrlsRef.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      thumbUrlsRef.current.set(file, url);
    }
    return url;
  }, []);

  // 卸载时清理所有缩略图 URL
  useEffect(() => {
    return () => {
      thumbUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbUrlsRef.current.clear();
    };
  }, []);

  /** 清除结果（并释放预览 URL） */
  const clearResult = useCallback(() => {
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setResultBlob(null);
  }, []);

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      setFiles((prev) => [...prev, ...newFiles]);
      clearResult();
      setError(null);
    },
    [clearResult]
  );

  const handleMove = (idx: number, delta: number) => {
    setFiles((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleRemove = (idx: number) => {
    const removed = files[idx];
    if (removed) {
      const url = thumbUrlsRef.current.get(removed);
      if (url) {
        URL.revokeObjectURL(url);
        thumbUrlsRef.current.delete(removed);
      }
    }
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    clearResult();
  };

  const handleClear = () => {
    thumbUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    thumbUrlsRef.current.clear();
    setFiles([]);
    clearResult();
    setError(null);
  };

  const handleStitch = useCallback(async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setError(null);

    const images: HTMLImageElement[] = [];
    try {
      // 依次加载图片并记录原始尺寸
      for (const f of files) {
        const img = await loadImageFromFile(f);
        images.push(img);
      }
      const dims = images.map((img) => ({
        w: img.naturalWidth,
        h: img.naturalHeight,
      }));
      const n = images.length;
      const gapTotal = gap * (n - 1);

      let outW: number;
      let outH: number;
      if (direction === 'vertical') {
        // 竖向拼接：宽度取最大，高度累加
        outW = Math.max(...dims.map((d) => d.w));
        outH = dims.reduce((s, d) => s + d.h, 0) + gapTotal;
      } else {
        // 横向拼接：高度取最大，宽度累加
        outH = Math.max(...dims.map((d) => d.h));
        outW = dims.reduce((s, d) => s + d.w, 0) + gapTotal;
      }

      // 画布尺寸过大保护
      if (outW > MAX_DIMENSION || outH > MAX_DIMENSION) {
        setError('拼接后图片过大，请减少图片数量或缩小尺寸');
        return;
      }

      const { canvas, ctx } = createCanvas(outW, outH);
      // 先填充背景色（用于间距区域及图片未覆盖处）
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, outW, outH);

      if (direction === 'vertical') {
        // 竖向拼接：纵向堆叠，对齐控制水平（交叉轴）位置
        let y = 0;
        for (let i = 0; i < n; i++) {
          const { w, h } = dims[i];
          let x = 0;
          if (align === 'center') x = (outW - w) / 2;
          else if (align === 'end') x = outW - w;
          ctx.drawImage(images[i], x, y, w, h);
          y += h + gap;
        }
      } else {
        // 横向拼接：横向排列，对齐控制垂直（交叉轴）位置
        let x = 0;
        for (let i = 0; i < n; i++) {
          const { w, h } = dims[i];
          let y = 0;
          if (align === 'center') y = (outH - h) / 2;
          else if (align === 'end') y = outH - h;
          ctx.drawImage(images[i], x, y, w, h);
          x += w + gap;
        }
      }

      const blob = await canvasToBlob(canvas, 'image/png');
      // 释放旧预览并设置新结果
      setResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setResultBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拼接失败');
    } finally {
      // 释放 loadImageFromFile 内部创建的 blob URL（已绘制到画布，可安全回收）
      images.forEach((img) => {
        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      });
      setProcessing(false);
    }
  }, [files, direction, gap, bgColor, align]);

  // 重新编码为其他格式下载
  const handleReencode = useCallback(
    async (format: ImageFormat): Promise<Blob> => {
      if (!resultBlob) throw new Error('无图像数据');
      const img = await loadImageFromFile(
        new File([resultBlob], 'result', { type: resultBlob.type })
      );
      try {
        const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
        // jpeg/bmp 不支持透明，填充白色背景
        if (format === 'jpeg' || format === 'bmp') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
        }
        ctx.drawImage(img, 0, 0);
        return await canvasToBlob(
          canvas,
          MIME_BY_FORMAT[format],
          isLossyFormat(format) ? 0.92 : undefined
        );
      } finally {
        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      }
    },
    [resultBlob]
  );

  const fileName = useMemo(() => {
    const base = files[0]?.name ?? 'image';
    return buildOutputFilename(base, 'stitch', 'png');
  }, [files]);

  const totalSize = useMemo(
    () => files.reduce((s, f) => s + f.size, 0),
    [files]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* 页头 */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-md">
            <Layers size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              图片拼接
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              多张图片竖向/横向拼接成长图
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传 + 文件列表 + 选项 */}
        <div className="space-y-4">
          <div className="card p-5">
            <ImageUploader
              multiple
              onFiles={handleFiles}
              hint="可一次选择多张图片按顺序拼接"
            />

            {files.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    已选 {files.length} 张 · 共 {formatBytes(totalSize)}
                  </span>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    清空
                  </button>
                </div>
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
                    >
                      <img
                        src={getThumb(f)}
                        alt={f.name}
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                          {f.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatBytes(f.size)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMove(i, -1)}
                          disabled={i === 0}
                          className="btn-ghost p-1.5 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="上移"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(i, 1)}
                          disabled={i === files.length - 1}
                          className="btn-ghost p-1.5 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="下移"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(i)}
                          className="btn-ghost p-1.5 text-rose-500 hover:text-rose-600"
                          aria-label="移除"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 拼接选项 */}
          <div className="card p-5">
            {/* 方向 */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                方向
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'vertical', label: '竖向拼接' },
                    { value: 'horizontal', label: '横向拼接' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDirection(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      direction === opt.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 间距 + 背景色 */}
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  间距 ({gap}px)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={gap}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setGap(Math.max(0, Math.min(50, Number.isNaN(v) ? 0 : v)));
                  }}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  背景色
                </label>
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="h-9 w-full rounded border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>

            {/* 对齐方式 */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                对齐方式
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['start', 'center', 'end'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAlign(a)}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      align === a
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {ALIGN_LABELS[direction][a]}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleStitch}
              disabled={files.length === 0 || processing}
              className="btn-primary w-full"
            >
              {processing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Layers size={16} />
              )}
              {processing ? '拼接中...' : '生成拼接图'}
            </button>
          </div>
        </div>

        {/* 右：预览 + 下载 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <Layers size={48} className="mb-3" />
              <p className="text-sm">
                添加图片并点击「生成拼接图」后，预览会显示在这里
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img
                  src={resultUrl}
                  alt="拼接结果"
                  className="mx-auto max-h-[420px] object-contain"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatBytes(resultBlob?.size ?? 0)}
                </span>
                {resultBlob && (
                  <DownloadButton
                    blob={resultBlob}
                    filename={fileName}
                    formats={['png', 'jpeg', 'webp']}
                    onPickFormat={handleReencode}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
