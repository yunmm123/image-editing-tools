import { useState, useCallback, useMemo } from 'react';
import { ZoomIn, RotateCcw, Loader2, ImageIcon, Sparkles, Zap, Cloud, Wand2 } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import ImageCompare from '../components/ImageCompare';
import ProgressBar from '../components/ProgressBar';
import DownloadButton from '../components/DownloadButton';
import { useImageProcessor } from '../hooks/useImageProcessor';
import { superResolve } from '../services/superResolution';
import type { EnhanceLevel } from '../services/superResolution';
import { aiSuperResolve } from '../services/aiSuperResolution';
import { cloudSuperResolve } from '../services/cloudSuperResolution';
import { customUpscale } from '../services/customApi';
import { getCustomApiConfig } from '../services/settings';
import { formatBytes } from '../utils/format';
import { buildOutputFilename } from '../utils/image';

/** 引擎类型 */
type Engine = 'cloud' | 'ai' | 'canvas';

/** 云端模式：放大 or 模糊修复 */
type CloudMode = 'upscale' | 'restore';

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
  { value: 'cloud', icon: Cloud, label: '云端 AI', desc: 'Real-ESRGAN，免费 · 质量最高' },
  { value: 'ai', icon: Sparkles, label: '本地 AI', desc: 'ESRGAN，质量好，需下载模型' },
  { value: 'canvas', icon: Zap, label: 'Canvas 快速', desc: '多轮锐化，秒级' },
];

/**
 * 图片放大页：支持三种引擎
 * - 云端 AI（image-upscaling.net Real-ESRGAN）：完全免费，无需注册/API Key，质量最高
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
  const [cloudMode, setCloudMode] = useState<CloudMode>('upscale');
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
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
      setProgress(null);
      setStage('');
      await loadAndPrepare(f);
    },
    [loadAndPrepare, previewUrl, resultUrl]
  );

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setStage('准备中');
    setProgress(0);
    try {
      const { imageData } = await loadAndPrepare(file);
      const onProgress = (info: { progress: number; stage: string }) => {
        setStage(info.stage);
        setProgress(info.progress);
      };

      // 优先检查自定义 API
      const customConfig = getCustomApiConfig('upscale');
      let result;
      if (customConfig) {
        result = await customUpscale({
          imageData,
          scale,
          mode: cloudMode,
          faceEnhance,
          config: customConfig,
          onProgress,
        });
      } else if (engine === 'cloud') {
        result = await cloudSuperResolve({
          imageData,
          scale,
          faceEnhance: cloudMode === 'upscale' ? faceEnhance : false,
          restore: cloudMode === 'restore',
          onProgress,
        });
      } else if (engine === 'ai') {
        result = await aiSuperResolve({ imageData, scale, onProgress });
      } else {
        result = await superResolve({ imageData, scale, enhance, onProgress });
      }

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
  }, [file, loadAndPrepare, scale, engine, enhance, cloudMode, faceEnhance]);

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
    () => {
      const suffix = engine === 'cloud' && cloudMode === 'restore' ? 'restore' : `upscale-${scale}x`;
      return file ? buildOutputFilename(file.name, suffix, 'png') : 'result.png';
    },
    [file, scale, engine, cloudMode]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-md">
            <ZoomIn size={22} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">图片放大 / 模糊修复</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              云端 AI（Real-ESRGAN，完全免费） · 支持模糊修复与人脸增强
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

              {/* 引擎选择 */}
              <div>
                {getCustomApiConfig('upscale') && (
                  <p className="mb-2 rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
                    🔧 已启用自定义 API（在顶部「设置」中配置），下方引擎选择将被忽略
                  </p>
                )}
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
                    ✅ 完全免费 · 无需注册 · 无需 API Key · 由 image-upscaling.net 提供 Real-ESRGAN 推理
                  </p>
                )}
                {engine === 'ai' && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    首次使用需下载 ~30MB 模型（浏览器缓存后秒开），完全本地
                  </p>
                )}
              </div>

              {/* 云端模式选择：放大 vs 模糊修复 */}
              {engine === 'cloud' && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">处理模式</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCloudMode('upscale')}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-center transition-colors ${
                        cloudMode === 'upscale'
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <ZoomIn size={18} />
                      <div className="text-xs font-medium">放大增强</div>
                      <div className="text-[10px] leading-tight opacity-70">清晰图放大，可选人脸增强</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCloudMode('restore')}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-center transition-colors ${
                        cloudMode === 'restore'
                          ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Wand2 size={18} />
                      <div className="text-xs font-medium">模糊修复</div>
                      <div className="text-[10px] leading-tight opacity-70">AI 重绘细节，修复模糊老照片</div>
                    </button>
                  </div>
                  {cloudMode === 'restore' && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      ⚠️ 使用扩散模型重绘细节（不放大，约 30-90s），会消耗较多免费额度，适合模糊/老照片
                    </p>
                  )}
                </div>
              )}

              {/* 倍率选择：仅放大模式或非云端引擎 */}
              {!(engine === 'cloud' && cloudMode === 'restore') && (
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
              )}

              {/* 人脸增强开关：仅云端放大模式 */}
              {engine === 'cloud' && cloudMode === 'upscale' && (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={faceEnhance}
                    onClick={() => setFaceEnhance((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      faceEnhance ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        faceEnhance ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">人脸增强（GFPGAN）</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      修复模糊人脸，老照片人像建议开启
                    </div>
                  </div>
                </div>
              )}

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
                  {processing ? <Loader2 size={16} className="animate-spin" /> : engine === 'cloud' && cloudMode === 'restore' ? <Wand2 size={16} /> : <ZoomIn size={16} />}
                  {processing ? '处理中...' : engine === 'cloud' && cloudMode === 'restore' ? '开始修复' : '开始放大'}
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
                afterLabel={engine === 'cloud' && cloudMode === 'restore' ? '模糊修复' : `${scale}x 放大`}
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
