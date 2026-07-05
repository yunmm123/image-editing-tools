import { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';

interface LayoutProps {
  children: ReactNode;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

/**
 * 整体布局：顶部导航 + 主体内容 + 底部版权
 */
export default function Layout({ children, theme, onToggleTheme }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header theme={theme} onToggleTheme={onToggleTheme} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
