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
//
// 缩放与平移：
//   - 鼠标滚轮缩放（以光标为中心），范围 10%-800%
//   - 中键拖拽 或 空格+左键拖拽 平移画面
//   - 工具栏提供缩放控件（-、百分比、+、适应）

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Undo2, Trash2, Brush, Eraser, Check, ZoomIn, ZoomOut, Maximize2, Hand } from 'lucide-react';

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
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

export default function MaskEditor({
  open,
  sourceImageData,
  initialAlpha,
  onApply,
  onClose,
}: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRGBRef = useRef<HTMLCanvasElement | null>(null);
  const rgbDataRef = useRef<ImageData | null>(null);
  const historyRef = useRef<Uint8ClampedArray[]>([]);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const displayScaleRef = useRef(1);
  const brushSizeRef = useRef(40);
  // 缩放/平移状态用 ref 同步给事件回调，避免闭包陈旧
  const userZoomRef = useRef(1);
  const panOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const spacePressedRef = useRef(false);

  const [brushSize, setBrushSize] = useState(40);
  const [brushMode, setBrushMode] = useState<BrushMode>('remove');
  const [canUndo, setCanUndo] = useState(false);
  const [displayScale, setDisplayScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // 同步 ref
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { displayScaleRef.current = displayScale; }, [displayScale]);
  useEffect(() => { userZoomRef.current = userZoom; }, [userZoom]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  const effectiveScale = displayScale * userZoom;

  // 计算基础适配缩放
  const updateDisplayScale = useCallback(() => {
    const display = canvasRef.current;
    if (!display) return;
    const w = display.width;
    const h = display.height;
    if (!w || !h) return;
    const container = containerRef.current;
    const maxW = container ? container.clientWidth - 32 : window.innerWidth - 64;
    const maxH = container ? container.clientHeight - 32 : window.innerHeight - 240;
    const scale = Math.min(maxW / w, maxH / h, 1);
    const safeScale = Math.max(0.05, scale);
    setDisplayScale(safeScale);
    // 适应模式下（用户未缩放）重新居中
    if (userZoomRef.current === 1 && container) {
      setPanOffset({
        x: (container.clientWidth - w * safeScale) / 2,
        y: (container.clientHeight - h * safeScale) / 2,
      });
    }
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
    setUserZoom(1);
    userZoomRef.current = 1;
    setPanOffset({ x: 0, y: 0 });
    panOffsetRef.current = { x: 0, y: 0 };
    panningRef.current = false;
    spacePressedRef.current = false;
    // 等待容器尺寸就绪后再计算适配缩放并居中
    requestAnimationFrame(updateDisplayScale);
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

  // ESC 关闭 / Ctrl+Z 撤销 / 空格平移
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
      } else if (e.code === 'Space' && !e.repeat) {
        // 防止页面滚动
        e.preventDefault();
        spacePressedRef.current = true;
        setIsPanning(true);
      }
    };
    const upHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', upHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', upHandler);
    };
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

  // 屏幕（相对容器）坐标 → canvas 内部坐标，考虑缩放和平移
  const getCanvasPos = (clientX: number, clientY: number): { x: number; y: number } => {
    const display = canvasRef.current;
    const container = containerRef.current;
    if (!display || !container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const eff = displayScaleRef.current * userZoomRef.current;
    const pan = panOffsetRef.current;
    return {
      x: (clientX - rect.left - pan.x) / eff,
      y: (clientY - rect.top - pan.y) / eff,
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
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(rgb, 0, 0);
    } else {
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

  // 是否应进入平移模式（中键 或 空格+左键）
  const shouldPan = (e: React.PointerEvent) =>
    e.button === 1 || (e.button === 0 && spacePressedRef.current);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);

    if (shouldPan(e)) {
      // 平移
      panningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panOffsetRef.current.x,
        panY: panOffsetRef.current.y,
      };
      return;
    }

    if (e.button !== 0) return; // 仅左键绘制
    drawingRef.current = true;
    pushHistory();
    const pos = getCanvasPos(e.clientX, e.clientY);
    lastPosRef.current = pos;
    const display = canvasRef.current;
    if (!display) return;
    const ctx = display.getContext('2d')!;
    drawCircle(ctx, pos.x, pos.y, brushSizeRef.current / 2, brushMode);
  };

  // 直接 DOM 操作更新画笔光标位置，避免触发 React 重渲染
  // 注意：cursorRef 是 inner div 的子元素，inner div 已被 pan 偏移过，
  // 所以 cursorRef 的 transform 只应包含 canvas 内部坐标 × eff，不再叠加 pan。
  const updateCursorEl = (canvasX: number, canvasY: number) => {
    const el = cursorRef.current;
    if (!el) return;
    const eff = displayScaleRef.current * userZoomRef.current;
    const cs = brushSizeRef.current * eff;
    // 相对于 inner div 左上角的像素坐标（inner div 本身已被父级 pan 偏移）
    const localX = canvasX * eff;
    const localY = canvasY * eff;
    el.style.width = `${cs}px`;
    el.style.height = `${cs}px`;
    el.style.transform = `translate(${localX - cs / 2}px, ${localY - cs / 2}px)`;
    el.style.opacity = '1';
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = getCanvasPos(e.clientX, e.clientY);

    // 平移中
    if (panningRef.current && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanOffset({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    // 非绘制时也更新光标位置
    if (spacePressedRef.current) {
      return; // 平移模式下不显示画笔光标
    }
    updateCursorEl(pos.x, pos.y);
    if (!drawingRef.current || !lastPosRef.current) return;
    drawLine(lastPosRef.current, pos, brushMode);
    lastPosRef.current = pos;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    drawingRef.current = false;
    panningRef.current = false;
    panStartRef.current = null;
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
    if (cursorRef.current && !spacePressedRef.current) cursorRef.current.style.opacity = '1';
  };

  // 滚轮缩放：以光标为中心
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldZoom = userZoomRef.current;
    // deltaY > 0 向下滚动 = 缩小
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
    if (newZoom === oldZoom) return;

    const oldEff = displayScaleRef.current * oldZoom;
    const newEff = displayScaleRef.current * newZoom;
    const pan = panOffsetRef.current;
    // 保持光标下的图像点不动：imgPt = (mx - panX) / oldEff
    const imgX = (mx - pan.x) / oldEff;
    const imgY = (my - pan.y) / oldEff;
    const newPanX = mx - imgX * newEff;
    const newPanY = my - imgY * newEff;

    setUserZoom(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  }, []);

  // 用原生非被动监听器绑定 wheel（React onWheel 是被动的，preventDefault 无效）
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [open, handleWheel]);

  // 缩放控件
  const zoomBy = (factor: number) => {
    const container = containerRef.current;
    const w = sourceImageData.width;
    const h = sourceImageData.height;
    // 以画面中心为缩放中心
    const mx = container ? container.clientWidth / 2 : w / 2;
    const my = container ? container.clientHeight / 2 : h / 2;
    const oldZoom = userZoomRef.current;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
    if (newZoom === oldZoom) return;
    const oldEff = displayScaleRef.current * oldZoom;
    const newEff = displayScaleRef.current * newZoom;
    const pan = panOffsetRef.current;
    const imgX = (mx - pan.x) / oldEff;
    const imgY = (my - pan.y) / oldEff;
    setUserZoom(newZoom);
    setPanOffset({ x: mx - imgX * newEff, y: my - imgY * newEff });
  };

  const handleZoomIn = () => zoomBy(1.25);
  const handleZoomOut = () => zoomBy(1 / 1.25);
  const handleFit = () => {
    setUserZoom(1);
    const container = containerRef.current;
    const display = canvasRef.current;
    if (container && display) {
      const eff = displayScaleRef.current;
      setPanOffset({
        x: (container.clientWidth - display.width * eff) / 2,
        y: (container.clientHeight - display.height * eff) / 2,
      });
    } else {
      setPanOffset({ x: 0, y: 0 });
    }
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
  const eff = effectiveScale;

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

        {/* 缩放控件 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">缩放：</span>
          <button
            type="button"
            onClick={handleZoomOut}
            className="rounded-md bg-slate-700 p-1.5 text-slate-300 hover:bg-slate-600"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={handleFit}
            className="w-16 rounded-md bg-slate-700 px-2 py-1 text-center text-xs text-slate-200 hover:bg-slate-600"
            title="适应窗口"
          >
            {Math.round(userZoom * 100)}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="rounded-md bg-slate-700 p-1.5 text-slate-300 hover:bg-slate-600"
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={handleFit}
            className="rounded-md bg-slate-700 p-1.5 text-slate-300 hover:bg-slate-600"
            title="适应窗口"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        <p className="ml-auto hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          {isPanning ? (
            <>
              <Hand size={12} /> 平移模式（按住空格）· 拖拽移动画面
            </>
          ) : (
            <>
              绿色=保留 · 红色=删除 · 滚轮缩放 · 空格/中键拖拽平移
            </>
          )}
        </p>
      </div>

      {/* 画布区域 */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ cursor: isPanning ? 'grab' : 'default' }}
      >
        <div
          className="absolute shadow-2xl"
          style={{
            width: w * eff,
            height: h * eff,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            backgroundImage: `
              linear-gradient(45deg, #d1d5db 25%, transparent 25%),
              linear-gradient(-45deg, #d1d5db 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #d1d5db 75%),
              linear-gradient(-45deg, transparent 75%, #d1d5db 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            backgroundColor: '#f9fafb',
            cursor: isPanning ? 'grab' : 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerEnter={handlePointerEnter}
            className="absolute inset-0 h-full w-full touch-none"
            style={{ cursor: isPanning ? 'grab' : 'none' }}
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
        用户缩放：{Math.round(userZoom * 100)}% ·
        实际：{Math.round(eff * 100)}% · 快捷键：Ctrl+Z 撤销 / 空格平移 / ESC 关闭
      </div>
    </div>
  );
}
