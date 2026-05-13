import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, X, Settings, Download, Trash2, Crop as CropIcon, CheckCircle2, AlertCircle, Loader2, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import { ImageItemData, GlobalSettings } from './types';
import { CropModal } from './components/CropModal';
import { processImage } from './utils/imageProcessing';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function App() {
  const [images, setImages] = useState<ImageItemData[]>([]);
  const [settings, setSettings] = useState<GlobalSettings>({
    format: 'image/webp',
    quality: 80,
    useTargetSize: false,
    targetSizeKB: 500,
  });
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [estimationTrigger, setEstimationTrigger] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imagesHash = images.map(i => i.id + (i.croppedBlob ? 'c' : 'u')).join(',');

  useEffect(() => {
    const timer = setTimeout(() => {
      setEstimationTrigger(prev => prev + 1);
    }, 500);
    return () => clearTimeout(timer);
  }, [settings, imagesHash]);

  useEffect(() => {
    let isCancelled = false;

    const runEstimations = async () => {
      const imagesToEstimate = images.filter(i => i.status === 'idle');
      if (imagesToEstimate.length === 0) return;

      setImages(prev => prev.map(img => 
        img.status === 'idle' ? { ...img, isEstimating: true } : img
      ));

      for (const img of imagesToEstimate) {
        if (isCancelled) break;
        try {
          const sourceBlob = img.croppedBlob || img.file;
          const estimatedBlob = await processImage(
            sourceBlob,
            settings.format,
            settings.quality,
            settings.useTargetSize,
            settings.targetSizeKB
          );
          
          if (!isCancelled) {
            setImages(prev => prev.map(p => 
              p.id === img.id 
                ? { ...p, estimatedSize: estimatedBlob.size, isEstimating: false } 
                : p
            ));
          }
        } catch (e) {
          if (!isCancelled) {
            setImages(prev => prev.map(p => 
              p.id === img.id 
                ? { ...p, isEstimating: false } 
                : p
            ));
          }
        }
      }
    };

    runEstimations();

    return () => {
      isCancelled = true;
    };
  }, [estimationTrigger]);

  const handleFiles = (files: FileList | File[]) => {
    const newImages: ImageItemData[] = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'idle',
      }));
    setImages((prev) => [...prev, ...newImages]);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const removeImage = (id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const renameImage = (id: string, newName: string) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, customName: newName } : img))
    );
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
  };

  const handleSaveCrop = (id: string, crop: any, croppedBlob: Blob) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? {
              ...img,
              crop,
              croppedBlob,
              previewUrl: URL.createObjectURL(croppedBlob), // Update preview
              status: 'idle',
              processedBlob: undefined,
            }
          : img
      )
    );
    setCroppingImageId(null);
  };

  const processBatch = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);

    const updatedImages = [...images];

    for (let i = 0; i < updatedImages.length; i++) {
      const img = updatedImages[i];
      setImages((prev) =>
        prev.map((p) => (p.id === img.id ? { ...p, status: 'processing' } : p))
      );

      try {
        const sourceBlob = img.croppedBlob || img.file;
        const processedBlob = await processImage(
          sourceBlob,
          settings.format,
          settings.quality,
          settings.useTargetSize,
          settings.targetSizeKB
        );

        setImages((prev) =>
          prev.map((p) =>
            p.id === img.id
              ? { ...p, status: 'done', processedBlob }
              : p
          )
        );
      } catch (error) {
        console.error(`Failed to process ${img.file.name}`, error);
        setImages((prev) =>
          prev.map((p) =>
            p.id === img.id
              ? { ...p, status: 'error', error: 'Processing failed' }
              : p
          )
        );
      }
    }

    setIsProcessing(false);
  };

  const downloadSingleImage = (img: ImageItemData) => {
    if (!img.processedBlob) return;
    const ext = settings.format.split('/')[1];
    const originalName = img.file.name.split('.')[0];
    const fileName = img.customName || `${originalName}-optimized`;
    saveAs(img.processedBlob, `${fileName}.${ext}`);
  };

  const downloadAll = async () => {
    const processedImages = images.filter((img) => img.status === 'done' && img.processedBlob);
    if (processedImages.length === 0) return;

    if (processedImages.length === 1) {
      downloadSingleImage(processedImages[0]);
      return;
    }

    // Zip download
    const zip = new JSZip();
    processedImages.forEach((img) => {
      const ext = settings.format.split('/')[1];
      const originalName = img.file.name.split('.')[0];
      const fileName = img.customName || `${originalName}-optimized`;
      zip.file(`${fileName}.${ext}`, img.processedBlob!);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'optimized-images.zip');
  };

  const croppingImage = images.find((i) => i.id === croppingImageId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/50 p-6 flex flex-col gap-8 h-auto md:h-screen overflow-y-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Settings className="text-emerald-500" size={24} />
            Batch Optimize
          </h1>
          <p className="text-zinc-400 text-sm mt-2">
            Process, crop, and compress multiple images at once.
          </p>
        </div>

        <div className="space-y-6 flex-1">
          {/* Format */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-300">Export Format</label>
            <div className="grid grid-cols-3 gap-2">
              {['image/webp', 'image/jpeg', 'image/png'].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setSettings({ ...settings, format: fmt as any })}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                    settings.format === fmt
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {fmt.split('/')[1].toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Target Size Toggle */}
          <div className="space-y-3 pt-4 border-t border-zinc-800/50">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
                Target File Size
              </span>
              <div
                className={`w-10 h-5 rounded-full p-1 transition-colors ${
                  settings.useTargetSize ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
                onClick={() => setSettings({ ...settings, useTargetSize: !settings.useTargetSize })}
              >
                <div
                  className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${
                    settings.useTargetSize ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </div>
            </label>
            <p className="text-xs text-zinc-500">
              Automatically find the best quality to hit a specific file size.
            </p>
            
            <AnimatePresence>
              {settings.useTargetSize && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 flex items-center gap-3">
                    <input
                      type="number"
                      value={settings.targetSizeKB}
                      onChange={(e) =>
                        setSettings({ ...settings, targetSizeKB: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                      min="1"
                    />
                    <span className="text-sm text-zinc-400 font-medium">KB</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quality Slider */}
          <AnimatePresence>
            {!settings.useTargetSize && settings.format !== 'image/png' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 pt-4 border-t border-zinc-800/50 overflow-hidden"
              >
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-zinc-300">Quality</label>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                    {settings.quality}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={settings.quality}
                  onChange={(e) => setSettings({ ...settings, quality: Number(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-3 pt-6 border-t border-zinc-800">
          <button
            onClick={processBatch}
            disabled={images.length === 0 || isProcessing}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                Process {images.length > 0 ? `${images.length} Images` : 'Batch'}
              </>
            )}
          </button>

          {images.some((img) => img.status === 'done') && (
            <button
              onClick={downloadAll}
              className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Download size={18} />
              Download All
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 flex flex-col gap-6 h-screen overflow-hidden">
        {/* Dropzone */}
        <div
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-zinc-800 rounded-2xl p-8 flex flex-col items-center justify-center text-zinc-400 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-emerald-400 transition-all cursor-pointer bg-zinc-900/20 group shrink-0"
        >
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <Upload size={28} className="text-zinc-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <p className="font-medium text-zinc-300 group-hover:text-emerald-300 transition-colors">
            Click or drag images here
          </p>
          <p className="text-sm mt-1 opacity-70">Supports JPG, PNG, WebP</p>
        </div>

        {/* Image List */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-20">
          <div className="flex justify-between items-center mb-4 sticky top-0 bg-zinc-950/80 backdrop-blur-md py-2 z-10">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
              Queue ({images.length})
            </h2>
            {images.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-3 py-1.5 rounded-lg hover:bg-red-400/10 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          <AnimatePresence>
            {images.map((img) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3 flex items-center gap-4 group hover:border-zinc-700 transition-colors"
              >
                {/* Preview */}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-black shrink-0 relative">
                  <img
                    src={img.previewUrl}
                    alt={img.file.name}
                    className="w-full h-full object-cover"
                  />
                  {img.status === 'processing' && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 size={20} className="animate-spin text-emerald-500" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 group/name">
                    <input
                      type="text"
                      value={img.customName ?? img.file.name.split('.')[0]}
                      onChange={(e) => renameImage(img.id, e.target.value)}
                      className="text-sm font-medium text-zinc-200 bg-transparent border-none p-0 focus:ring-0 focus:outline-none w-full truncate border-b border-transparent hover:border-zinc-700 focus:border-emerald-500 transition-colors"
                      placeholder="Enter filename..."
                    />
                    <Edit3 size={12} className="text-zinc-600 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span>{formatBytes(img.file.size)}</span>
                    
                    {img.status === 'idle' && img.isEstimating && (
                      <>
                        <span className="text-zinc-700">-&gt;</span>
                        <span className="text-zinc-400 flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> estimating...
                        </span>
                      </>
                    )}
                    
                    {img.status === 'idle' && !img.isEstimating && img.estimatedSize !== undefined && (
                      <>
                        <span className="text-zinc-700">-&gt;</span>
                        <span className="text-blue-400 font-medium" title="Estimated output size">
                          ~{formatBytes(img.estimatedSize)}
                        </span>
                      </>
                    )}

                    {img.status === 'done' && img.processedBlob && (
                      <>
                        <span className="text-zinc-700">-&gt;</span>
                        <span className="text-emerald-400 font-medium">
                          {formatBytes(img.processedBlob.size)}
                        </span>
                        <span className="text-zinc-700">-&gt;</span>
                        <span className="text-emerald-500/80">
                          -{Math.round((1 - img.processedBlob.size / img.file.size) * 100)}%
                        </span>
                      </>
                    )}
                    {img.status === 'error' && (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertCircle size={12} /> {img.error}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {img.status !== 'processing' && (
                    <>
                      {img.status === 'done' && (
                        <button
                          onClick={() => downloadSingleImage(img)}
                          className="p-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 rounded-lg transition-colors"
                          title="Download this image"
                        >
                          <Download size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => setCroppingImageId(img.id)}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Crop Image"
                      >
                        <CropIcon size={18} />
                      </button>
                      <button
                        onClick={() => removeImage(img.id)}
                        className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                  {img.status === 'done' && (
                    <div className="w-9 h-9 flex items-center justify-center bg-emerald-500/10 text-emerald-500 rounded-lg">
                      <CheckCircle2 size={20} />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {images.length === 0 && (
              <div className="text-center py-12 text-zinc-600 flex flex-col items-center">
                <ImageIcon size={48} className="mb-3 opacity-20" />
                <p>No images in queue</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Crop Modal */}
      {croppingImage && (
        <CropModal
          imageUrl={croppingImage.previewUrl}
          initialCrop={croppingImage.crop}
          onClose={() => setCroppingImageId(null)}
          onSave={(crop, blob) => handleSaveCrop(croppingImage.id, crop, blob)}
        />
      )}
    </div>
  );
}
