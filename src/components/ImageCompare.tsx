import { useRef, useState, useCallback, MouseEvent, useEffect } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface ImageCompareProps {
  /** 处理前图片 URL */
  beforeSrc: string;
  /** 处理后图片 URL */
  afterSrc: string;
  /** 左侧标签 */
  beforeLabel?: string;
  /** 右侧标签 */
  afterLabel?: string;
}

/**
 * 滑动对比组件：左右拖拽分割线对比 before/after
 * 使用 clip-path 实现裁剪，避免图片尺寸同步问题
 */
export default function ImageCompare({
  beforeSrc,
  afterSrc,
  beforeLabel = '处理前',
  afterLabel = '处理后',
}: ImageCompareProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = (x / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, percent)));
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: globalThis.MouseEvent) => updatePosition(e.clientX);
    const onTouchMove = (e: globalThis.TouchEvent) => {
      if (e.touches[0]) updatePosition(e.touches[0].clientX);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDragging, updatePosition]);

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
      style={{ aspectRatio: '16 / 10' }}
    >
      {/* after 图（底层，铺满） */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-emerald-600/90 px-2 py-0.5 text-xs font-medium text-white">
        {afterLabel}
      </span>

      {/* before 图（上层，用 clip-path 裁切左侧） */}
      <img
        src={beforeSrc}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />
      <span
        className="pointer-events-none absolute left-3 top-3 rounded-md bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {beforeLabel}
      </span>

      {/* 分割线 + 拖拽手柄 */}
      <div
        className="absolute top-0 bottom-0 z-10 w-0.5 bg-white shadow-md"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        <button
          type="button"
          onMouseDown={handleMouseDown}
          onTouchStart={() => setIsDragging(true)}
          className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-brand-500 bg-white text-brand-600 shadow-lg hover:bg-brand-50"
          aria-label="拖拽分割线"
        >
          <MoveHorizontal size={16} />
        </button>
      </div>
    </div>
  );
}
