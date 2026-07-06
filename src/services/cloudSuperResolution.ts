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
  /**
   * 人脸增强：启用 GFPGAN 人脸修复（仅 plus/general 模型支持）。
   * 对老照片、模糊人像效果显著，几乎不增加耗时。
   */
  faceEnhance?: boolean;
  /**
   * 模糊修复模式：改用 diffuser 扩散模型 + scale=1（不放大），
   * 通过 AI 重新生成清晰细节，专门修复模糊/老照片。
   * 启用后 scale 参数被忽略，model 固定为 diffuser。
   */
  restore?: boolean;
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
  model: string,
  options?: {
    /** 人脸增强（fx）：仅 plus/general 模型支持 */
    faceEnhance?: boolean;
    /** diffuser 模型的文本提示词 */
    prompt?: string;
    /** diffuser 模型的创造力（0-1，越低越接近原图） */
    creativity?: number;
  }
): Promise<string> {
  const formData = new FormData();
  formData.append('image', imageBlob, 'upload.png');
  formData.append('scale', String(scale));
  formData.append('model', model);
  // 人脸增强：fx 为空字符串即表示开启（参考官方 Python SDK）
  if (options?.faceEnhance) {
    formData.append('fx', '');
  }
  // diffuser 模型参数
  if (options?.prompt !== undefined) {
    formData.append('prompt', options.prompt);
  }
  if (options?.creativity !== undefined) {
    formData.append('creativity', String(options.creativity));
  }

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
  onProgress?: (info: { progress: number; stage: string }) => void,
  maxAttempts = 120 // 默认最多 4 分钟（每 2s 一次）
): Promise<StatusJob> {
  const statusUrl = proxied(
    `${API_BASE}/upscaling_get_status_v2?client_id=${encodeURIComponent(clientId)}`
  );

  const MAX_ATTEMPTS = maxAttempts;
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
  throw new Error(`AI 推理超时（${Math.round((MAX_ATTEMPTS * 2) / 60)} 分钟），请重试或换张更小的图片`);
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

/** 模糊修复模式的提示词：引导 AI 生成清晰、高细节结果 */
const RESTORE_PROMPT = 'highly detailed, sharp focus, crystal clear, high quality, professional photograph';
/** 模糊修复模式的创造力：保持低值以保留原图结构，仅增强细节 */
const RESTORE_CREATIVITY = 0.1;

/**
 * 云端 AI 超分辨率放大 / 模糊修复（image-upscaling.net，完全免费）
 *
 * 三种用法：
 *   1. 普通放大：scale=2/4, model=plus（默认）
 *   2. 放大 + 人脸增强：faceEnhance=true（GFPGAN 修复人脸，适合老照片人像）
 *   3. 模糊修复：restore=true（diffuser 扩散模型，scale=1，AI 重绘细节，不放大）
 *
 * @throws 网络错误、配额用尽或推理失败时抛出
 */
export async function cloudSuperResolve({
  imageData,
  scale,
  faceEnhance,
  restore,
  onProgress,
}: CloudSuperResolveOptions): Promise<CloudSuperResolveResult> {
  onProgress?.({ progress: 5, stage: restore ? '准备模糊修复' : '准备图片' });
  const clientId = getClientId();
  const imageBlob = await imageDataToPngBlob(imageData);

  // 模糊修复模式：使用 diffuser-lite 模型（免费，扩散模型重绘细节）
  // 注意：diffuser 是 premium 模型需要账户余额，diffuser-lite 免费但限制 4MP
  // 普通模式：使用 plus 模型，可选人脸增强
  const model = restore ? 'diffuser-lite' : DEFAULT_MODEL;
  const actualScale = restore ? 1 : scale;
  const uploadOptions = restore
    ? { prompt: RESTORE_PROMPT, creativity: RESTORE_CREATIVITY }
    : { faceEnhance };

  onProgress?.({
    progress: 15,
    stage: restore ? '上传到云端 AI（扩散模型）' : '上传到云端 AI',
  });
  const uploadId = await uploadImage(clientId, imageBlob, actualScale, model, uploadOptions);

  onProgress?.({
    progress: 20,
    stage: restore ? 'AI 扩散修复中（较慢，约 30-90s）' : 'AI 推理中',
  });
  // 模糊修复较慢，放宽超时到 8 分钟
  const job = restore
    ? await pollStatus(clientId, uploadId, onProgress, 240)
    : await pollStatus(clientId, uploadId, onProgress);

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
