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
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // Add a timeout to prevent hanging
    const timeout = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error("Image load timeout"));
    }, 15000);

    img.onload = () => {
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

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(url);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      // Use lower quality for better stability and faster uploads
      resolve(canvas.toDataURL('image/jpeg', 0.7)); 
    };
    img.onerror = (e) => {
      clearTimeout(timeout);
      reject(e);
    };
    img.src = url;
  });
}
