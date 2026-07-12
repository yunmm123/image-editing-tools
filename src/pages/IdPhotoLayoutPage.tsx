import { useState, useCallback, useMemo } from 'react';
import { LayoutGrid, RotateCcw, Loader2, ImageIcon } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import DownloadButton from '../components/DownloadButton';
import { createCanvas, canvasToBlob } from '../utils/canvas';
import { loadImageFromFile, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { IdPhotoSize, ImageFormat } from '../types';

/** 证件照尺寸预设（像素） */
const PHOTO_SIZES: IdPhotoSize[] = [
  { name: '一寸', width: 295, height: 413 },
  { name: '小一寸', width: 260, height: 360 },
  { name: '二寸', width: 413, height: 579 },
  { name: '小二寸', width: 354, height: 472 },
];

/** 相纸尺寸预设（像素，@300dpi） */
interface SheetPreset {
  name: string;
  width: number;
  height: number;
  desc: string;
}
const SHEET_PRESETS: SheetPreset[] = [
  { name: '6寸', width: 1200, height: 1800, desc: '4R · 4×6″' },
  { name: '5寸', width: 1050, height: 1500, desc: '3R · 3.5×5″' },
  { name: 'A4', width: 2480, height: 3508, desc: '@300dpi' },
];

/** 排版结果信息 */
interface LayoutInfo {
  count: number;
  cols: number;
  rows: number;
}

/**
 * 证件照排版页：将单张已抠好的证件照排版到相纸，方便打印冲洗
 * 纯 Canvas 实现，无 AI
 */
export default function IdPhotoLayoutPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<IdPhotoSize>(PHOTO_SIZES[0]);
  const [sheet, setSheet] = useState<SheetPreset>(SHEET_PRESETS[0]);
  const [gap, setGap] = useState(4);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [layoutInfo, setLayoutInfo] = useState<LayoutInfo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 上传单张证件照 */
  const handleFiles = useCallback(
    (files: File[]) => {
      const f = files[0];
      if (!f) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setResultUrl(null);
      setResultBlob(null);
      setLayoutInfo(null);
      setError(null);
    },
    [previewUrl, resultUrl]
  );

  /** 重置全部状态 */
  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setLayoutInfo(null);
    setError(null);
  };

  /** 生成排版：把证件照按所选规格平铺到相纸 */
  const handleGenerate = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const img = await loadImageFromFile(file);
      const photoW = photoSize.width;
      const photoH = photoSize.height;
      const sheetW = sheet.width;
      const sheetH = sheet.height;

      // 计算可排列的行列数
      const cols = Math.floor((sheetW + gap) / (photoW + gap));
      const rows = Math.floor((sheetH + gap) / (photoH + gap));
      const count = cols * rows;
      if (count < 1) {
        setError('该照片尺寸在所选相纸上放不下一张');
        return;
      }

      // 创建相纸画布并填充白底（相纸打印需白底）
      const { canvas, ctx } = createCanvas(sheetW, sheetH);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, sheetW, sheetH);

      // 计算网格总尺寸并居中
      const gridW = cols * photoW + (cols - 1) * gap;
      const gridH = rows * photoH + (rows - 1) * gap;
      const offsetX = Math.floor((sheetW - gridW) / 2);
      const offsetY = Math.floor((sheetH - gridH) / 2);

      // 逐张绘制证件照（缩放到目标尺寸，不裁剪）
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = offsetX + c * (photoW + gap);
          const y = offsetY + r * (photoH + gap);
          ctx.drawImage(img, x, y, photoW, photoH);
        }
      }

      // 相纸用于打印，导出 JPEG
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
      setLayoutInfo({ count, cols, rows });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  }, [file, photoSize, sheet, gap, resultUrl]);

  /** 按所选格式重新编码导出（PNG 需重新绘制以保留白底） */
  const handleReencode = useCallback(
    async (format: ImageFormat): Promise<Blob> => {
      if (!resultBlob) throw new Error('无图像数据');
      if (format === 'jpeg') return resultBlob;
      const img = await loadImageFromFile(
        new File([resultBlob], 'result', { type: resultBlob.type })
      );
      const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      return canvasToBlob(canvas, 'image/png');
    },
    [resultBlob]
  );

  const fileName = useMemo(
    () => (file ? buildOutputFilename(file.name, 'layout', 'jpg') : 'layout.jpg'),
    [file]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* 页头 */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-md">
            <LayoutGrid size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">证件照排版</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              将证件照排版到相纸，方便打印冲洗
            </p>
          </div>
          <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            纯 Canvas
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传 + 配置 */}
        <div className="card p-5">
          <div className="space-y-4">
            {/* 上传 / 已上传预览 */}
            {!file ? (
              <ImageUploader onFiles={handleFiles} hint="上传一张已抠好的证件照（建议透明或纯色背景）" />
            ) : (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <img src={previewUrl ?? ''} alt="证件照" className="mx-auto max-h-60 object-contain" />
                </div>
                <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                  <span className="truncate">{file.name}</span>
                  <span>{formatBytes(file.size)}</span>
                </div>
              </div>
            )}

            {/* 提示 */}
            <p className="rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
              提示：建议先在「证件照换底」功能中处理好照片再上传排版
            </p>

            {/* 证件照尺寸 */}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">证件照尺寸</p>
              <div className="grid grid-cols-4 gap-2">
                {PHOTO_SIZES.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setPhotoSize(s)}
                    className={`rounded-lg border px-2 py-2 text-xs ${
                      photoSize.name === s.name
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

            {/* 相纸尺寸 */}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">相纸尺寸</p>
              <div className="grid grid-cols-3 gap-2">
                {SHEET_PRESETS.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setSheet(s)}
                    className={`rounded-lg border px-2 py-2 text-xs ${
                      sheet.name === s.name
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {s.width}×{s.height}
                    </div>
                    <div className="text-[10px] text-slate-400">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 间距 */}
            <div>
              <label className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>间距</span>
                <span className="text-brand-600">{gap}px</span>
              </label>
              <input
                type="range"
                min={0}
                max={20}
                value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                {error}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!file || processing}
                className="btn-primary flex-1"
              >
                {processing ? <Loader2 size={16} className="animate-spin" /> : <LayoutGrid size={16} />}
                {processing ? '排版中...' : '生成排版'}
              </button>
              {file && (
                <button type="button" onClick={handleReset} className="btn-secondary">
                  <RotateCcw size={16} />
                  重新上传
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 右：预览 + 下载 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <ImageIcon size={48} className="mb-3" />
              <p className="text-sm">上传证件照并点击「生成排版」后，预览会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={resultUrl} alt="排版预览" className="mx-auto max-h-[420px] object-contain" />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span>
                  共排版 {layoutInfo?.count ?? 0} 张 ({layoutInfo?.cols ?? 0}×{layoutInfo?.rows ?? 0})
                </span>
                {resultBlob && <span>{formatBytes(resultBlob.size)}</span>}
              </div>
              {resultBlob && (
                <DownloadButton
                  blob={resultBlob}
                  filename={fileName}
                  formats={['jpeg', 'png']}
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
