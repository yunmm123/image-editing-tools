import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import RemoveBgPage from './pages/RemoveBgPage';
import UpscalePage from './pages/UpscalePage';
import WatermarkPage from './pages/WatermarkPage';
import CompressPage from './pages/CompressPage';
import ConvertPage from './pages/ConvertPage';
import IdPhotoPage from './pages/IdPhotoPage';

/** 主题类型 */
type Theme = 'light' | 'dark';

/** 读取本地存储的主题，默认跟随系统 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('pic-better-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // 应用主题到 html 元素
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('pic-better-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <Layout theme={theme} onToggleTheme={toggleTheme}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/remove-bg" element={<RemoveBgPage />} />
        <Route path="/upscale" element={<UpscalePage />} />
        <Route path="/watermark" element={<WatermarkPage />} />
        <Route path="/compress" element={<CompressPage />} />
        <Route path="/convert" element={<ConvertPage />} />
        <Route path="/id-photo" element={<IdPhotoPage />} />
      </Routes>
    </Layout>
  );
}
