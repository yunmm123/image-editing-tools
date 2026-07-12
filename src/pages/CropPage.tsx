// 图片裁剪页：自由裁剪 + 固定比例（1:1 / 4:3 / 16:9 等）
// 交互：拖动裁剪框移动，拖动 8 个手柄调整大小；支持鼠标 + 触摸（pointer 事件）

import { useState, useRef, useCallback, useMemo } from 'react';
import { Crop, RotateCcw, Loader2, ImageIcon } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import DownloadButton from '../components/DownloadButton';
import { createCanvas, canvasToBlob, MIME_BY_FORMAT, isLossyFormat } from '../utils/canvas';
import { loadImageFromFile, buildOutputFilename } from '../utils/image';
import { formatBytes } from '../utils/format';
import type { ImageFormat } from '../types';

// 比例预设：null = 自由
const ASPECT_PRESETS: { label: string; ratio: number | null }[] = [
  { label: '自由', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
];

// 裁剪框（按显示坐标）
interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 拖拽类型
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

const MIN_SIZE = 20; // 裁剪框最小尺寸（显示像素）

/**
 * 图片裁剪页
 */
export default function CropPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);

  // 比例选择
  const [aspect, setAspect] = useState<number | null>(null);

  // 图片显示尺寸（受容器约束后的实际渲染尺寸）
  const [displayedW, setDisplayedW] = useState(0);
  const [displayedH, setDisplayedH] = useState(0);
  // 原图自然尺寸
  const imgRef = useRef<HTMLImageElement | null>(null);
  const naturalWRef = useRef(0);
  const naturalHRef = useRef(0);

  // 裁剪框（显示坐标）
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });

  // 拖拽状态
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    orig: CropRect;
  } | null>(null);
  const [, forceRender] = useState(0); // 拖拽过程中触发渲染

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
      setCrop({ x: 0, y: 0, w: 0, h: 0 });
    },
    [previewUrl, resultUrl]
  );

  // 图片加载完成后，计算显示尺寸 + 初始化裁剪框
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    // 显示尺寸（已由 CSS object-contain 限制）
    const dw = img.clientWidth;
    const dh = img.clientHeight;
    setDisplayedW(dw);
    setDisplayedH(dh);
    naturalWRef.current = img.naturalWidth;
    naturalHRef.current = img.naturalHeight;
    // 初始裁剪框：居中 80%
    const cw = dw * 0.8;
    const ch = aspect ? cw / aspect : dh * 0.8;
    const finalH = aspect ? Math.min(ch, dh * 0.95) : ch;
    const finalW = aspect ? finalH * aspect : cw;
    setCrop({
      x: (dw - finalW) / 2,
      y: (dh - finalH) / 2,
      w: finalW,
      h: finalH,
    });
  }, [aspect]);

  // 切换比例时重新调整裁剪框
  const handleAspectChange = useCallback(
    (ratio: number | null) => {
      setAspect(ratio);
      if (!displayedW || !displayedH) return;
      if (ratio) {
        // 按当前裁剪框中心，调整为符合比例的最大尺寸
        const cx = crop.x + crop.w / 2;
        const cy = crop.y + crop.h / 2;
        let w = crop.w;
        let h = w / ratio;
        if (h > crop.h) {
          h = crop.h;
          w = h * ratio;
        }
        // 不超出图片
        if (w > displayedW) {
          w = displayedW;
          h = w / ratio;
        }
        if (h > displayedH) {
          h = displayedH;
          w = h * ratio;
        }
        let x = cx - w / 2;
        let y = cy - h / 2;
        x = Math.max(0, Math.min(x, displayedW - w));
        y = Math.max(0, Math.min(y, displayedH - h));
        setCrop({ x, y, w, h });
      }
    },
    [crop, displayedW, displayedH]
  );

  // 指针按下：开始拖拽
  const onPointerDown = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        orig: { ...crop },
      };
    },
    [crop]
  );

  // 指针移动：更新裁剪框
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const o = drag.orig;
      let { x, y, w, h } = o;
      const mode = drag.mode;

      const clamp = (v: number, min: number, max: number) =>
        Math.max(min, Math.min(v, max));

      if (mode === 'move') {
        x = clamp(o.x + dx, 0, displayedW - o.w);
        y = clamp(o.y + dy, 0, displayedH - o.h);
      } else {
        // 调整尺寸
        let nx = o.x;
        let ny = o.y;
        let nw = o.w;
        let nh = o.h;
        if (mode.includes('e')) nw = o.w + dx;
        if (mode.includes('s')) nh = o.h + dy;
        if (mode.includes('w')) {
          nw = o.w - dx;
          nx = o.x + dx;
        }
        if (mode.includes('n')) {
          nh = o.h - dy;
          ny = o.y + dy;
        }

        // 比例约束：以主导轴为准
        if (aspect) {
          // 判断哪个轴变化更大
          const dwAbs = Math.abs(nw - o.w);
          const dhAbs = Math.abs(nh - o.h);
          if (mode === 'n' || mode === 's') {
            // 垂直主导
            nw = nh * aspect;
            if (mode.includes('w')) nx = o.x + (o.w - nw);
          } else if (mode === 'e' || mode === 'w') {
            // 水平主导
            nh = nw / aspect;
            if (mode.includes('n')) ny = o.y + (o.h - nh);
          } else {
            // 角落：取变化大的
            if (dwAbs >= dhAbs) {
              nh = nw / aspect;
              if (mode.includes('n')) ny = o.y + (o.h - nh);
            } else {
              nw = nh * aspect;
              if (mode.includes('w')) nx = o.x + (o.w - nw);
            }
          }
        }

        // 最小尺寸
        if (nw < MIN_SIZE) {
          if (mode.includes('w')) nx = o.x + o.w - MIN_SIZE;
          nw = MIN_SIZE;
          if (aspect) nh = nw / aspect;
        }
        if (nh < MIN_SIZE) {
          if (mode.includes('n')) ny = o.y + o.h - MIN_SIZE;
          nh = MIN_SIZE;
          if (aspect) nw = nh * aspect;
        }

        // 边界约束
        if (nx < 0) {
          nw += nx;
          nx = 0;
          if (aspect) nh = nw / aspect;
        }
        if (ny < 0) {
          nh += ny;
          ny = 0;
          if (aspect) nw = nh * aspect;
        }
        if (nx + nw > displayedW) {
          nw = displayedW - nx;
          if (aspect) nh = nw / aspect;
        }
        if (ny + nh > displayedH) {
          nh = displayedH - ny;
          if (aspect) nw = nh * aspect;
        }

        x = nx;
        y = ny;
        w = nw;
        h = nh;
      }

      setCrop({ x, y, w, h });
      forceRender((v) => v + 1);
    },
    [displayedW, displayedH, aspect]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      dragRef.current = null;
    }
  }, []);

  // 应用裁剪
  const handleApply = useCallback(async () => {
    if (!file || !imgRef.current || !displayedW) return;
    setProcessing(true);
    try {
      // 显示坐标 → 自然坐标
      const scaleX = naturalWRef.current / displayedW;
      const scaleY = naturalHRef.current / displayedH;
      const sx = Math.round(crop.x * scaleX);
      const sy = Math.round(crop.y * scaleY);
      const sw = Math.round(crop.w * scaleX);
      const sh = Math.round(crop.h * scaleY);

      const { canvas, ctx } = createCanvas(sw, sh);
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await canvasToBlob(canvas, 'image/png');
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error('裁剪失败:', err);
    } finally {
      setProcessing(false);
    }
  }, [file, crop, displayedW, resultUrl]);

  // 重新编码为其他格式
  const handleReencode = useCallback(
    async (format: ImageFormat): Promise<Blob> => {
      if (!resultBlob) throw new Error('无结果');
      const img = await loadImageFromFile(resultBlob);
      const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
      if (format === 'jpeg' || format === 'bmp') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      return canvasToBlob(
        canvas,
        MIME_BY_FORMAT[format],
        isLossyFormat(format) ? 0.92 : undefined
      );
    },
    [resultBlob]
  );

  const handleReset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setCrop({ x: 0, y: 0, w: 0, h: 0 });
    setAspect(null);
  }, [previewUrl, resultUrl]);

  const fileName = useMemo(
    () => (file ? buildOutputFilename(file.name, 'cropped', 'png') : 'cropped.png'),
    [file]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-md">
            <Crop size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">图片裁剪</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              自由裁剪或按固定比例裁剪图片
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：上传 + 裁剪交互 */}
        <div className="card p-5">
          {!file ? (
            <ImageUploader onFiles={handleFiles} hint="上传需要裁剪的图片，支持鼠标拖拽框选" />
          ) : (
            <div className="space-y-4">
              {/* 裁剪交互区 */}
              <div className="relative flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                <div className="relative inline-block" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                  <img
                    ref={imgRef}
                    src={previewUrl ?? ''}
                    alt="原图"
                    onLoad={handleImgLoad}
                    className="block max-h-[420px] max-w-full object-contain select-none"
                    draggable={false}
                  />
                  {/* 裁剪框（仅在图片已加载且有尺寸时显示） */}
                  {displayedW > 0 && crop.w > 0 && (
                    <div
                      className="absolute border-2 border-brand-500 cursor-move"
                      style={{
                        left: crop.x,
                        top: crop.y,
                        width: crop.w,
                        height: crop.h,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                      }}
                      onPointerDown={onPointerDown('move')}
                    >
                      {/* 三分线 */}
                      <div className="pointer-events-none absolute inset-0">
                        <div className="absolute left-1/3 top-0 h-full w-px bg-white/40" />
                        <div className="absolute left-2/3 top-0 h-full w-px bg-white/40" />
                        <div className="absolute top-1/3 left-0 h-px w-full bg-white/40" />
                        <div className="absolute top-2/3 left-0 h-px w-full bg-white/40" />
                      </div>
                      {/* 8 个手柄 */}
                      {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as DragMode[]).map((h) => {
                        const isCorner = h.length === 2;
                        const pos: React.CSSProperties = { position: 'absolute' };
                        if (h.includes('n')) pos.top = -5;
                        if (h.includes('s')) pos.bottom = -5;
                        if (h.includes('w')) pos.left = -5;
                        if (h.includes('e')) pos.right = -5;
                        if (h === 'n' || h === 's') {
                          pos.left = '50%';
                          pos.transform = 'translateX(-50%)';
                        }
                        if (h === 'e' || h === 'w') {
                          pos.top = '50%';
                          pos.transform = 'translateY(-50%)';
                        }
                        const cursor =
                          h === 'n' || h === 's'
                            ? 'ns-resize'
                            : h === 'e' || h === 'w'
                            ? 'ew-resize'
                            : h === 'nw' || h === 'se'
                            ? 'nwse-resize'
                            : 'nesw-resize';
                        return (
                          <div
                            key={h}
                            onPointerDown={onPointerDown(h)}
                            className={`absolute z-10 bg-white border border-brand-500 ${
                              isCorner ? 'h-3 w-3 rounded-sm' : 'h-2 w-4'
                            }`}
                            style={{ ...pos, cursor, transform: isCorner ? undefined : pos.transform }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 文件信息 */}
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span className="truncate">{file.name}</span>
                <span>{formatBytes(file.size)}</span>
              </div>

              {/* 比例预设 */}
              <div>
                <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">裁剪比例</p>
                <div className="flex flex-wrap gap-2">
                  {ASPECT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleAspectChange(p.ratio)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        aspect === p.ratio
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={processing || crop.w < MIN_SIZE}
                  className="btn-primary flex-1"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <Crop size={16} />}
                  {processing ? '裁剪中...' : '应用裁剪'}
                </button>
                <button type="button" onClick={handleReset} className="btn-secondary">
                  <RotateCcw size={16} />
                  重新上传
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 右：结果 */}
        <div className="card p-5">
          {!resultUrl ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center text-slate-400">
              <ImageIcon size={48} className="mb-3" />
              <p className="text-sm">裁剪后的图片会显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={resultUrl} alt="裁剪结果" className="mx-auto max-h-80 object-contain" />
              </div>
              {resultBlob && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatBytes(resultBlob.size)}
                  </span>
                  <DownloadButton
                    blob={resultBlob}
                    filename={fileName}
                    formats={['png', 'jpeg', 'webp']}
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
