// 全局 TypeScript 类型定义

/** 支持的图片输出格式 */
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'bmp';

/** AI 推理后端类型 */
export type InferenceBackend = 'webgpu' | 'wasm' | 'cpu';

/** 模型加载状态 */
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 处理任务进度回调数据 */
export interface ProgressInfo {
  /** 进度百分比 0-100 */
  progress: number;
  /** 当前阶段描述 */
  stage: string;
  /** 已加载字节数（模型下载时） */
  loaded?: number;
  /** 总字节数（模型下载时） */
  total?: number;
  /** 当前文件名 */
  file?: string;
}

/** Web Worker 推理请求消息 */
export interface WorkerRequest {
  id: string;
  type: 'remove-bg' | 'upscale';
  payload: unknown;
}

/** Web Worker 推理响应消息 */
export interface WorkerResponse {
  id: string;
  type: 'progress' | 'result' | 'error';
  payload: unknown;
}

/** 工具卡片描述 */
export interface ToolMeta {
  path: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
}

/** 证件照尺寸预设 */
export interface IdPhotoSize {
  name: string;
  width: number;
  height: number;
}

/** 预设背景色 */
export interface PresetColor {
  name: string;
  value: string;
}

/** 处理后的图片结果 */
export interface ProcessedImage {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  size: number;
}
