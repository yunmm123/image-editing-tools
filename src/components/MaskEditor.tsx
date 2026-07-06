// 蒙版编辑器：用户手动涂抹修正主体范围
//
// 设计：
//   - 一个可见 canvas，背景由 CSS 棋盘格图案提供（透明区域自然透出棋盘）
//   - 一个离屏 sourceRGB canvas 保存原图（alpha=255），用于"保留"画笔恢复像素
//   - "保留"画笔：globalCompositeOperation='source-over'，clip 到圆，drawImage(sourceRGB)
//     → 圆内像素变为不透明，显示原图 RGB
//   - "删除"画笔：globalCompositeOperation='destination-out'，fillRect 圆
//     → 圆内像素 alpha 变 0，透出棋盘
//   - 撤销：仅快照 alpha 通道（4MB/张，最多 8 张）
//   - WYSIWYG：用户所见即所得，涂抹即时反映在棋盘格背景上

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Undo2, Trash2, Brush, Eraser, Check } from 'lucide-react';

interface MaskEditorProps {
  open: boolean;
  /** 原图 ImageData（RGB 会被使用，alpha 会被忽略并替换为 255） */
  sourceImageData: ImageData;
  /** 初始 alpha 蒙版（长度 = width * height，0=透明 255=不透明） */
  initialAlpha: Uint8ClampedArray;
  /** 应用蒙版回调，返回新的 alpha 数组 */
  onApply: (alpha: Uint8ClampedArray) => void;
  onClose: () => void;
}

type BrushMode = 'keep' | 'remove';

const MAX_HISTORY = 8;

