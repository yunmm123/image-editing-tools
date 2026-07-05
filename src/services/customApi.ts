// 自定义模型 API 服务：支持用户配置外部 AI 图像处理 API
// 适用于老照片修复、AI 放大等需要外部模型能力的场景
//
// 支持三种响应格式：
// - binary：HTTP 响应体直接是图片二进制
// - base64-json：JSON 响应，图片以 base64 字符串返回
// - json-url：JSON 响应，图片以 URL 形式返回

import type { CustomApiConfig, ApiPreset } from '../types';

const STORAGE_KEY = 'pic-better-custom-api';

/** 默认配置（空配置，需要用户填写） */
export const DEFAULT_API_CONFIG: CustomApiConfig = {
  url: '',
  apiKey: '',
  responseFormat: 'binary',
  imagePath: 'result',
  useDataUri: true,
};

/** 预设 API 模板，方便用户快速配置 */
export const API_PRESETS: ApiPreset[] = [
  {
    name: '自定义',
    description: '手动填写所有字段',
    config: {},
  },
  {
    name: 'GFPGAN (面部修复)',
    description: '适用于人脸老照片修复，响应为二进制图片',
    config: {
      url: '',
      responseFormat: 'binary',
      imagePath: 'result',
      useDataUri: true,
    },
  },
  {
    name: 'Real-ESRGAN (放大+修复)',
    description: '适用于老照片修复+放大，响应为 JSON 含 base64',
    config: {
      url: '',
      responseFormat: 'base64-json',
      imagePath: 'output',
      useDataUri: true,
    },
  },
  {
    name: 'Replicate 代理',
    description: '适用于自建 Replicate 代理服务，响应为 JSON 含图片 URL',
    config: {
      url: '',
      responseFormat: 'json-url',
      imagePath: 'output_url',
      useDataUri: true,
    },
  },
];

/** 从 localStorage 加载 API 配置 */
export function loadApiConfig(): CustomApiConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_API_CONFIG, ...parsed };
    }
  } catch {
    /* 忽略解析错误 */
  }
  return { ...DEFAULT_API_CONFIG };
}

/** 保存 API 配置到 localStorage */
export function saveApiConfig(config: CustomApiConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** 校验 API 配置是否可用 */
export function validateApiConfig(config: CustomApiConfig): string | null {
  if (!config.url) return '请填写 API 地址';
  try {
    // eslint-disable-next-line no-new
    new URL(config.url);
  } catch {
    return 'API 地址格式不正确';
  }
  if (config.responseFormat !== 'binary' && !config.imagePath) {
    return 'JSON 响应格式需要填写图片字段路径';
  }
  return null;
}

/** 将 Blob 转为 base64 字符串 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result 格式为 "data:image/png;base64,xxxx"，去掉前缀
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('图片转 base64 失败'));
    reader.readAsDataURL(blob);
  });
}

/** 从嵌套对象中按路径取值，如 getPath(obj, "data.output") => obj.data.output */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPath(obj: any, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    // 支持数组索引，如 "data.0.url"
    if (/^\d+$/.test(key) && Array.isArray(acc)) {
      return acc[parseInt(key, 10)];
    }
    return acc[key];
  }, obj);
}

/** 将 base64 字符串转为 Blob */
function base64ToBlob(base64: string): Blob {
  // 处理可能带 data URI 前缀的情况
  const pure = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteString = atob(pure);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  // 默认用 image/png，大部分 API 返回 png 或 jpeg
  return new Blob([bytes], { type: 'image/png' });
}

/**
 * 调用自定义 API 处理图片
 * @param imageBlob 输入图片 Blob
 * @param config API 配置
 * @returns 处理后的图片 Blob
 */
export async function callCustomApi(
  imageBlob: Blob,
  config: CustomApiConfig
): Promise<Blob> {
  const validationError = validateApiConfig(config);
  if (validationError) {
    throw new Error(validationError);
  }

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // 构建 base64 图片数据
  const base64 = await blobToBase64(imageBlob);
  const imageData = config.useDataUri
    ? `data:image/png;base64,${base64}`
    : base64;

  // 发送请求
  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image: imageData }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `API 返回错误 ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`
    );
  }

  // 根据响应格式解析结果
  if (config.responseFormat === 'binary') {
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      throw new Error('API 返回的不是图片数据');
    }
    return blob;
  }

  const json = await response.json();

  if (config.responseFormat === 'base64-json') {
    const base64Data = getPath(json, config.imagePath);
    if (!base64Data) {
      throw new Error(`API 响应中未找到字段: ${config.imagePath}`);
    }
    return base64ToBlob(String(base64Data));
  }

  if (config.responseFormat === 'json-url') {
    const url = getPath(json, config.imagePath);
    if (!url) {
      throw new Error(`API 响应中未找到字段: ${config.imagePath}`);
    }
    const imgResp = await fetch(String(url));
    if (!imgResp.ok) {
      throw new Error(`下载结果图片失败: ${imgResp.status}`);
    }
    return await imgResp.blob();
  }

  throw new Error(`未知的响应格式: ${config.responseFormat}`);
}
