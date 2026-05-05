import React, { useState, useRef } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check } from 'lucide-react';
import { getCroppedImg } from '../utils/imageProcessing';

interface CropModalProps {
  imageUrl: string;
  initialCrop?: Crop;
  onClose: () => void;
  onSave: (crop: Crop, croppedBlob: Blob) => void;
}

export const CropModal: React.FC<CropModalProps> = ({ imageUrl, initialCrop, onClose, onSave }) => {
  const [crop, setCrop] = useState<Crop>(
    initialCrop || { unit: '%', width: 50, height: 50, x: 25, y: 25 }
  );
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleSave = async () => {
    if (completedCrop && imgRef.current && completedCrop.width > 0 && completedCrop.height > 0) {
      try {
        const croppedBlob = await getCroppedImg(imageUrl, completedCrop);
        onSave(crop, croppedBlob);
      } catch (e) {
        console.error('Crop failed', e);
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-zinc-800">
        <div className="flex justify-between items-center p-4 border-b border-zinc-800">
          <h3 className="text-lg font-medium text-white">Crop Image</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/50 min-h-[300px]">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            className="max-h-full"
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Crop preview"
              className="max-h-[60vh] object-contain"
            />
          </ReactCrop>
        </div>
        <div className="p-4 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-900">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 transition-colors text-sm"
          >
            <Check size={16} />
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
};
