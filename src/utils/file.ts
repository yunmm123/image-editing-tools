// 文件处理工具：批量、ZIP 打包

import JSZip from 'jszip';
import { downloadBlob, buildOutputFilename } from './image';

/**
 * 把多个文件打包成 ZIP 并下载
 * @param files 文件名 -> Blob 映射
 * @param zipName ZIP 文件名
 */
export async function downloadAsZip(
  files: { name: string; blob: Blob }[],
  zipName: string
): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.blob);
  }
  const content = await zip.generateAsync({ type: 'blob' });
  downloadBlob(content, zipName);
}

/**
 * 批量处理工具：把多个输入文件交给 processor 处理并打包下载
 */
export async function batchProcessAndZip(
  files: File[],
  processor: (file: File, index: number) => Promise<{ blob: Blob; ext: string; suffix?: string }>,
  zipName: string
): Promise<void> {
  const outputs: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const { blob, ext, suffix = 'out' } = await processor(file, i);
      const name = buildOutputFilename(file.name, suffix, ext);
      outputs.push({ name, blob });
    } catch (err) {
      // 跳过单个失败文件，继续处理其余
      console.error(`文件 ${file.name} 处理失败:`, err);
    }
  }
  if (outputs.length === 0) {
    throw new Error('没有可导出的文件');
  }
  await downloadAsZip(outputs, zipName);
}

/**
 * 读取 File 为 ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}
