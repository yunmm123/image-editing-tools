// 应用设置服务：管理各 AI 功能的「免费 / 自定义API」选择
//
// 设计：
//   - 每个 AI 功能（放大修复、抠图）独立配置 provider
//   - provider = 'free' 使用自带免费方案，'custom' 使用用户自定义 API
//   - 自定义 API 配置存在 localStorage，包含 url / apiKey / 响应类型
//
// 自定义 API 契约（通用 HTTP 图像处理接口）：
//   请求：
//     POST {url}
//     Headers: Authorization: Bearer {apiKey}（apiKey 非空时）
//     Body: multipart/form-data
//       - image: PNG 图片文件
//       - scale: "2" | "4"（仅放大功能）
//       - mode: "upscale" | "restore"（仅放大功能）
//       - face_enhance: "true" | "false"（仅放大功能）
//   响应（两种格式二选一，由 responseType 指定）：
//     - "blob": 直接返回图片二进制（content-type: image/*）
//     - "json-url": 返回 JSON {"url": "https://..."}，客户端再下载该 URL

export type AiProvider = 'free' | 'custom';
export type ResponseType = 'blob' | 'json-url';

/** 单个自定义 API 配置 */
export interface CustomApiConfig {
  /** API 端点 URL */
  url: string;
  /** API Key（可选，作为 Bearer token 发送） */
  apiKey: string;
  /** 响应类型：blob=直接返回图片，json-url=返回JSON含下载URL */
  responseType: ResponseType;
}

/** 各 AI 功能的设置 */
export interface AppSettings {
  /** 图片放大 / 模糊修复 */
  upscale: {
    provider: AiProvider;
    customApi: CustomApiConfig;
  };
  /** AI 抠图 */
  removeBg: {
    provider: AiProvider;
    customApi: CustomApiConfig;
  };
}

const STORAGE_KEY = 'pic-better-settings';

const DEFAULT_SETTINGS: AppSettings = {
  upscale: {
    provider: 'free',
    customApi: { url: '', apiKey: '', responseType: 'blob' },
  },
  removeBg: {
    provider: 'free',
    customApi: { url: '', apiKey: '', responseType: 'blob' },
  },
};

/** 读取设置 */
export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // 合并默认值，确保新增字段有默认值
    return {
      upscale: { ...DEFAULT_SETTINGS.upscale, ...parsed.upscale,
        customApi: { ...DEFAULT_SETTINGS.upscale.customApi, ...(parsed.upscale?.customApi ?? {}) } },
      removeBg: { ...DEFAULT_SETTINGS.removeBg, ...parsed.removeBg,
        customApi: { ...DEFAULT_SETTINGS.removeBg.customApi, ...(parsed.removeBg?.customApi ?? {}) } },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 保存设置 */
export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 检查某功能是否启用了自定义 API（url 非空才算有效） */
export function isCustomApiEnabled(feature: 'upscale' | 'removeBg'): boolean {
  const settings = getSettings();
  return settings[feature].provider === 'custom' && settings[feature].customApi.url.trim() !== '';
}

/** 获取某功能的自定义 API 配置 */
export function getCustomApiConfig(feature: 'upscale' | 'removeBg'): CustomApiConfig | null {
  const settings = getSettings();
  if (settings[feature].provider !== 'custom') return null;
  if (settings[feature].customApi.url.trim() === '') return null;
  return settings[feature].customApi;
}

/**
 * 校验自定义 API 配置是否合法
 * @returns 错误信息数组，空数组表示通过
 */
export function validateCustomApiConfig(config: CustomApiConfig): string[] {
  const errors: string[] = [];
  const url = config.url.trim();

  // URL 必填
  if (!url) {
    errors.push('API 地址不能为空');
    return errors;
  }

  // 必须是合法 URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    errors.push('API 地址格式不正确，需以 http:// 或 https:// 开头');
    return errors;
  }

  // 协议必须是 http 或 https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    errors.push('API 地址协议必须是 http:// 或 https://');
  }

  // 必须有 host
  if (!parsed.hostname) {
    errors.push('API 地址缺少域名');
  }

  // host 不能是纯数字（防止用户输入端口号等无意义内容）
  if (parsed.hostname && /^\d+$/.test(parsed.hostname)) {
    errors.push('API 地址域名不能是纯数字');
  }

  // host 至少包含一个点（如 example.com）或为 localhost
  if (parsed.hostname && parsed.hostname !== 'localhost' && !parsed.hostname.includes('.')) {
    errors.push('API 地址域名格式不正确（应类似 example.com）');
  }

  // API Key 长度限制（防止误粘贴大段文本）
  if (config.apiKey.length > 500) {
    errors.push('API Key 过长（超过 500 字符），请检查');
  }

  return errors;
}
