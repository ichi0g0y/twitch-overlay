import { DEFAULT_COLOR, type RgbColor } from './constants';

export const extractDominantColor = async (imageUrl: string): Promise<RgbColor> => {
  console.log('🎨 Extracting color from artwork:', imageUrl);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return DEFAULT_COLOR;
    }

    const sampleSize = 10;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const data = imageData.data;

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }

    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);

    const brightness = (r + g + b) / 3;
    if (brightness < 80) {
      const factor = 120 / brightness;
      r = Math.min(255, Math.floor(r * factor));
      g = Math.min(255, Math.floor(g * factor));
      b = Math.min(255, Math.floor(b * factor));
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;

    if (saturation < 30) {
      return DEFAULT_COLOR;
    }

    return { r, g, b };
  } catch (error) {
    console.log('Failed to extract color from artwork:', error);
    return DEFAULT_COLOR;
  }
};
