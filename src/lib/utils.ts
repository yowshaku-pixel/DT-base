import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resizes an image to a maximum dimension while maintaining aspect ratio.
 * This significantly speeds up AI processing and reduces upload time.
 */
export async function resizeImage(url: string, maxDimension: number = 1200): Promise<string> {
  console.log(`[DEBUG] resizeImage started for ${url.substring(0, 50)}...`);
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // Add a timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.error(`[DEBUG] resizeImage timeout for ${url.substring(0, 50)}...`);
      img.onload = null;
      img.onerror = null;
      reject(new Error("Image load timeout"));
    }, 15000);

    img.onload = () => {
      console.log(`[DEBUG] resizeImage: Image loaded, dimensions: ${img.width}x${img.height}`);
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDimension) {
          height *= maxDimension / width;
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width *= maxDimension / height;
          height = maxDimension;
        }
      }

      console.log(`[DEBUG] resizeImage: New dimensions: ${width}x${height}`);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.warn(`[DEBUG] resizeImage: Could not get canvas context`);
        resolve(url);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      // Use higher quality for better OCR results on handwriting
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      console.log(`[DEBUG] resizeImage: Success, dataUrl length: ${dataUrl.length}`);
      resolve(dataUrl); 
    };
    img.onerror = (e) => {
      console.error(`[DEBUG] resizeImage: Image error`, e);
      clearTimeout(timeout);
      reject(e);
    };
    img.src = url;
  });
}
