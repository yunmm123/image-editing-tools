import { useCallback, useRef, useState } from 'react';
import { InferenceBackend, ModelStatus, ProgressInfo, WorkerRequest, WorkerResponse } from '../types';

// 全局唯一的 worker 实例（避免重复创建）
let workerInstance: Worker | null = null;
let requestCounter = 0;

/** 获取（或创建）推理 Worker 实例 */
function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return workerInstance;
}

/** 检测当前可用的推理后端 */
export function detectBackend(): InferenceBackend {
  if (typeof navigator !== 'undefined') {
    // navigator.gpu 类型在某些环境不存在，用类型断言绕过
    if ((navigator as Navigator & { gpu?: unknown }).gpu) return 'webgpu';
  }
  // transformers.js v4 在没有 WebGPU 时使用 WASM（CPU）
  return 'wasm';
}

interface UseModelLoaderResult {
  status: ModelStatus;
  backend: InferenceBackend;
  progress: ProgressInfo | null;
  error: string | null;
  /** 调用 worker 执行一次推理 */
  runInference: <T = unknown>(
    type: 'remove-bg',
    payload: unknown,
    onProgress?: (info: ProgressInfo) => void
  ) => Promise<T>;
  /** 重置状态 */
  reset: () => void;
}

/**
 * 通用模型加载 hook：管理 worker 通信、进度、错误
 */
export function useModelLoader(): UseModelLoaderResult {
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backendRef = useRef<InferenceBackend>(detectBackend());

  const runInference = useCallback(
    async <T = unknown,>(
      type: 'remove-bg',
      payload: unknown,
      onProgress?: (info: ProgressInfo) => void
    ): Promise<T> => {
      setStatus('loading');
      setError(null);
      setProgress({ progress: 0, stage: '准备中' });

      const worker = getWorker();
      const id = `req-${++requestCounter}`;

      return new Promise<T>((resolve, reject) => {
        const handler = (event: MessageEvent<WorkerResponse>) => {
          const data = event.data;
          if (data.id !== id) return;
          if (data.type === 'progress') {
            const info = data.payload as ProgressInfo;
            setProgress(info);
            onProgress?.(info);
          } else if (data.type === 'result') {
            worker.removeEventListener('message', handler);
            setStatus('ready');
            setProgress({ progress: 100, stage: '完成' });
            resolve(data.payload as T);
          } else if (data.type === 'error') {
            worker.removeEventListener('message', handler);
            setStatus('error');
            setError(data.payload as string);
            reject(new Error(data.payload as string));
          }
        };
        worker.addEventListener('message', handler);

        const request: WorkerRequest = { id, type, payload };
        worker.postMessage(request);
      });
    },
    []
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(null);
    setError(null);
  }, []);

  return {
    status,
    backend: backendRef.current,
    progress,
    error,
    runInference,
    reset,
  };
}
