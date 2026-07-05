// 云端 AI 超分辨率服务：通过 image-upscaling.net 免费 API 调用 Real-ESRGAN 模型
//
// 设计思路：
//   image-upscaling.net 提供基于 Real-ESRGAN 的免费超分服务：
//     - 完全免费（无注册、无 API Key、无支付）
//     - 每个 IP 每天约 €0.4 免费额度（足够多次超分）
//     - 仅需一个 32 位十六进制的 client_id（用户本地生成，仅作标识）
//
// CORS：
//   该 API 不允许浏览器直接调用，使用 cors.sh 免费代理转发（支持 POST multipart）。
//
// 流程：
//   1. ImageData → PNG Blob
//   2. POST /upscaling_upload?client_id=XXX（multipart: image, scale, model）
//      返回 upload_id（字符串，作为后续轮询的 original_filename 标识）
//   3. 轮询 GET /upscaling_get_status_v2?client_id=XXX
//      返回任务队列 JSON 数组，匹配 original_filename === upload_id 且 completed=true
//   4. GET {image_url}（或 /download_upscaling_data/{filename}?client_id=XXX）下载结果
//   5. 调用 delete_without_download=1 清理服务器数据（保护隐私）
//   6. 返回 Blob

interface CloudSuperResolveOptions {
  imageData: ImageData;
  /** 放大倍率：image-upscaling.net 支持任意整数倍 */
  scale: 2 | 4;
  /** 进度回调 */
  onProgress?: (info: { progress: number; stage: string }) => void;
}

interface CloudSuperResolveResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const API_BASE = 'https://image-upscaling.net';
const CORS_PROXY = 'https://proxy.cors.sh/';
const CLIENT_ID_KEY = 'pic-better-iu-client-id';

/** 默认使用 plus 模型（RRDB ESRGAN，质量最高） */
const DEFAULT_MODEL = 'plus';

/** 通过 cors.sh 代理封装目标 URL */
function proxied(url: string): string {
  return CORS_PROXY + url;
}

/** 生成 32 位十六进制 client_id（首次使用时生成并持久化到 localStorage） */
function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id || !/^[0-9a-f]{32}$/.test(id)) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

/** 将 ImageData 转为 PNG Blob */
async function imageDataToPngBlob(imageData: ImageData): Promise<Blob> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 OffscreenCanvas 2D 上下文');
  ctx.putImageData(imageData, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** 上传图片到 image-upscaling.net，返回 upload_id（用作 original_filename 标识） */
async function uploadImage(
  clientId: string,
  imageBlob: Blob,
  scale: number,
  model: string
): Promise<string> {
  const formData = new FormData();
  formData.append('image', imageBlob, 'upload.png');
  formData.append('scale', String(scale));
  formData.append('model', model);

  const uploadUrl = proxied(
    `${API_BASE}/upscaling_upload?client_id=${encodeURIComponent(clientId)}`
  );

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    // cors.sh 要求 Origin 头（浏览器自动设置，无需手动添加）
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`上传失败 (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  // 返回的纯文本就是 upload_id（如 "test_2026-07-05_12:53:15.590780.png"）
  const uploadId = (await response.text()).trim();
  if (!uploadId) {
    throw new Error('服务器未返回任务 ID');
  }
  return uploadId;
}

interface StatusJob {
  completed: boolean;
  filename: string;
  image_url: string;
  original_filename: string;
}

/** 轮询任务状态，等待指定 upload_id 的任务完成 */
async function pollStatus(
  clientId: string,
  uploadId: string,
  onProgress?: (info: { progress: number; stage: string }) => void
): Promise<StatusJob> {
  const statusUrl = proxied(
    `${API_BASE}/upscaling_get_status_v2?client_id=${encodeURIComponent(clientId)}`
  );

  const MAX_ATTEMPTS = 120; // 最多 4 分钟
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    onProgress?.({
      progress: Math.min(90, 20 + i * 0.6),
      stage: `AI 推理中（已等待 ${(i + 1) * 2}s）`,
    });

    const response = await fetch(statusUrl);
    if (!response.ok) {
      throw new Error(`查询任务状态失败 (${response.status})`);
    }

    let jobs: StatusJob[];
    try {
      jobs = (await response.json()) as StatusJob[];
    } catch {
      // 偶发解析失败时跳过本次
      continue;
    }

    if (!Array.isArray(jobs)) continue;

    // 找到目标任务
    const target = jobs.find((j) => j.original_filename === uploadId);
    if (target) {
      if (target.completed && target.image_url) {
        return target;
      }
      // 任务存在但未完成，继续等待
      continue;
    }

    // 目标任务不在队列中（可能已被清理或失败）
    const allCompleted = jobs.every((j) => j.completed);
    if (allCompleted && jobs.length > 0) {
      throw new Error('任务未在服务器队列中找到，请重试');
    }
  }
  throw new Error('AI 推理超时（4 分钟），请重试或换张更小的图片');
}

/** 下载结果图片 */
async function downloadResult(
  imageUrl: string,
  clientId: string
): Promise<{ blob: Blob; width: number; height: number }> {
  // image_url 通常是 https://image-upscaling.net/download_upscaling_data/{filename}
  // 需要附加 client_id 参数并通过代理
  const separator = imageUrl.includes('?') ? '&' : '?';
  const fullUrl = `${imageUrl}${separator}client_id=${encodeURIComponent(clientId)}`;

  const response = await fetch(proxied(fullUrl));
  if (!response.ok) {
    throw new Error(`下载结果失败 (${response.status})`);
  }
  const blob = await response.blob();

  // 读取图片尺寸
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  return { blob, width, height };
}

/** 下载后删除服务器上的图片（保护用户隐私） */
async function deleteAfterDownload(imageUrl: string, clientId: string): Promise<void> {
  try {
    const separator = imageUrl.includes('?') ? '&' : '?';
    const deleteUrl = `${imageUrl}${separator}client_id=${encodeURIComponent(
      clientId
    )}&delete_without_download=`;
    await fetch(proxied(deleteUrl));
  } catch {
    // 删除失败不影响主流程
  }
}

/**
 * 云端 AI 超分辨率放大（image-upscaling.net Real-ESRGAN，完全免费）
 *
 * @throws 网络错误、配额用尽或推理失败时抛出
 */
export async function cloudSuperResolve({
  imageData,
  scale,
  onProgress,
}: CloudSuperResolveOptions): Promise<CloudSuperResolveResult> {
  onProgress?.({ progress: 5, stage: '准备图片' });
  const clientId = getClientId();
  const imageBlob = await imageDataToPngBlob(imageData);

  onProgress?.({ progress: 15, stage: '上传到云端 AI' });
  const uploadId = await uploadImage(clientId, imageBlob, scale, DEFAULT_MODEL);

  onProgress?.({ progress: 20, stage: 'AI 推理中' });
  const job = await pollStatus(clientId, uploadId, onProgress);

  onProgress?.({ progress: 92, stage: '下载结果' });
  const { blob, width, height } = await downloadResult(job.image_url, clientId);

  // 异步删除服务器数据，不阻塞返回
  void deleteAfterDownload(job.image_url, clientId);

  onProgress?.({ progress: 100, stage: '完成' });

  return {
    blob,
    url: URL.createObjectURL(blob),
    width,
    height,
  };
}
