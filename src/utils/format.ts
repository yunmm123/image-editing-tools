// 文件大小格式化工具

/**
 * 将字节数格式化为易读的字符串
 * @param bytes 字节数
 * @returns 如 "1.23 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);
  return `${(bytes / Math.pow(k, index)).toFixed(2)} ${sizes[index]}`;
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * 格式化毫秒为可读时长
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} 分 ${rest} 秒`;
}
