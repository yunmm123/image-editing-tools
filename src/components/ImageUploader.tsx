import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';
import { UploadCloud, ImageIcon } from 'lucide-react';
import { isSupportedImage } from '../utils/image';

interface ImageUploaderProps {
  /** 单文件或多文件 */
  multiple?: boolean;
  /** 上传后的回调 */
  onFiles: (files: File[]) => void;
  /** 提示文字 */
  hint?: string;
}

/**
 * 通用拖拽上传组件
 * - 支持点击选择 / 拖拽放入
 * - 校验图片格式
 */
export default function ImageUploader({ multiple = false, onFiles, hint }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const invalid = files.find((f) => !isSupportedImage(f));
      if (invalid) {
        setError('请上传 PNG / JPEG / WebP / BMP 格式图片');
        return;
      }
      setError(null);
      onFiles(multiple ? files : [files[0]]);
    },
    [multiple, onFiles]
  );

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // 允许重复选择同一文件
    e.target.value = '';
  };

  return (
    <div className="w-full">
      <label
        htmlFor="image-uploader-input"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
          isDragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
            : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800/50'
        }`}
      >
        <div className="mb-3 rounded-full bg-brand-100 p-3 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          {multiple ? <ImageIcon size={24} /> : <UploadCloud size={24} />}
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {isDragging ? '松开鼠标即可上传' : '点击选择或拖拽图片到此处'}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {hint ?? '支持 PNG / JPEG / WebP / BMP · 处理全程在本地完成'}
        </p>
        <input
          id="image-uploader-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp"
          multiple={multiple}
          onChange={onChange}
          className="hidden"
        />
      </label>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
