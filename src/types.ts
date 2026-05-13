import { Crop } from 'react-image-crop';

export interface ImageItemData {
  id: string;
  file: File;
  previewUrl: string;
  crop?: Crop;
  croppedBlob?: Blob;
  status: 'idle' | 'processing' | 'done' | 'error';
  processedBlob?: Blob;
  customName?: string;
  error?: string;
  estimatedSize?: number;
  isEstimating?: boolean;
}

export interface GlobalSettings {
  format: 'image/jpeg' | 'image/webp' | 'image/png';
  quality: number; // 1-100
  useTargetSize: boolean;
  targetSizeKB: number;
}
