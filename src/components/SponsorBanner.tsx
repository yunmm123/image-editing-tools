import { Coffee, QrCode } from 'lucide-react';

/**
 * 赞助横幅：README 风格的赞助码区域
 * 占位图需替换为实际的支付宝 / 微信赞赏码
 */
export default function SponsorBanner() {
  return (
    <section
      id="sponsor"
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
      aria-label="赞助作者"
    >
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-accent-700 p-8 text-white shadow-xl">
        <div className="flex flex-col items-center gap-8 md:flex-row md:justify-between">
          <div className="max-w-md text-center md:text-left">
            <h2 className="flex items-center justify-center gap-2 text-2xl font-bold md:justify-start">
              <Coffee size={24} />
              请作者喝杯咖啡
            </h2>
            <p className="mt-3 text-sm text-brand-100">
              PicBetter 完全免费开源，没有任何广告与追踪。如果它帮到了你，欢迎请我喝杯咖啡，
              这是对我持续维护和优化最大的鼓励 ☕
            </p>
            <p className="mt-2 text-xs text-brand-200">
              所有处理仍在浏览器本地完成，赞助不会影响任何功能。
            </p>
          </div>

          <div className="flex gap-4">
            {/* 支付宝赞赏码占位 */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-white/95 p-2">
                <QrCode size={80} className="text-slate-800" />
              </div>
              <span className="text-xs text-brand-100">支付宝（替换为你的赞赏码）</span>
            </div>
            {/* 微信赞赏码占位 */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-white/95 p-2">
                <QrCode size={80} className="text-slate-800" />
              </div>
              <span className="text-xs text-brand-100">微信（替换为你的赞赏码）</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
