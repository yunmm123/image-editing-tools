import { useState, useCallback, useMemo, useEffect } from 'react';
import { Wand2, RotateCcw, Loader2, ImageIcon, Settings2, Cloud, Cpu, Save, AlertCircle } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import ImageCompare from '../components/ImageCompare';
import DownloadButton from '../components/DownloadButton';
import { useImageProcessor } from '../hooks/useImageProcessor';
import { restorePhoto, imageDataToPng } from '../services/photoRestoration';
import {
  drawImageToCanvas,
  getImageData,
  createCanvas,
  canvasToBlob,
  MIME_BY_FORMAT,
  isLossyFormat,
} from '../utils/canvas';
import {
  loadImageFromFile,
  computeScaledSize,
  MAX_IMAGE_DIMENSION,
  buildOutputFilename,
} from '../utils/image';
import { formatBytes } from '../utils/format';
import type { ImageFormat, RestoreMode, CustomApiConfig, ApiResponseFormat } from '../types';
import {
  loadApiConfig,
  saveApiConfig,
  callCustomApi,
  validateApiConfig,
  API_PRESETS,
  DEFAULT_API_CONFIG,
} from '../services/customApi';

/**
 * 老照片修复页
 * 支持两种模式：
 * - 本地算法修复（纯 JS，CLAHE + 白平衡 + 去噪 + 锐化 + 饱和度 + Gamma）
 * - AI 修复（通过自定义 API 调用外部 AI 模型，如 GFPGAN / Replicate 等）
 */
