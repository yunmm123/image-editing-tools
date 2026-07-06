import { useState, useCallback, useMemo } from 'react';
import { Scissors, RotateCcw, Loader2, ImageIcon, AlertTriangle, Edit3 } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import ImageCompare from '../components/ImageCompare';
import ProgressBar from '../components/ProgressBar';
import DownloadButton from '../components/DownloadButton';
import ColorPicker from '../components/ColorPicker';
import MaskEditor from '../components/MaskEditor';
import { useModelLoader } from '../hooks/useModelLoader';
import { useImageProcessor } from '../hooks/useImageProcessor';
import { removeBackground, composeWithColor, applyAlphaToImageData } from '../services/backgroundRemoval';
import { drawImageToCanvas, createCanvas, canvasToBlob, MIME_BY_FORMAT, isLossyFormat } from '../utils/canvas';
import { formatBytes } from '../utils/format';
import { buildOutputFilename } from '../utils/image';
import type { ImageFormat } from '../types';

interface PageHeaderProps {
  icon: typeof Scissors;
  title: string;
  description: string;
  backend?: string;
}

function PageHeader({ icon: Icon, title, description, backend }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-md">
          <Icon size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {backend && (
          <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            后端：{backend}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * AI 抠图页
 */
export default function RemoveBgPage() {
  const { loadAndPrepare, reset: resetImage, wasScaled } = useImageProcessor();
  const { runInference, progress, error, status, backend, reset: resetModel } = useModelLoader();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [transparentData, setTransparentData] = useState<ImageData | null>(null);
  const [bgColor, setBgColor] = useState<string>('transparent');
  const [composedBlob, setComposedBlob] = useState<Blob | null>(null);
  const [composedUrl, setComposedUrl] = useState<string | null>(null);
  const [transparentBlob, setTransparentBlob] = useState<Blob | null>(null);

  // 蒙版编辑器状态
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [maskEditorSource, setMaskEditorSource] = useState<ImageData | null>(null);
  const [maskEditorInitialAlpha, setMaskEditorInitialAlpha] = useState<Uint8ClampedArray | null>(null);

  const isProcessing = status === 'loading';

  const handleFiles = useCallback(
    async (files: File[]) => {
      const f = files[0];
      if (!f) return;
      // 清理旧结果
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setResultUrl(null);
      setTransparentData(null);
      setComposedBlob(null);
      setComposedUrl(null);
      setTransparentBlob(null);
      resetModel();
      // 预加载图片
      await loadAndPrepare(f);
    },
    [loadAndPrepare, previewUrl, resultUrl, resetModel]
  );

  const handleProcess = useCallback(async () => {
    if (!file) return;
    try {
      const { imageData } = await loadAndPrepare(file);
      const result = await removeBackground({
        imageData,
        runInference,
      });
      setTransparentData(result.transparent);
      setTransparentBlob(result.pngBlob);
      setResultUrl(result.previewUrl);
    } catch (err) {
      console.error(err);
    }
  }, [file, loadAndPrepare, runInference]);

  // 打开蒙版编辑器：纯手动模式（不调用 AI，初始 alpha 全 255）
  const handleOpenMaskEditorManual = useCallback(async () => {
    if (!file) return;
    const { imageData } = await loadAndPrepare(file);
    const alpha = new Uint8ClampedArray(imageData.width * imageData.height).fill(255);
    setMaskEditorSource(imageData);
    setMaskEditorInitialAlpha(alpha);
    setMaskEditorOpen(true);
  }, [file, loadAndPrepare]);

  // 打开蒙版编辑器：修正模式（基于当前 transparentData 的 alpha）
  const handleOpenMaskEditorCorrection = useCallback(async () => {
    if (!file || !transparentData) return;
    const { imageData } = await loadAndPrepare(file);
    const alpha = new Uint8ClampedArray(imageData.width * imageData.height);
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = transparentData.data[4 * i + 3];
    }
    setMaskEditorSource(imageData);
    setMaskEditorInitialAlpha(alpha);
    setMaskEditorOpen(true);
  }, [file, transparentData, loadAndPrepare]);

  // 应用蒙版编辑器结果：将新 alpha 合成到原图 RGB，更新所有相关状态
  const handleApplyMask = useCallback(
    async (alpha: Uint8ClampedArray) => {
      if (!maskEditorSource) return;
      setMaskEditorOpen(false);
      const newTransparent = applyAlphaToImageData(maskEditorSource, alpha);

      // 生成 PNG Blob + 预览 URL
      const { canvas, ctx } = createCanvas(newTransparent.width, newTransparent.height);
      ctx.putImageData(newTransparent, 0, 0);
      const pngBlob = await canvasToBlob(canvas, 'image/png');
      const newUrl = URL.createObjectURL(pngBlob);

      // 清理旧 URL
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (composedUrl && composedUrl !== resultUrl) URL.revokeObjectURL(composedUrl);

      setTransparentData(newTransparent);
      setTransparentBlob(pngBlob);
      setResultUrl(newUrl);
      setBgColor('transparent');
      setComposedBlob(pngBlob);
      setComposedUrl(newUrl);
    },
    [maskEditorSource, resultUrl, composedUrl]
  );

  // 背景色变更时重新合成
  const handleColorChange = useCallback(
    async (color: string) => {
      setBgColor(color);
      if (!transparentData) return;
      if (color === 'transparent') {
        setComposedBlob(transparentBlob);
        setComposedUrl(resultUrl);
        return;
      }
      const { blob, url } = await composeWithColor(transparentData, color);
      setComposedBlob(blob);
      if (composedUrl && composedUrl !== resultUrl) URL.revokeObjectURL(composedUrl);
      setComposedUrl(url);
    },
    [transparentData, transparentBlob, composedUrl, resultUrl]
  );

  // 把当前合成结果重新编码为指定格式
  const handleReencode = useCallback(
    async (format: ImageFormat): Promise<Blob> => {
      if (!transparentData) throw new Error('无图像数据');
      const { width, height } = transparentData;
      const canvas = drawImageToCanvas(
        (() => {
          const c = document.createElement('canvas');
          c.width = width;
          c.height = height;
          const ctx = c.getContext('2d')!;
          if (bgColor !== 'transparent') {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, width, height);
          }
          const tmp = document.createElement('canvas');
          tmp.width = width;
          tmp.height = height;
          tmp.getContext('2d')!.putImageData(transparentData, 0, 0);
          ctx.drawImage(tmp, 0, 0);
          return c;
        })(),
        width,
        height
      );
      // jpeg/bmp 需要白底
      if (format === 'jpeg' || format === 'bmp') {
        const ctx = canvas.getContext('2d')!;
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
      }
      return canvasToBlob(canvas, MIME_BY_FORMAT[format], isLossyFormat(format) ? 0.92 : undefined);
    },
    [transparentData, bgColor]
  );

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    if (composedUrl && composedUrl !== resultUrl) URL.revokeObjectURL(composedUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setTransparentData(null);
    setTransparentBlob(null);
    setComposedBlob(null);
    setComposedUrl(null);
    setBgColor('transparent');
    resetImage();
    resetModel();
  };

  const downloadBlob = composedBlob ?? transparentBlob;
  const downloadUrl = composedUrl ?? resultUrl;
  const fileName = useMemo(
    () => (file ? buildOutputFilename(file.name, 'nobg', 'png') : 'result_nobg.png'),
    [file]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <PageHeader
        icon={Scissors}
        title="AI 智能抠图"
        description="基于 MODNet 模型，自动识别主体并移除背景"
        backend={backend.toUpperCase()}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传区 */}
        <div className="card p-5">
          {!file ? (
            <ImageUploader onFiles={handleFiles} hint="建议上传清晰的主体图片，单张处理" />
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={previewUrl ?? ''} alt="原图" className="mx-auto max-h-80 object-contain" />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span className="truncate">{file.name}</span>
                <span>{formatBytes(file.size)}</span>
              </div>
              {wasScaled && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  图片过大已自动缩放至 2048px 处理，以保证性能
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="btn-primary flex-1"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
                  {isProcessing ? '处理中...' : '开始抠图'}
                </button>
                <button type="button" onClick={handleReset} className="btn-secondary">
                  <RotateCcw size={16} />
                  重新上传
                </button>
              </div>

              {/* 纯手动选主体入口（仅在未出结果前显示） */}
              {!resultUrl && (
                <button
                  type="button"
                  onClick={handleOpenMaskEditorManual}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-brand-500 dark:hover:text-brand-400"
                >
                  <Edit3 size={12} />
                  或纯手动选择主体（适合复杂图片）
                </button>
              )}
            </div>
          )}

          {/* 进度 / 错误 */}
          {(isProcessing || error) && (
            <div className="mt-4">
              {isProcessing && <ProgressBar progress={progress ?? undefined} label={progress?.stage} />}
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>模型加载失败，请刷新重试。原因：{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右：结果展示 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <ImageIcon size={48} className="mb-3" />
              <p className="text-sm">上传图片并点击「开始抠图」后，结果会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ImageCompare
                beforeSrc={previewUrl ?? ''}
                afterSrc={downloadUrl ?? ''}
                beforeLabel="原图"
                afterLabel={bgColor === 'transparent' ? '透明背景' : '换底'}
              />

              {/* 修正主体范围入口 */}
              <button
                type="button"
                onClick={handleOpenMaskEditorCorrection}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-xs font-medium text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-500 dark:hover:bg-brand-900/30 dark:hover:text-brand-300"
              >
                <Edit3 size={13} />
                修正主体范围（涂抹保留/删除）
              </button>

              {/* 背景色选择 */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">背景颜色</p>
                <ColorPicker value={bgColor} onChange={handleColorChange} />
              </div>

              {/* 下载 */}
              <div className="flex items-center gap-3 pt-2">
                {downloadBlob && (
                  <DownloadButton
                    blob={downloadBlob}
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

      {/* 蒙版编辑器（手动修正主体范围） */}
      {maskEditorOpen && maskEditorSource && maskEditorInitialAlpha && (
        <MaskEditor
          open={maskEditorOpen}
          sourceImageData={maskEditorSource}
          initialAlpha={maskEditorInitialAlpha}
          onApply={handleApplyMask}
          onClose={() => setMaskEditorOpen(false)}
        />
      )}
    </div>
  );
}
