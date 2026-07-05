import { Check } from 'lucide-react';
import { PresetColor } from '../types';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** 预设颜色列表 */
  presets?: PresetColor[];
}

const DEFAULT_PRESETS: PresetColor[] = [
  { name: '白色', value: '#FFFFFF' },
  { name: '蓝色', value: '#1E64C0' },
  { name: '红色', value: '#D91414' },
  { name: '灰色', value: '#7F7F7F' },
  { name: '透明', value: 'transparent' },
];

/**
 * 颜色选择器：预设 + 自定义取色
 */
export default function ColorPicker({ value, onChange, presets = DEFAULT_PRESETS }: ColorPickerProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = value.toLowerCase() === p.value.toLowerCase();
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              title={p.name}
              className={`relative h-9 w-9 rounded-lg border-2 transition-all ${
                active ? 'border-brand-500 ring-2 ring-brand-200 dark:ring-brand-900' : 'border-slate-200 dark:border-slate-600'
              }`}
              style={{
                background:
                  p.value === 'transparent'
                    ? 'repeating-conic-gradient(#cbd5e1 0% 25%, #fff 0% 50%) 50% / 12px 12px'
                    : p.value,
              }}
            >
              {active && (
                <Check
                  size={14}
                  className={`absolute inset-0 m-auto ${
                    p.value === '#FFFFFF' || p.value === 'transparent'
                      ? 'text-slate-700'
                      : 'text-white'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value === 'transparent' ? '#FFFFFF' : value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
          aria-label="自定义颜色"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input h-9 w-28 font-mono text-xs"
          aria-label="颜色值"
        />
      </div>
    </div>
  );
}
