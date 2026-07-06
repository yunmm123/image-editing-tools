import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Github, Moon, Sun, Sparkles, Settings } from 'lucide-react';
import SettingsModal from './SettingsModal';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const NAV_ITEMS = [
  { to: '/remove-bg', label: 'AI 抠图' },
  { to: '/upscale', label: '图片放大' },
  { to: '/watermark', label: '图片水印' },
  { to: '/compress', label: '图片压缩' },
  { to: '/convert', label: '格式转换' },
  { to: '/id-photo', label: '证件照换底' },
];

/**
 * 顶部导航栏：Logo + 主导航 + 主题切换
 */
export default function Header({ theme, onToggleTheme }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-accent-500 text-white">
            <Sparkles size={18} />
          </div>
          <span className="text-lg">PicBetter</span>
        </Link>

        {/* 主导航 */}
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 右侧操作 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="btn-ghost h-9 w-9 p-0"
            title="AI 功能设置"
            aria-label="设置"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="btn-ghost h-9 w-9 p-0"
            title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
            aria-label="切换主题"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a
            href="https://github.com/yunmm123/image-editing-tools"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost h-9 w-9 p-0"
            title="GitHub 仓库"
            aria-label="GitHub"
          >
            <Github size={18} />
          </a>
        </div>
      </div>

      {/* 移动端导航 */}
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-200 px-4 py-2 lg:hidden dark:border-slate-800">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'text-slate-600 dark:text-slate-300'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
