import { useState, useCallback, useMemo } from 'react';
import { IdCard, RotateCcw, Loader2, ImageIcon, AlertTriangle, Download } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import ProgressBar from '../components/ProgressBar';
import ColorPicker from '../components/ColorPicker';
import { useModelLoader } from '../hooks/useModelLoader';
import { useImageProcessor } from '../hooks/useImageProcessor';
import { removeBackground } from '../services/backgroundRemoval';
import { customRemoveBg } from '../services/customApi';
import { getCustomApiConfig } from '../services/settings';
import { createCanvas, canvasToBlob } from '../utils/canvas';
import { downloadBlob, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { IdPhotoSize, PresetColor } from '../types';

const PHOTO_SIZES: IdPhotoSize[] = [
  { name: '一寸', width: 295, height: 413 },
  { name: '二寸', width: 413, height: 579 },
  { name: '小一寸', width: 260, height: 360 },
  { name: '小二寸', width: 354, height: 472 },
];

const ID_PHOTO_PRESETS: PresetColor[] = [
  { name: '白色', value: '#FFFFFF' },
  { name: '蓝色', value: '#1E64C0' },
  { name: '红色', value: '#D91414' },
  { name: '渐变灰', value: '#7F7F7F' },
];

/**
 * 证件照换底页：复用抠图功能 + 预设规格 + 背景色替换
 */
export default function IdPhotoPage() {
  const { loadAndPrepare, wasScaled } = useImageProcessor();
  const { runInference, progress, error, status, backend, reset: resetModel } = useModelLoader();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transparentData, setTransparentData] = useState<ImageData | null>(null);
  const [size, setSize] = useState<IdPhotoSize>(PHOTO_SIZES[0]);
  const [bgColor, setBgColor] = useState<string>('#1E64C0');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);

  const isInferring = status === 'loading';

  const handleFiles = useCallback(
    async (files: File[]) => {
      const f = files[0];
      if (!f) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setTransparentData(null);
      setResultUrl(null);
      setResultBlob(null);
      resetModel();
      await loadAndPrepare(f);
    },
    [loadAndPrepare, previewUrl, resultUrl, resetModel]
  );

  const handleRemoveBg = useCallback(async () => {
    if (!file) return;
    try {
      const { imageData } = await loadAndPrepare(file);

      // 优先检查自定义 API
      const customConfig = getCustomApiConfig('removeBg');
      let transparent: ImageData;
      if (customConfig) {
        const result = await customRemoveBg({ imageData, config: customConfig });
        // 从返回 blob 提取 ImageData（带透明通道）
        const bitmap = await createImageBitmap(result.blob);
        const { ctx } = createCanvas(bitmap.width, bitmap.height);
        ctx.drawImage(bitmap, 0, 0);
        const w = bitmap.width;
        const h = bitmap.height;
        bitmap.close();
        transparent = ctx.getImageData(0, 0, w, h);
      } else {
        const result = await removeBackground({ imageData, runInference });
        transparent = result.transparent;
      }

      setTransparentData(transparent);
      // 立即合成初始预览
      composeFinal(transparent, size, bgColor);
    } catch (err) {
      console.error(err);
    }
  }, [file, loadAndPrepare, runInference, size, bgColor]);

  /** 把透明图按规格 + 背景色合成为最终证件照 */
  const composeFinal = useCallback(
    async (transparent: ImageData, targetSize: IdPhotoSize, color: string) => {
      if (!transparent) return;
      const { canvas, ctx } = createCanvas(targetSize.width, targetSize.height);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, targetSize.width, targetSize.height);

      // 把透明主体缩放居中绘制到目标尺寸
      // 计算等比缩放，使主体填满高度（人物照片通常按高度对齐）
      const scale = Math.max(
        targetSize.width / transparent.width,
        targetSize.height / transparent.height
      );
      const drawW = transparent.width * scale;
      const drawH = transparent.height * scale;
      const dx = (targetSize.width - drawW) / 2;
      const dy = (targetSize.height - drawH) / 2;

      const tmp = createCanvas(transparent.width, transparent.height);
      tmp.ctx.putImageData(transparent, 0, 0);
      ctx.drawImage(tmp.canvas, dx, dy, drawW, drawH);

      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    },
    [resultUrl]
  );

  // 切换规格或背景色时重新合成
  const handleSizeChange = useCallback(
    async (s: IdPhotoSize) => {
      setSize(s);
      if (transparentData) {
        setProcessing(true);
        try {
          await composeFinal(transparentData, s, bgColor);
        } finally {
          setProcessing(false);
        }
      }
    },
    [transparentData, bgColor, composeFinal]
  );

  const handleColorChange = useCallback(
    async (c: string) => {
      setBgColor(c);
      if (transparentData) {
        setProcessing(true);
        try {
          await composeFinal(transparentData, size, c);
        } finally {
          setProcessing(false);
        }
      }
    },
    [transparentData, size, composeFinal]
  );

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setTransparentData(null);
    setResultUrl(null);
    setResultBlob(null);
    resetModel();
  };

  const fileName = useMemo(
    () => (file ? buildOutputFilename(file.name, `${size.name}照`, 'jpg') : 'idphoto.jpg'),
    [file, size]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-md">
            <IdCard size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">证件照换底</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              AI 抠图 + 一寸/二寸规格 + 白蓝红渐变背景
            </p>
          </div>
          <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            后端：{backend.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传 */}
        <div className="card p-5">
          {!file ? (
            <ImageUploader onFiles={handleFiles} hint="上传含人物的正面照片，效果最佳" />
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={previewUrl ?? ''} alt="原图" className="mx-auto max-h-80 object-contain" />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span className="truncate">{file.name}</span>
                <span>{file ? formatBytes(file.size) : ''}</span>
              </div>
              {wasScaled && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  图片过大已自动缩放至 2048px 处理
                </p>
              )}
              {getCustomApiConfig('removeBg') && (
                <p className="rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
                  🔧 已启用自定义 API（在顶部「设置」中配置），将调用你的 API 而非本地模型
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRemoveBg}
                  disabled={isInferring}
                  className="btn-primary flex-1"
                >
                  {isInferring ? <Loader2 size={16} className="animate-spin" /> : <IdCard size={16} />}
                  {isInferring ? '识别中...' : '识别人物并换底'}
                </button>
                <button type="button" onClick={handleReset} className="btn-secondary">
                  <RotateCcw size={16} />
                  重新上传
                </button>
              </div>
            </div>
          )}

          {(isInferring || error) && (
            <div className="mt-4">
              {isInferring && <ProgressBar progress={progress ?? undefined} label={progress?.stage} />}
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>模型加载失败，请刷新重试。原因：{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右：结果 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <ImageIcon size={48} className="mb-3" />
              <p className="text-sm">上传照片并点击「识别人物并换底」后，结果会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img
                  src={resultUrl}
                  alt="证件照"
                  className="rounded-lg border border-slate-200 shadow-sm dark:border-slate-700"
                  style={{ maxHeight: '320px' }}
                />
              </div>

              {/* 规格选择 */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">证件照规格</p>
                <div className="grid grid-cols-4 gap-2">
                  {PHOTO_SIZES.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => handleSizeChange(s)}
                      className={`rounded-lg border px-2 py-2 text-xs ${
                        size.name === s.name
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                          : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {s.width}×{s.height}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 背景色 */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">背景颜色</p>
                <ColorPicker value={bgColor} onChange={handleColorChange} presets={ID_PHOTO_PRESETS} />
              </div>

              {processing && (
                <p className="text-xs text-slate-500 dark:text-slate-400">重新合成中...</p>
              )}

              {resultBlob && (
                <button
                  type="button"
                  onClick={() => downloadBlob(resultBlob, fileName)}
                  className="btn-primary w-full"
                >
                  <Download size={16} />
                  下载 {size.name}照 ({size.width}×{size.height})
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
