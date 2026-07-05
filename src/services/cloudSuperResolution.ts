// 云端 AI 超分辨率服务：通过 Replicate API 调用 Real-ESRGAN 模型
//
// 设计思路：
//   Replicate 的 nightmareai/real-esrgan 是业界最成熟的超分模型（16M+ runs），
//   质量远超浏览器本地模型。但 Replicate API 不允许浏览器直接调用（CORS 限制），
//   需要通过 CORS 代理（corsproxy.io）转发请求。
//
// 成本：
//   单次约 $0.0034，新用户送 $0.10 免费额度（约 29 次）
//   Token 仅保存在用户本地 localStorage，不上传到任何服务器
//
// 流程：
//   1. 图片转 base64 data URL
//   2. 通过 CORS 代理 POST 创建 prediction
//   3. 轮询 prediction 状态（每 2 秒）
//   4. status=succeeded 后下载 output URL
//   5. 转为 Blob 返回

interface CloudSuperResolveOptions {
  imageData: ImageData;
  /** 放大倍率：2 或 4 */
  scale: 2 | 4;
  /** Replicate API Token（r8_ 开头） */
  apiToken: string;
  /** 进度回调 */
  onProgress?: (info: { progress: number; stage: string }) => void;
}

interface CloudSuperResolveResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

// nightmareai/real-esrgan 的固定版本 hash
// 这是 Replicate 上最流行的 Real-ESRGAN 模型版本
const MODEL_VERSION = '42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b';

// CORS 代理（Replicate API 不允许浏览器直接调用）
const CORS_PROXY = 'https://corsproxy.io/?url=';

/** 通过 CORS 代理封装 Replicate API URL */
function proxied(url: string): string {
  return CORS_PROXY + encodeURIComponent(url);
}

/** 将 ImageData 转为 PNG data URL（作为 Replicate 输入） */
async function imageDataToDataUrl(imageData: ImageData): Promise<string> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 OffscreenCanvas 2D 上下文');
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('图片转 base64 失败'));
    reader.readAsDataURL(blob);
  });
}

/** 创建 Replicate prediction */
async function createPrediction(
  apiToken: string,
  imageUrl: string,
  scale: number
): Promise<{ id: string; urls: { get: string } }> {
  const response = await fetch(proxied('https://api.replicate.com/v1/predictions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=0', // 立即返回，不等待结果（我们手动轮询）
    },
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: {
        image: imageUrl,
        scale,
        face_enhance: false, // 不做人脸增强，避免改变人脸
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    let msg = `Replicate 创建任务失败 (${response.status})`;
    try {
      const j = JSON.parse(text);
      msg = j.detail || j.error || msg;
      if (response.status === 401) msg = 'API Token 无效，请检查设置';
      if (response.status === 402) msg = '余额不足，请充值或更换 Token';
    } catch {
      if (text) msg += `: ${text.slice(0, 200)}`;
    }
    throw new Error(msg);
  }

  return response.json();
}

/** 轮询 prediction 状态 */
async function pollPrediction(
  apiToken: string,
  getUrl: string,
  onProgress?: (info: { progress: number; stage: string }) => void
): Promise<string> {
  const MAX_ATTEMPTS = 60; // 最多 120 秒
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    onProgress?.({
      progress: Math.min(90, 20 + i * 2),
      stage: `AI 推理中（已等待 ${(i + 1) * 2}s）`,
    });

    const response = await fetch(proxied(getUrl), {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (!response.ok) {
      throw new Error(`查询任务状态失败 (${response.status})`);
    }

    const data = await response.json();
    if (data.status === 'succeeded') {
      const output = data.output;
      if (typeof output === 'string') return output;
      if (Array.isArray(output) && output.length > 0) return output[0];
      throw new Error('任务成功但未返回输出 URL');
    }
    if (data.status === 'failed') {
      throw new Error(`AI 推理失败：${data.error || '未知错误'}`);
    }
    // status === 'starting' 或 'processing'，继续轮询
  }
  throw new Error('AI 推理超时（120s），请重试或换张更小的图片');
}

/** 下载图片 URL 为 Blob */
async function downloadImage(url: string): Promise<{ blob: Blob; width: number; height: number }> {
  // Replicate 输出 URL 在 replicate.delivery 域名，浏览器可直接访问，无需代理
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载结果失败 (${response.status})`);
  const blob = await response.blob();

  // 读取图片尺寸
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  return { blob, width, height };
}

/**
 * 云端 AI 超分辨率放大（Replicate Real-ESRGAN）
 *
 * @throws 如果 API Token 无效、余额不足、网络错误或推理失败
 */
export async function cloudSuperResolve({
  imageData,
  scale,
  apiToken,
  onProgress,
}: CloudSuperResolveOptions): Promise<CloudSuperResolveResult> {
  if (!apiToken) {
    throw new Error('请先在设置中填入 Replicate API Token');
  }
  if (!apiToken.startsWith('r8_')) {
    throw new Error('Token 格式不正确，Replicate Token 应以 r8_ 开头');
  }

  onProgress?.({ progress: 5, stage: '准备图片' });
  const dataUrl = await imageDataToDataUrl(imageData);

  onProgress?.({ progress: 15, stage: '提交到 Replicate' });
  const prediction = await createPrediction(apiToken, dataUrl, scale);

  onProgress?.({ progress: 20, stage: 'AI 推理中' });
  const outputUrl = await pollPrediction(apiToken, prediction.urls.get, onProgress);

  onProgress?.({ progress: 95, stage: '下载结果' });
  const { blob, width, height } = await downloadImage(outputUrl);

  onProgress?.({ progress: 100, stage: '完成' });

  return {
    blob,
    url: URL.createObjectURL(blob),
    width,
    height,
  };
}

/** localStorage 读写 API Token */
const TOKEN_KEY = 'pic-better-replicate-token';

export function getReplicateToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setReplicateToken(token: string): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}
