import { Crop } from 'react-image-crop';

export const getCroppedImg = async (
  imageSrc: string,
  pixelCrop: Crop
): Promise<Blob> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas is empty'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
};

export const processImage = async (
  sourceBlob: Blob,
  format: string,
  quality: number,
  useTargetSize: boolean,
  targetSizeKB: number
): Promise<Blob> => {
  const image = new Image();
  image.src = URL.createObjectURL(sourceBlob);
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  ctx.drawImage(image, 0, 0);
  URL.revokeObjectURL(image.src);

  if (format === 'image/png') {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), format));
  }

  if (!useTargetSize) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), format, quality / 100));
  }

  const targetSizeBytes = targetSizeKB * 1024;
  const tolerance = 6 * 1024; // 6 KB tolerance

  const getBlob = async (scale: number, q: number): Promise<Blob> => {
    if (scale === 1) {
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), format, q));
    }
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = Math.max(1, Math.floor(canvas.width * scale));
    scaledCanvas.height = Math.max(1, Math.floor(canvas.height * scale));
    const sCtx = scaledCanvas.getContext('2d')!;
    if (format === 'image/jpeg') {
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
    }
    sCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
    return new Promise((resolve) => scaledCanvas.toBlob((b) => resolve(b!), format, q));
  };

  let low = 0.0;
  let high = 1.0;
  let bestBlob: Blob | null = null;
  let bestDiff = Infinity;

  for (let i = 0; i < 10; i++) {
    const mid = (low + high) / 2;
    const blob = await getBlob(1, mid);
    const size = blob.size;

    if (size <= targetSizeBytes + tolerance) {
      const diff = Math.abs(targetSizeBytes - size);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestBlob = blob;
      }
    }

    if (size > targetSizeBytes) {
      high = mid;
    } else {
      low = mid;
    }
  }

  // If even at lowest quality it's too big, scale down
  if (!bestBlob || bestBlob.size > targetSizeBytes + tolerance) {
    let scaleLow = 0.01;
    let scaleHigh = 1.0;
    for (let i = 0; i < 10; i++) {
      const scaleMid = (scaleLow + scaleHigh) / 2;
      const blob = await getBlob(scaleMid, 0.1); // Use low quality for scaling to preserve size
      const size = blob.size;
      
      if (size <= targetSizeBytes + tolerance) {
        const diff = Math.abs(targetSizeBytes - size);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestBlob = blob;
        }
        scaleLow = scaleMid;
      } else {
        scaleHigh = scaleMid;
      }
    }
  }

  if (!bestBlob) {
    bestBlob = await getBlob(1, 0.0);
  }

  return bestBlob;
};
