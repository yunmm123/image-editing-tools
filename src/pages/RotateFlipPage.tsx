import { useState, useCallback, useMemo, useRef } from 'react';
import {
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Download,
  Loader2,
  ImageIcon,
  RotateCcw as ResetIcon,
} from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import DownloadButton from '../components/DownloadButton';
import { createCanvas, canvasToBlob, MIME_BY_FORMAT, isLossyFormat } from '../utils/canvas';
import { loadImageFromFile, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { ImageFormat } from '../types';

/** 导出可选格式 */
const EXPORT_FORMATS: ImageFormat[] = ['png', 'jpeg', 'webp'];

/**
 * 旋转翻转页：90° 旋转 + 水平/垂直镜像翻转
 * 纯 Canvas 实现，所有处理在浏览器本地完成
 */
export default function RotateFlipPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 已加载的图片元素与原始尺寸，使用 ref 避免触发额外重渲染
  const imgRef = useRef<HTMLImageElement | null>(null);
  const naturalSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // 处理上传：加载图片并记录原始尺寸
  const handleFiles = useCallback(
    async (files: File[]) => {
      const f = files[0];
      if (!f) return;
      try {
        const img = await loadImageFromFile(f);
        imgRef.current = img;
        naturalSizeRef.current = { width: img.naturalWidth, height: img.naturalHeight };
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
        setResultUrl(null);
        setResultBlob(null);
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [previewUrl, resultUrl]
  );

  // 旋转 / 翻转控制
  const rotateCW = useCallback(() => setRotation((r) => (r + 90) % 360), []);
  const rotateCCW = useCallback(() => setRotation((r) => (r + 270) % 360), []);
  const toggleFlipH = useCallback(() => setFlipH((v) => !v), []);
  const toggleFlipV = useCallback(() => setFlipV((v) => !v), []);
  const resetTransforms = useCallback(() => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  }, []);

  // 按指定格式渲染变换后的画布
  const renderTransformed = useCallback(
    async (format: ImageFormat): Promise<Blob> => {
      const img = imgRef.current;
      const { width: naturalW, height: naturalH } = naturalSizeRef.current;
      if (!img || !naturalW || !naturalH) throw new Error('未加载图片');
      // 90/270 旋转时输出宽高互换
      const is90 = rotation === 90 || rotation === 270;
      const outW = is90 ? naturalH : naturalW;
      const outH = is90 ? naturalW : naturalH;
      const { canvas, ctx } = createCanvas(outW, outH);
      // jpeg 无透明通道，先填充白色背景
      if (format === 'jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, outW, outH);
      }
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -naturalW / 2, -naturalH / 2);
      const quality = isLossyFormat(format) ? 0.92 : undefined;
      return canvasToBlob(canvas, MIME_BY_FORMAT[format], quality);
    },
    [rotation, flipH, flipV]
  );

  // 导出图片（默认 PNG，保留透明度）
  const handleExport = useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const blob = await renderTransformed('png');
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  }, [renderTransformed, resultUrl]);

  // 重新编码为指定格式（jpeg 已在渲染时填白底）
  const handleReencode = useCallback(
    async (format: ImageFormat): Promise<Blob> => renderTransformed(format),
    [renderTransformed]
  );

  // 重新上传：清空全部状态并回收对象 URL
  const handleReset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    imgRef.current = null;
    naturalSizeRef.current = { width: 0, height: 0 };
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setError(null);
  }, [previewUrl, resultUrl]);

  const fileName = useMemo(
    () => (file ? buildOutputFilename(file.name, 'rotated', 'png') : 'result_rotated.png'),
    [file]
  );

  const naturalW = naturalSizeRef.current.width;
  const naturalH = naturalSizeRef.current.height;

  // 实时预览的 CSS 变换
  const previewTransform = `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* 页头 */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md">
            <RotateCw size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">旋转翻转</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              90° 旋转、水平/垂直镜像翻转图片
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          处理失败：{error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传 + 控制 */}
        <div className="card p-5">
          {!file ? (
            <ImageUploader onFiles={handleFiles} hint="上传需要旋转或翻转的图片" />
          ) : (
            <div className="space-y-4">
              {/* 实时预览 */}
              <div className="flex h-80 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
                <img
                  src={previewUrl ?? ''}
                  alt="预览"
                  className="max-h-full max-w-full object-contain transition-transform duration-200"
                  style={{ transform: previewTransform, transformOrigin: 'center' }}
                />
              </div>

              {/* 文件信息 */}
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span className="truncate">{file.name}</span>
                <span className="shrink-0">
                  {formatBytes(file.size)} · {naturalW}×{naturalH}
                </span>
              </div>

              {/* 控制按钮 */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={rotateCCW} className="btn-secondary">
                  <RotateCcw size={16} />
                  逆时针旋转 90°
                </button>
                <button type="button" onClick={rotateCW} className="btn-secondary">
                  <RotateCw size={16} />
                  顺时针旋转 90°
                </button>
                <button
                  type="button"
                  onClick={toggleFlipH}
                  className={`btn-secondary ${flipH ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <FlipHorizontal size={16} />
                  水平翻转
                </button>
                <button
                  type="button"
                  onClick={toggleFlipV}
                  className={`btn-secondary ${flipV ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <FlipVertical size={16} />
                  垂直翻转
                </button>
              </div>

              <button type="button" onClick={resetTransforms} className="btn-ghost w-full">
                <ResetIcon size={16} />
                重置
              </button>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={processing}
                  className="btn-primary flex-1"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {processing ? '导出中...' : '导出图片'}
                </button>
                <button type="button" onClick={handleReset} className="btn-secondary">
                  重新上传
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 右：结果展示 + 下载 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <ImageIcon size={48} className="mb-3" />
              <p className="text-sm">调整旋转与翻转后点击「导出图片」，结果会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={resultUrl} alt="旋转翻转结果" className="mx-auto max-h-80 object-contain" />
              </div>
              {resultBlob && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatBytes(resultBlob.size)}
                  </span>
                  <DownloadButton
                    blob={resultBlob}
                    filename={fileName}
                    formats={EXPORT_FORMATS}
                    onPickFormat={handleReencode}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
