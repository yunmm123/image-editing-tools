import { Link } from 'react-router-dom';
import {
  Scissors,
  ZoomIn,
  Wand2,
  Archive,
  Repeat,
  IdCard,
  Shield,
  Zap,
  Cpu,
} from 'lucide-react';
import ToolCard from '../components/ToolCard';
import SponsorBanner from '../components/SponsorBanner';

const TOOLS = [
  {
    to: '/remove-bg',
    title: 'AI 智能抠图',
    description: '基于 RMBG-1.4 模型，一键移除背景，生成透明 PNG',
    icon: Scissors,
    badge: 'AI',
    accent: 'brand' as const,
  },
  {
    to: '/upscale',
    title: 'AI 无损放大',
    description: '4 倍超分辨率，让模糊小图变高清大图',
    icon: ZoomIn,
    badge: 'AI',
    accent: 'brand' as const,
  },
  {
    to: '/restore',
    title: '老照片修复',
    description: 'CLAHE 对比度增强 + 双边滤波去噪 + 锐化，纯 JS 算法',
    icon: Wand2,
    accent: 'accent' as const,
  },
  {
    to: '/compress',
    title: '图片压缩',
    description: 'Canvas 重编码压缩，支持 JPEG/WebP/AVIF，批量打包下载',
    icon: Archive,
    accent: 'accent' as const,
  },
  {
    to: '/convert',
    title: '格式转换',
    description: 'PNG / JPEG / WebP / AVIF / BMP 互转，批量处理',
    icon: Repeat,
    accent: 'accent' as const,
  },
  {
    to: '/id-photo',
    title: '证件照换底',
    description: '一寸 / 二寸规格，白蓝红渐变背景一键替换',
    icon: IdCard,
    accent: 'brand' as const,
  },
];

const FEATURES = [
  {
    icon: Shield,
    title: '隐私安全',
    desc: '所有图片处理在浏览器本地完成，绝不上传服务器',
  },
  {
    icon: Zap,
    title: '极速推理',
    desc: 'WebGPU 加速，模型缓存后秒开，抠图 5 秒内完成',
  },
  {
    icon: Cpu,
    title: 'Web Worker',
    desc: 'AI 推理运行在后台线程，UI 永不卡顿',
  },
];

/**
 * 首页：工具入口网格 + 项目介绍 + 赞助
 */
export default function HomePage() {
  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-accent-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900" />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(79,70,229,0.15) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.15) 0, transparent 40%)',
        }} />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <Shield size={14} />
              100% 本地处理 · 隐私优先
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
              <span className="bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent">
                PicBetter
              </span>
              <br />
              AI 图片处理工具
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
              免费、开源、隐私安全的 AI 图片在线处理工具。所有处理在浏览器本地完成，
              图片不上传，保护隐私。支持 AI 抠图、无损放大、老照片修复、压缩、格式转换、证件照换底。
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/remove-bg" className="btn-primary text-base">
                立即体验
              </Link>
              <a
                href="https://github.com/your-username/pic-better"
                target="_blank"
                rel="noreferrer"
                className="btn-secondary text-base"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 功能卡片 */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">六大功能</h2>
          <p className="mt-2 text-slate-500 dark:text-slate-400">所有功能完全免费，无需注册，无需登录</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <ToolCard key={tool.to} {...tool} />
          ))}
        </div>
      </section>

      {/* 核心特性 */}
      <section className="border-y border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                  <f.icon size={22} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SponsorBanner />
    </div>
  );
}
