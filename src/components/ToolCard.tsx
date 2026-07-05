import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';

interface ToolCardProps {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  accent?: 'brand' | 'accent';
}

/**
 * 工具卡片：首页展示各功能入口
 */
export default function ToolCard({
  to,
  title,
  description,
  icon: Icon,
  badge,
  accent = 'brand',
}: ToolCardProps) {
  const gradient =
    accent === 'brand'
      ? 'from-brand-500 to-brand-700'
      : 'from-accent-500 to-accent-700';

  return (
    <Link
      to={to}
      className="group relative flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-brand-600"
    >
      <div className="flex items-start justify-between">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-md transition-transform group-hover:scale-110`}
        >
          <Icon size={22} />
        </div>
        {badge && (
          <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
            {badge}
          </span>
        )}
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </Link>
  );
}
