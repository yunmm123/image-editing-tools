import { useState, useCallback, useMemo } from 'react';
import { ZoomIn, RotateCcw, Loader2, ImageIcon } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import ImageCompare from '../components/ImageCompare';
import DownloadButton from '../components/DownloadButton';
import { useImageProcessor } from '../hooks/useImageProcessor';
import { superResolve } from '../services/superResolution';
import { formatBytes } from '../utils/format';
import { buildOutputFilename } from '../utils/image';

/**
 * 图片放大页：基于 Canvas 渐进式放大 + Unsharp Mask 锐化
 */
export default function UpscalePage() {
  const { loadAndPrepare, wasScaled } = useImageProcessor();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultSize, setResultSize] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState<2 | 4>(4);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState<string>('');

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
      setResultSize(null);
      setStage('');
      await loadAndPrepare(f);
    },
    [loadAndPrepare, previewUrl, resultUrl]
  );

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setStage('准备中');
    try {
      const { imageData } = await loadAndPrepare(file);
      const result = await superResolve({
        imageData,
        scale,
        onProgress: (info) => setStage(info.stage),
      });
      setResultUrl(result.url);
      setResultBlob(result.blob);
      setResultSize({ width: result.width, height: result.height });
    } catch (err) {
      console.error(err);
      setStage('处理失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessing(false);
    }
  }, [file, loadAndPrepare, scale]);

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(null);
    setStage('');
  };

  const fileName = useMemo(
    () => (file ? buildOutputFilename(file.name, `upscale-${scale}x`, 'png') : 'result_upscale.png'),
    [file, scale]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-md">
            <ZoomIn size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">图片放大</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              渐进式双三次插值放大 + Unsharp Mask 锐化，2x / 4x 提升清晰度
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传区 */}
        <div className="card p-5">
          {!file ? (
            <ImageUploader onFiles={handleFiles} hint="建议上传较小的图片以获得更明显的放大效果" />
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
                  图片过大已自动缩放，可能影响放大效果
                </p>
              )}

              {/* 倍率选择 */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">放大倍率</p>
                <div className="flex gap-2">
                  {([2, 4] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScale(s)}
                      className={`btn ${
                        scale === s
                          ? 'bg-brand-600 text-white hover:bg-brand-700'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {s}x 放大
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={processing}
                  className="btn-primary flex-1"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <ZoomIn size={16} />}
                  {processing ? '放大中...' : '开始放大'}
                </button>
                <button type="button" onClick={handleReset} className="btn-secondary">
                  <RotateCcw size={16} />
                  重新上传
                </button>
              </div>

              {processing && stage && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{stage}...</p>
              )}
            </div>
          )}
        </div>

        {/* 右：结果展示 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <ImageIcon size={48} className="mb-3" />
              <p className="text-sm">上传图片并点击「开始放大」后，结果会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ImageCompare
                beforeSrc={previewUrl ?? ''}
                afterSrc={resultUrl}
                beforeLabel="原图"
                afterLabel={`${scale}x 放大`}
              />
              {resultSize && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  输出尺寸：{resultSize.width} × {resultSize.height} px ·{' '}
                  {resultBlob ? formatBytes(resultBlob.size) : ''}
                </p>
              )}
              {resultBlob && (
                <DownloadButton blob={resultBlob} filename={fileName} formats={['png', 'webp', 'jpeg']} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
