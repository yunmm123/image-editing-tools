import { Heart } from 'lucide-react';

/**
 * 底部版权信息
 */
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400 md:flex-row">
          <p className="flex items-center gap-1.5">
            © {year} PicBetter · 用 <Heart size={14} className="text-rose-500" /> 与 AI 构建
          </p>
          <p className="text-center md:text-right">
            所有图片处理在浏览器本地完成 · 不上传任何数据 · MIT License
          </p>
        </div>
      </div>
    </footer>
  );
}