export default function MaskEditor({
  open,
  sourceImageData,
  initialAlpha,
  onApply,
  onClose,
}: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRGBRef = useRef<HTMLCanvasElement | null>(null);
  const rgbDataRef = useRef<ImageData | null>(null);
  const historyRef = useRef<Uint8ClampedArray[]>([]);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const displayScaleRef = useRef(1);
  const brushSizeRef = useRef(40);

  const [brushSize, setBrushSize] = useState(40);
  const [brushMode, setBrushMode] = useState<BrushMode>('remove');
  const [canUndo, setCanUndo] = useState(false);
  const [displayScale, setDisplayScale] = useState(1);

  // 同步到 ref（避免 pointer 回调闭包陈旧）
  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);
  useEffect(() => {
    displayScaleRef.current = displayScale;
  }, [displayScale]);

  // 计算显示缩放（适配视口）
  const updateDisplayScale = useCallback(() => {
    const display = canvasRef.current;
    if (!display) return;
    const w = display.width;
    const h = display.height;
    if (!w || !h) return;
    const maxW = window.innerWidth - 64;
    const maxH = window.innerHeight - 200;
    const scale = Math.min(maxW / w, maxH / h, 1);
    setDisplayScale(scale);
  }, []);

  // 初始化：构建 sourceRGB 离屏 canvas，初始化可见 canvas
  useEffect(() => {
    if (!open) return;
    const w = sourceImageData.width;
    const h = sourceImageData.height;

    // 离屏 sourceRGB canvas（alpha=255）
    const rgbCanvas = document.createElement('canvas');
    rgbCanvas.width = w;
    rgbCanvas.height = h;
    const rgbCtx = rgbCanvas.getContext('2d')!;
    const rgbData = new ImageData(new Uint8ClampedArray(sourceImageData.data), w, h);
    for (let i = 0; i < w * h; i++) {
      rgbData.data[4 * i + 3] = 255;
    }
    rgbCtx.putImageData(rgbData, 0, 0);
    sourceRGBRef.current = rgbCanvas;
    rgbDataRef.current = rgbData;

    // 可见 canvas：用原图 RGB + initialAlpha 初始化
    const display = canvasRef.current!;
    display.width = w;
    display.height = h;
    const ctx = display.getContext('2d')!;
    const initData = new ImageData(new Uint8ClampedArray(sourceImageData.data), w, h);
    for (let i = 0; i < w * h; i++) {
      initData.data[4 * i + 3] = initialAlpha[i];
    }
    ctx.putImageData(initData, 0, 0);

    historyRef.current = [];
    setCanUndo(false);
    updateDisplayScale();
  }, [open, sourceImageData, initialAlpha, updateDisplayScale]);

  // 监听窗口大小
  useEffect(() => {
    if (!open) return;
    const handler = () => updateDisplayScale();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [open, updateDisplayScale]);

  // 撤销：从历史恢复
  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const display = canvasRef.current;
    const rgbData = rgbDataRef.current;
    if (!display || !rgbData) return;
    const alpha = historyRef.current.pop()!;
    const w = display.width;
    const h = display.height;
    const ctx = display.getContext('2d')!;
    const restored = new ImageData(new Uint8ClampedArray(rgbData.data), w, h);
    for (let i = 0; i < alpha.length; i++) {
      restored.data[4 * i + 3] = alpha[i];
    }
    ctx.putImageData(restored, 0, 0);
    setCanUndo(historyRef.current.length > 0);
  }, []);

  // ESC 关闭 / Ctrl+Z 撤销
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, handleUndo]);

  // 保存历史快照（仅 alpha 通道，节省内存）
  const pushHistory = useCallback(() => {
    const display = canvasRef.current;
    if (!display) return;
    const ctx = display.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, display.width, display.height);
    const alphaOnly = new Uint8ClampedArray(display.width * display.height);
    for (let i = 0; i < alphaOnly.length; i++) {
      alphaOnly[i] = imgData.data[4 * i + 3];
    }
    historyRef.current.push(alphaOnly);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
    setCanUndo(historyRef.current.length > 0);
  }, []);

  // 清空：恢复为全部保留（alpha=255）
  const handleClear = useCallback(() => {
    pushHistory();
    const display = canvasRef.current;
    const rgb = sourceRGBRef.current;
    if (!display || !rgb) return;
    const ctx = display.getContext('2d')!;
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.drawImage(rgb, 0, 0);
  }, [pushHistory]);

  // 屏幕坐标 → canvas 内部坐标
  const getCanvasPos = (e: React.PointerEvent): { x: number; y: number } => {
    const display = canvasRef.current!;
    const rect = display.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (display.width / rect.width),
      y: (e.clientY - rect.top) * (display.height / rect.height),
    };
  };

  // 在 canvas 上画一个圆形（按画笔模式）
  const drawCircle = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    mode: BrushMode
  ) => {
    const rgb = sourceRGBRef.current!;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (mode === 'keep') {
      // source-over：用原图 RGB 覆盖（不透明）
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(rgb, 0, 0);
    } else {
      // destination-out：挖空（alpha=0）
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.restore();
  };

  // 沿两点连线插值画圆，避免快速拖动出现断点
  const drawLine = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    mode: BrushMode
  ) => {
    const display = canvasRef.current;
    if (!display) return;
    const ctx = display.getContext('2d')!;
    const radius = brushSizeRef.current / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = Math.max(1, radius / 4);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      drawCircle(ctx, from.x + dx * t, from.y + dy * t, radius, mode);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pushHistory();
    const pos = getCanvasPos(e);
    lastPosRef.current = pos;
    const display = canvasRef.current;
    if (!display) return;
    const ctx = display.getContext('2d')!;
    drawCircle(ctx, pos.x, pos.y, brushSizeRef.current / 2, brushMode);
  };

  // 直接 DOM 操作更新画笔光标位置，避免触发 React 重渲染
  const updateCursorEl = (canvasX: number, canvasY: number) => {
    const el = cursorRef.current;
    if (!el) return;
    const scale = displayScaleRef.current;
    const cs = brushSizeRef.current * scale;
    el.style.width = `${cs}px`;
    el.style.height = `${cs}px`;
    el.style.transform = `translate(${canvasX * scale - cs / 2}px, ${
      canvasY * scale - cs / 2
    }px)`;
    el.style.opacity = '1';
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = getCanvasPos(e);
    updateCursorEl(pos.x, pos.y);
    if (!drawingRef.current || !lastPosRef.current) return;
    drawLine(lastPosRef.current, pos, brushMode);
    lastPosRef.current = pos;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    drawingRef.current = false;
    lastPosRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const handlePointerLeave = () => {
    if (cursorRef.current) cursorRef.current.style.opacity = '0';
  };

  const handlePointerEnter = () => {
    if (cursorRef.current) cursorRef.current.style.opacity = '1';
  };

  // 应用：提取当前 canvas 的 alpha 通道返回
  const handleApply = useCallback(() => {
    const display = canvasRef.current;
    if (!display) return;
    const ctx = display.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, display.width, display.height);
    const alpha = new Uint8ClampedArray(display.width * display.height);
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = imgData.data[4 * i + 3];
    }
    onApply(alpha);
  }, [onApply]);

  if (!open) return null;

  const w = sourceImageData.width;
  const h = sourceImageData.height;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur animate-fade-in">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          title="关闭"
        >
          <X size={20} />
        </button>
        <h2 className="text-base font-semibold text-white">手动修正主体范围</h2>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 size={16} /> 撤销
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
          >
            <Trash2 size={16} /> 清空
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="btn-primary"
          >
            <Check size={16} /> 应用修正
          </button>
        </div>
      </div>

      {/* 工具面板 */}
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-700 bg-slate-800/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">画笔：</span>
          <button
            type="button"
            onClick={() => setBrushMode('keep')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              brushMode === 'keep'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Brush size={14} /> 保留
          </button>
          <button
            type="button"
            onClick={() => setBrushMode('remove')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              brushMode === 'remove'
                ? 'bg-rose-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Eraser size={14} /> 删除
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">大小：</span>
          <input
            type="range"
            min={5}
            max={200}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-32 accent-emerald-500"
          />
          <span className="w-10 text-xs text-slate-300">{brushSize}px</span>
        </div>
        <p className="ml-auto hidden text-xs text-slate-400 sm:block">
          绿色画笔涂抹的区域将被保留，红色画笔涂抹的区域将被删除
        </p>
      </div>

      {/* 画布区域 */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        <div
          className="relative shadow-2xl"
          style={{
            width: w * displayScale,
            height: h * displayScale,
            backgroundImage: `
              linear-gradient(45deg, #d1d5db 25%, transparent 25%),
              linear-gradient(-45deg, #d1d5db 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #d1d5db 75%),
              linear-gradient(-45deg, transparent 75%, #d1d5db 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            backgroundColor: '#f9fafb',
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerEnter={handlePointerEnter}
            className="absolute inset-0 touch-none"
            style={{ width: '100%', height: '100%', cursor: 'none' }}
          />
          {/* 自定义画笔光标（直接 DOM 操作定位，避免重渲染） */}
          <div
            ref={cursorRef}
            className="pointer-events-none absolute left-0 top-0 rounded-full border-2 opacity-0"
            style={{
              borderColor: brushMode === 'keep' ? '#10b981' : '#f43f5e',
              backgroundColor:
                brushMode === 'keep' ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
            }}
          />
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="border-t border-slate-700 bg-slate-800/50 px-4 py-2 text-center text-xs text-slate-400">
        原图尺寸：{w} × {h} px · 显示缩放：{Math.round(displayScale * 100)}% ·
        快捷键：Ctrl+Z 撤销 / ESC 关闭
      </div>
    </div>
  );
}