export default function RestorePage() {
  const { loadAndPrepare, reset: resetImage } = useImageProcessor();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultData, setResultData] = useState<ImageData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>('local');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiConfig, setApiConfig] = useState<CustomApiConfig>(DEFAULT_API_CONFIG);
  const [apiConfigSaved, setApiConfigSaved] = useState(false);
  const [options, setOptions] = useState({
    whiteBalance: true,
    clahe: true,
    denoise: true,
    sharpen: true,
    saturate: true,
    brightness: true,
  });

  // 加载已保存的 API 配置
  useEffect(() => {
    setApiConfig(loadApiConfig());
  }, []);

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
      setError(null);
      await loadAndPrepare(f);
    },
    [loadAndPrepare, previewUrl, resultUrl]
  );

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      if (mode === 'local') {
        // ===== 本地算法修复 =====
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
      } else {
        // ===== AI 修复（自定义 API） =====
        const validationError = validateApiConfig(apiConfig);
        if (validationError) {
          setError(validationError);
          return;
        }
        const blob = await callCustomApi(file, apiConfig);
        if (!blob.type.startsWith('image/')) {
          throw new Error('API 返回的不是图片数据');
        }
        setResultBlob(blob);
        setResultUrl(URL.createObjectURL(blob));
        setResultData(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setProcessing(false);
    }
  }, [file, mode, options, apiConfig]);

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setResultData(null);
    setError(null);
    resetImage();
  };

  // 保存 API 配置到 localStorage
  const handleSaveApiConfig = () => {
    saveApiConfig(apiConfig);
    setApiConfigSaved(true);
    setTimeout(() => setApiConfigSaved(false), 2000);
  };

  // 应用预设模板
  const handleApplyPreset = (presetName: string) => {
    const preset = API_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    setApiConfig((prev) => ({ ...prev, ...preset.config }));
  };

  // 重新编码下载（仅本地模式有 ImageData，AI 模式直接用 blob）
  const handleReencode = useCallback(
    async (format: ImageFormat): Promise<Blob> => {
      if (resultData) {
        // 本地模式：有 ImageData，重新编码
        const { width, height } = resultData;
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
      }
      if (resultBlob) {
        // AI 模式：只有 Blob，通过 Canvas 转格式
        const img = await loadImageFromFile(new File([resultBlob], 'result', { type: resultBlob.type }));
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const target = createCanvas(w, h);
        if (format === 'jpeg' || format === 'bmp') {
          target.ctx.fillStyle = '#FFFFFF';
          target.ctx.fillRect(0, 0, w, h);
        }
        target.ctx.drawImage(img, 0, 0, w, h);
        const mime = MIME_BY_FORMAT[format];
        const quality = isLossyFormat(format) ? 0.92 : undefined;
        return canvasToBlob(target.canvas, mime, quality);
      }
      throw new Error('无图像数据');
    },
    [resultData, resultBlob]
  );

  const fileName = useMemo(
    () =>
      file
        ? buildOutputFilename(file.name, mode === 'local' ? 'restored' : 'ai-restored', 'png')
        : 'result_restored.png',
    [file, mode]
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
              本地算法修复 或 AI 修复（自定义 API），让褪色发黄的老照片焕然一新
            </p>
          </div>
        </div>
      </div>

      {/* 模式切换 */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('local')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            mode === 'local'
              ? 'bg-brand-600 text-white shadow-md'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <Cpu size={16} />
          本地算法修复
        </button>
        <button
          type="button"
          onClick={() => setMode('ai-api')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            mode === 'ai-api'
              ? 'bg-brand-600 text-white shadow-md'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <Cloud size={16} />
          AI 修复（自定义 API）
        </button>
        {mode === 'ai-api' && (
          <button
            type="button"
            onClick={() => setShowApiConfig((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Settings2 size={16} />
            {showApiConfig ? '收起配置' : '配置 API'}
          </button>
        )}
      </div>

      {/* AI 模式说明 */}
      {mode === 'ai-api' && !showApiConfig && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <p className="mb-1 font-medium">AI 修复模式</p>
          <p>
            通过自定义 API 调用外部 AI 模型（如 GFPGAN、Real-ESRGAN、CodeFormer 等）进行修复。
            点击上方「配置 API」填写你的 API 地址和密钥。图片将上传到你配置的 API 服务器处理。
          </p>
        </div>
      )}

      {/* API 配置面板 */}
      {mode === 'ai-api' && showApiConfig && (
        <div className="mb-6 card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <Settings2 size={18} />
            自定义 API 配置
          </h3>

          {/* 预设模板 */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">快速预设</label>
            <div className="flex flex-wrap gap-2">
              {API_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleApplyPreset(preset.name)}
                  title={preset.description}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-600 dark:hover:bg-brand-900/20"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* API 地址 */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                API 地址 <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={apiConfig.url}
                onChange={(e) => setApiConfig((c) => ({ ...c, url: e.target.value }))}
                placeholder="https://your-api.example.com/restore"
                className="input"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                API Key（可选，作为 Bearer Token 发送）
              </label>
              <input
                type="password"
                value={apiConfig.apiKey}
                onChange={(e) => setApiConfig((c) => ({ ...c, apiKey: e.target.value }))}
                placeholder="sk-xxxxxxxx"
                className="input"
              />
            </div>

            {/* 响应格式 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">响应格式</label>
              <select
                value={apiConfig.responseFormat}
                onChange={(e) =>
                  setApiConfig((c) => ({ ...c, responseFormat: e.target.value as ApiResponseFormat }))
                }
                className="input"
              >
                <option value="binary">binary（响应体直接是图片）</option>
                <option value="base64-json">base64-json（JSON 含 base64 图片）</option>
                <option value="json-url">json-url（JSON 含图片 URL）</option>
              </select>
            </div>

            {/* 图片字段路径 */}
            {apiConfig.responseFormat !== 'binary' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  图片字段路径
                </label>
                <input
                  type="text"
                  value={apiConfig.imagePath}
                  onChange={(e) => setApiConfig((c) => ({ ...c, imagePath: e.target.value }))}
                  placeholder="如 result 或 data.output"
                  className="input"
                />
              </div>
            )}

            {/* Data URI 选项 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                请求图片格式
              </label>
              <select
                value={apiConfig.useDataUri ? 'true' : 'false'}
                onChange={(e) => setApiConfig((c) => ({ ...c, useDataUri: e.target.value === 'true' }))}
                className="input"
              >
                <option value="true">data:image/png;base64,...（含前缀）</option>
                <option value="false">纯 base64 字符串（无前缀）</option>
              </select>
            </div>
          </div>

          {/* 请求格式说明 */}
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">请求格式：</p>
            <pre className="overflow-x-auto">{`POST {api-url}
Authorization: Bearer {api-key}  (如填写)
Content-Type: application/json

{
  "image": "${apiConfig.useDataUri ? 'data:image/png;base64,...' : 'iVBORw0KGgo...'}"
}`}</pre>
            <p className="mt-2 font-medium text-slate-700 dark:text-slate-300">
              响应格式（{apiConfig.responseFormat}）：
            </p>
            <p>
              {apiConfig.responseFormat === 'binary' && 'HTTP 响应体直接是图片二进制数据'}
              {apiConfig.responseFormat === 'base64-json' &&
                `JSON 响应，从 "${apiConfig.imagePath}" 字段读取 base64 图片`}
              {apiConfig.responseFormat === 'json-url' &&
                `JSON 响应，从 "${apiConfig.imagePath}" 字段读取图片 URL 并下载`}
            </p>
          </div>

          {/* 保存按钮 */}
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={handleSaveApiConfig} className="btn-primary">
              <Save size={16} />
              保存配置
            </button>
            {apiConfigSaved && (
              <span className="text-sm text-accent-600 dark:text-accent-400">配置已保存</span>
            )}
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">处理失败</p>
            <p className="mt-1 break-words">{error}</p>
          </div>
        </div>
      )}

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

              {/* 本地模式算法选项 */}
              {mode === 'local' && (
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['whiteBalance', '自动白平衡'],
                      ['clahe', 'CLAHE 对比度'],
                      ['denoise', '双边滤波去噪'],
                      ['sharpen', '锐化'],
                      ['saturate', '饱和度提升'],
                      ['brightness', 'Gamma 提亮'],
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
              )}

              {/* AI 模式提示 */}
              {mode === 'ai-api' && !apiConfig.url && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  请先点击上方「配置 API」填写 API 地址
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={processing || (mode === 'ai-api' && !apiConfig.url)}
                  className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {processing
                    ? mode === 'local'
                      ? '修复中...'
                      : 'AI 修复中...'
                    : mode === 'local'
                      ? '一键修复'
                      : 'AI 修复'}
                </button>
                <button type="button" onClick={handleReset} className="btn-secondary">
                  <RotateCcw size={16} />
                  重新上传
                </button>
              </div>
              {processing && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {mode === 'local'
                    ? '纯 JS 算法处理中，图片越大耗时越长，请稍候...'
                    : '正在调用外部 API 处理，取决于 API 响应速度，请稍候...'}
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
              <p className="text-sm">上传图片并点击修复按钮后，结果会显示在这里</p>
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
