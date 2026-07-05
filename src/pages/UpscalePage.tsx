import { useState, useCallback, useMemo } from 'react';
import { ZoomIn, RotateCcw, Loader2, ImageIcon, Sparkles, Zap, Cloud, Settings } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import ImageCompare from '../components/ImageCompare';
import ProgressBar from '../components/ProgressBar';
import DownloadButton from '../components/DownloadButton';
import SettingsModal from '../components/SettingsModal';
import { useImageProcessor } from '../hooks/useImageProcessor';
import { superResolve } from '../services/superResolution';
import type { EnhanceLevel } from '../services/superResolution';
import { aiSuperResolve } from '../services/aiSuperResolution';
import { cloudSuperResolve, getReplicateToken } from '../services/cloudSuperResolution';
import { formatBytes } from '../utils/format';
import { buildOutputFilename } from '../utils/image';

/** 引擎类型 */
type Engine = 'cloud' | 'ai' | 'canvas';

/** 增强强度选项（Canvas 模式） */
const ENHANCE_OPTIONS: Array<{ value: EnhanceLevel; label: string; desc: string }> = [
  { value: 'light', label: '轻', desc: '清晰图片微调' },
  { value: 'medium', label: '中', desc: '普通图片（默认）' },
  { value: 'strong', label: '强', desc: '模糊照片强力增强' },
];

/** 引擎选项配置 */
const ENGINE_OPTIONS: Array<{
  value: Engine;
  icon: typeof Cloud;
  label: string;
  desc: string;
}> = [
  { value: 'cloud', icon: Cloud, label: '云端 AI', desc: 'Replicate Real-ESRGAN，质量最高' },
  { value: 'ai', icon: Sparkles, label: '本地 AI', desc: 'ESRGAN，质量好，需下载模型' },
  { value: 'canvas', icon: Zap, label: 'Canvas 快速', desc: '多轮锐化，秒级' },
];

/**
 * 图片放大页：支持三种引擎
 * - 云端 AI（Replicate Real-ESRGAN）：质量最高，需 API Token
 * - 本地 AI（UpscalerJS ESRGAN）：质量好，纯本地，需下载模型
 * - Canvas 快速：多轮锐化，秒级，无模型
 */
export default function UpscalePage() {
  const { loadAndPrepare, wasScaled } = useImageProcessor();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultSize, setResultSize] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState<2 | 4>(4);
  const [engine, setEngine] = useState<Engine>('cloud');
  const [enhance, setEnhance] = useState<EnhanceLevel>('medium');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replicateToken, setReplicateToken] = useState<string>(getReplicateToken());

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
      setProgress(null);
      setStage('');
      await loadAndPrepare(f);
    },
    [loadAndPrepare, previewUrl, resultUrl]
  );

  const handleProcess = useCallback(async () => {
    if (!file) return;
    // 云端 AI 模式下检查 Token
    if (engine === 'cloud' && !replicateToken) {
      setSettingsOpen(true);
      return;
    }
    setProcessing(true);
    setStage('准备中');
    setProgress(0);
    try {
      const { imageData } = await loadAndPrepare(file);
      const onProgress = (info: { progress: number; stage: string }) => {
        setStage(info.stage);
        setProgress(info.progress);
      };
      const result = engine === 'cloud'
        ? await cloudSuperResolve({ imageData, scale, apiToken: replicateToken, onProgress })
        : engine === 'ai'
        ? await aiSuperResolve({ imageData, scale, onProgress })
        : await superResolve({ imageData, scale, enhance, onProgress });
      setResultUrl(result.url);
      setResultBlob(result.blob);
      setResultSize({ width: result.width, height: result.height });
    } catch (err) {
      console.error(err);
      setStage('处理失败：' + (err instanceof Error ? err.message : String(err)));
      setProgress(null);
    } finally {
      setProcessing(false);
    }
  }, [file, loadAndPrepare, scale, engine, enhance, replicateToken]);

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setResultSize(null);
    setProgress(null);
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
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">图片放大</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              云端 AI（Real-ESRGAN，质量最高） · 本地 AI · Canvas 快速
            </p>
          </div>
          {/* 设置按钮（云端 AI 需要 Token） */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="btn-secondary"
            title="设置 Replicate API Token"
          >
            <Settings size={16} />
            设置
          </button>
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

              {/* 引擎选择 */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">放大引擎</p>
                <div className="grid grid-cols-3 gap-2">
                  {ENGINE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEngine(opt.value)}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-colors ${
                          engine === opt.value
                            ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        <Icon size={18} className="shrink-0" />
                        <div className="text-xs font-medium">{opt.label}</div>
                        <div className="text-[10px] leading-tight opacity-70">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {engine === 'cloud' && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {replicateToken
                      ? '已配置 Token，单次约 $0.0034，点击右上角「设置」可修改'
                      : '⚠️ 未配置 Token，点击右上角「设置」填入 Replicate Token'}
                  </p>
                )}
                {engine === 'ai' && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    首次使用需下载 ~30MB 模型（浏览器缓存后秒开），完全本地
                  </p>
                )}
              </div>

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

              {/* 增强强度选择（仅 Canvas 模式） */}
              {engine === 'canvas' && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    增强强度
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      模糊照片建议选「强」
                    </span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {ENHANCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEnhance(opt.value)}
                        className={`rounded-lg border px-3 py-2 text-center transition-colors ${
                          enhance === opt.value
                            ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="mt-0.5 text-xs opacity-70">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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

              {processing && (
                <ProgressBar
                  progress={progress !== null ? { progress, stage } : undefined}
                  label={stage}
                />
              )}
              {!processing && stage.startsWith('处理失败') && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {stage}
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

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onTokenChange={setReplicateToken}
      />
    </div>
  );
}
