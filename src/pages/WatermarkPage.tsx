import { useState, useCallback, useMemo } from 'react';
import { Stamp, RotateCcw, Loader2, ImageIcon, Type, Image as ImageIcon2 } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import DownloadButton from '../components/DownloadButton';
import { useImageProcessor } from '../hooks/useImageProcessor';
import {
  addTextWatermark,
  addImageWatermark,
  DEFAULT_TEXT_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
  type TextWatermarkOptions,
  type ImageWatermarkOptions,
  type WatermarkPosition,
} from '../services/watermark';
import { loadImageFromFile, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { ImageFormat } from '../types';
import {
  createCanvas,
  canvasToBlob,
  MIME_BY_FORMAT,
  isLossyFormat,
  drawImageToCanvas,
} from '../utils/canvas';

const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: 'top-left', label: '左上' },
  { value: 'top-center', label: '上中' },
  { value: 'top-right', label: '右上' },
  { value: 'center', label: '居中' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-center', label: '下中' },
  { value: 'bottom-right', label: '右下' },
  { value: 'tile', label: '平铺' },
];

/**
 * 图片水印页：支持文字水印和图片水印
 * 纯 Canvas 实现，所有处理在浏览器本地
 */
export default function WatermarkPage() {
  const { loadAndPrepare, reset: resetImage } = useImageProcessor();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watermarkType, setWatermarkType] = useState<'text' | 'image'>('text');

  const [textOptions, setTextOptions] = useState<TextWatermarkOptions>(DEFAULT_TEXT_OPTIONS);
  const [imageOptions, setImageOptions] = useState<ImageWatermarkOptions>(DEFAULT_IMAGE_OPTIONS);

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
      setError(null);
      await loadAndPrepare(f);
    },
    [loadAndPrepare, previewUrl, resultUrl]
  );

  // 水印图片上传
  const handleWatermarkImage = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageOptions((prev) => ({ ...prev, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(f);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const blob =
        watermarkType === 'text'
          ? await addTextWatermark(file, textOptions)
          : await addImageWatermark(file, imageOptions);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  }, [file, watermarkType, textOptions, imageOptions]);

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setError(null);
    resetImage();
  };

  // 重新编码下载
  const handleReencode = useCallback(
    async (format: ImageFormat): Promise<Blob> => {
      if (!resultBlob) throw new Error('无图像数据');
      const img = await loadImageFromFile(new File([resultBlob], 'result', { type: resultBlob.type }));
      const canvas = drawImageToCanvas(img, img.naturalWidth, img.naturalHeight);
      if (format === 'jpeg' || format === 'bmp') {
        const target = createCanvas(img.naturalWidth, img.naturalHeight);
        target.ctx.fillStyle = '#FFFFFF';
        target.ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
        target.ctx.drawImage(canvas, 0, 0);
        return canvasToBlob(target.canvas, MIME_BY_FORMAT[format], isLossyFormat(format) ? 0.92 : undefined);
      }
      return canvasToBlob(canvas, MIME_BY_FORMAT[format], isLossyFormat(format) ? 0.92 : undefined);
    },
    [resultBlob]
  );

  const fileName = useMemo(
    () => (file ? buildOutputFilename(file.name, 'watermarked', 'png') : 'result_watermarked.png'),
    [file]
  );

  // 当前生效的配置（用于显示位置选择器）
  const currentPosition = watermarkType === 'text' ? textOptions.position : imageOptions.position;

  const updatePosition = (pos: WatermarkPosition) => {
    if (watermarkType === 'text') {
      setTextOptions((p) => ({ ...p, position: pos }));
    } else {
      setImageOptions((p) => ({ ...p, position: pos }));
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md">
            <Stamp size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">图片水印</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              添加文字或图片水印，保护你的图片版权，支持平铺铺满整张图
            </p>
          </div>
          <span className="ml-auto rounded-full bg-accent-100 px-3 py-1 text-xs font-medium text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
            本地处理
          </span>
        </div>
      </div>

      {/* 水印类型切换 */}
      <div className="mb-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setWatermarkType('text')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            watermarkType === 'text'
              ? 'bg-brand-600 text-white shadow-md'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <Type size={16} />
          文字水印
        </button>
        <button
          type="button"
          onClick={() => setWatermarkType('image')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            watermarkType === 'image'
              ? 'bg-brand-600 text-white shadow-md'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <ImageIcon2 size={16} />
          图片水印
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          处理失败：{error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传区 + 配置 */}
        <div className="card p-5">
          {!file ? (
            <ImageUploader onFiles={handleFiles} hint="上传需要添加水印的图片" />
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={previewUrl ?? ''} alt="原图" className="mx-auto max-h-60 object-contain" />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span className="truncate">{file.name}</span>
                <span>{formatBytes(file.size)}</span>
              </div>

              {/* 文字水印配置 */}
              {watermarkType === 'text' && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      水印文字
                    </label>
                    <input
                      type="text"
                      value={textOptions.text}
                      onChange={(e) => setTextOptions((p) => ({ ...p, text: e.target.value }))}
                      className="input"
                      placeholder="输入水印文字"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        字号 ({textOptions.fontSize}px)
                      </label>
                      <input
                        type="range"
                        min="12"
                        max="120"
                        value={textOptions.fontSize}
                        onChange={(e) => setTextOptions((p) => ({ ...p, fontSize: +e.target.value }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        旋转 ({textOptions.rotation}°)
                      </label>
                      <input
                        type="range"
                        min="-90"
                        max="90"
                        value={textOptions.rotation}
                        onChange={(e) => setTextOptions((p) => ({ ...p, rotation: +e.target.value }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        文字颜色
                      </label>
                      <input
                        type="color"
                        value={textOptions.color}
                        onChange={(e) => setTextOptions((p) => ({ ...p, color: e.target.value }))}
                        className="h-9 w-full rounded border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        描边颜色
                      </label>
                      <input
                        type="color"
                        value={textOptions.strokeColor}
                        onChange={(e) => setTextOptions((p) => ({ ...p, strokeColor: e.target.value }))}
                        className="h-9 w-full rounded border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        透明度 ({Math.round(textOptions.opacity * 100)}%)
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={textOptions.opacity}
                        onChange={(e) => setTextOptions((p) => ({ ...p, opacity: +e.target.value }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        字体
                      </label>
                      <select
                        value={textOptions.fontFamily}
                        onChange={(e) => setTextOptions((p) => ({ ...p, fontFamily: e.target.value }))}
                        className="input"
                      >
                        <option value="sans-serif">无衬线</option>
                        <option value="serif">衬线</option>
                        <option value="monospace">等宽</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={textOptions.stroke}
                      onChange={(e) => setTextOptions((p) => ({ ...p, stroke: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    启用描边（增强对比度）
                  </label>
                  {textOptions.position === 'tile' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                          水平间距 ({textOptions.tileGapX}px)
                        </label>
                        <input
                          type="range"
                          min="50"
                          max="500"
                          value={textOptions.tileGapX}
                          onChange={(e) => setTextOptions((p) => ({ ...p, tileGapX: +e.target.value }))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                          垂直间距 ({textOptions.tileGapY}px)
                        </label>
                        <input
                          type="range"
                          min="50"
                          max="500"
                          value={textOptions.tileGapY}
                          onChange={(e) => setTextOptions((p) => ({ ...p, tileGapY: +e.target.value }))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 图片水印配置 */}
              {watermarkType === 'image' && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      水印图片
                    </label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => e.target.files && handleWatermarkImage(Array.from(e.target.files))}
                      className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-300"
                    />
                    {imageOptions.imageUrl && (
                      <div className="mt-2 flex items-center gap-2 rounded-md bg-slate-50 p-2 dark:bg-slate-800/50">
                        <img src={imageOptions.imageUrl} alt="水印" className="h-10 w-10 object-contain" />
                        <span className="text-xs text-slate-500">已上传水印图片</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        大小占比 ({Math.round(imageOptions.scaleRatio * 100)}%)
                      </label>
                      <input
                        type="range"
                        min="0.05"
                        max="0.5"
                        step="0.05"
                        value={imageOptions.scaleRatio}
                        onChange={(e) => setImageOptions((p) => ({ ...p, scaleRatio: +e.target.value }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        旋转 ({imageOptions.rotation}°)
                      </label>
                      <input
                        type="range"
                        min="-90"
                        max="90"
                        value={imageOptions.rotation}
                        onChange={(e) => setImageOptions((p) => ({ ...p, rotation: +e.target.value }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      透明度 ({Math.round(imageOptions.opacity * 100)}%)
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={imageOptions.opacity}
                      onChange={(e) => setImageOptions((p) => ({ ...p, opacity: +e.target.value }))}
                      className="w-full"
                    />
                  </div>
                  {imageOptions.position === 'tile' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                          水平间距 ({imageOptions.tileGapX}px)
                        </label>
                        <input
                          type="range"
                          min="50"
                          max="500"
                          value={imageOptions.tileGapX}
                          onChange={(e) => setImageOptions((p) => ({ ...p, tileGapX: +e.target.value }))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                          垂直间距 ({imageOptions.tileGapY}px)
                        </label>
                        <input
                          type="range"
                          min="50"
                          max="500"
                          value={imageOptions.tileGapY}
                          onChange={(e) => setImageOptions((p) => ({ ...p, tileGapY: +e.target.value }))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 位置选择器（共用） */}
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  水印位置
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {POSITIONS.map((pos) => (
                    <button
                      key={pos.value}
                      type="button"
                      onClick={() => updatePosition(pos.value)}
                      className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
                        currentPosition === pos.value
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                          : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={processing || (watermarkType === 'image' && !imageOptions.imageUrl)}
                  className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <Stamp size={16} />}
                  {processing ? '处理中...' : '添加水印'}
                </button>
                <button type="button" onClick={handleReset} className="btn-secondary">
                  <RotateCcw size={16} />
                  重新上传
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 右：结果展示 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <ImageIcon size={48} className="mb-3" />
              <p className="text-sm">配置水印参数并点击「添加水印」后，结果会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={resultUrl} alt="水印效果" className="mx-auto max-h-80 object-contain" />
              </div>
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
