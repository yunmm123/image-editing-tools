import { useState, useCallback, useMemo } from 'react';
import { Wand2, RotateCcw, Loader2, ImageIcon } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import ImageCompare from '../components/ImageCompare';
import DownloadButton from '../components/DownloadButton';
import { useImageProcessor } from '../hooks/useImageProcessor';
import { restorePhoto, imageDataToPng } from '../services/photoRestoration';
import { drawImageToCanvas, getImageData, createCanvas, canvasToBlob, MIME_BY_FORMAT, isLossyFormat } from '../utils/canvas';
import { loadImageFromFile, computeScaledSize, MAX_IMAGE_DIMENSION, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { ImageFormat } from '../types';

/**
 * 老照片修复页（纯 JS 算法，无 AI 模型）
 */
export default function RestorePage() {
  const { loadAndPrepare, reset: resetImage } = useImageProcessor();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultData, setResultData] = useState<ImageData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [options, setOptions] = useState({
    whiteBalance: true,
    clahe: true,
    denoise: true,
    sharpen: true,
  });

  const handleFiles = useCallback(
    async (files: File[]) => {
      const f = files[0];
      if (!f) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setResultUrl(null);
      setResultBlob(null);
      setResultData(null);
      await loadAndPrepare(f);
    },
    [loadAndPrepare, previewUrl, resultUrl]
  );

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    try {
      // 老照片修复算法对大图较慢，限制最大边 1024px
      const img = await loadImageFromFile(file);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_IMAGE_DIMENSION / 2 || h > MAX_IMAGE_DIMENSION / 2) {
        const scaled = computeScaledSize(w, h, 1024);
        w = scaled.width;
        h = scaled.height;
      }
      const canvas = drawImageToCanvas(img, w, h);
      const imageData = getImageData(canvas);

      // 让 UI 有机会渲染 loading
      await new Promise((r) => setTimeout(r, 50));

      const restored = await restorePhoto({ imageData, ...options });
      setResultData(restored);
      const { blob, url } = await imageDataToPng(restored);
      setResultBlob(blob);
      setResultUrl(url);
    } finally {
      setProcessing(false);
    }
  }, [file, options]);

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setResultData(null);
    resetImage();
  };

  const handleReencode = useCallback(
    async (format: ImageFormat): Promise<Blob> => {
      if (!resultData) throw new Error('无图像数据');
      const { width, height } = resultData;
      // jpeg/bmp 不支持透明：先铺白底再绘制
      const target = createCanvas(width, height);
      if (format === 'jpeg' || format === 'bmp') {
        target.ctx.fillStyle = '#FFFFFF';
        target.ctx.fillRect(0, 0, width, height);
      }
      const src = createCanvas(width, height);
      src.ctx.putImageData(resultData, 0, 0);
      target.ctx.drawImage(src.canvas, 0, 0);
      const mime = MIME_BY_FORMAT[format];
      const quality = isLossyFormat(format) ? 0.92 : undefined;
      return canvasToBlob(target.canvas, mime, quality);
    },
    [resultData]
  );

  const fileName = useMemo(
    () => (file ? buildOutputFilename(file.name, 'restored', 'png') : 'result_restored.png'),
    [file]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-md">
            <Wand2 size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">老照片修复</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              白平衡 + CLAHE 对比度增强 + 双边滤波去噪 + 锐化，纯 JS 算法
            </p>
          </div>
          <span className="ml-auto rounded-full bg-accent-100 px-3 py-1 text-xs font-medium text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
            无需 AI 模型
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传区 */}
        <div className="card p-5">
          {!file ? (
            <ImageUploader onFiles={handleFiles} hint="上传发黄、模糊的老照片，一键修复" />
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={previewUrl ?? ''} alt="原图" className="mx-auto max-h-80 object-contain" />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span className="truncate">{file.name}</span>
                <span>{formatBytes(file.size)}</span>
              </div>

              {/* 算法选项 */}
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['whiteBalance', '自动白平衡'],
                    ['clahe', 'CLAHE 对比度'],
                    ['denoise', '双边滤波去噪'],
                    ['sharpen', '锐化'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={options[key]}
                      onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={processing}
                  className="btn-primary flex-1"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {processing ? '修复中...' : '一键修复'}
                </button>
                <button type="button" onClick={handleReset} className="btn-secondary">
                  <RotateCcw size={16} />
                  重新上传
                </button>
              </div>
              {processing && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  纯 JS 算法处理中，图片越大耗时越长，请稍候...
                </p>
              )}
            </div>
          )}
        </div>

        {/* 右：结果展示 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <ImageIcon size={48} className="mb-3" />
              <p className="text-sm">上传图片并点击「一键修复」后，结果会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ImageCompare
                beforeSrc={previewUrl ?? ''}
                afterSrc={resultUrl}
                beforeLabel="原图"
                afterLabel="修复后"
              />
              {resultBlob && (
                <DownloadButton
                  blob={resultBlob}
                  filename={fileName}
                  formats={['png', 'jpeg', 'webp']}
                  onPickFormat={handleReencode}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
