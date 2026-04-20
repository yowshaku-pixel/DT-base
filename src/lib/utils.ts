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

/**
 * Normalizes a truck plate number by:
 * 1. Removing trailer info (anything after / or -)
 * 2. Removing spaces
 * 3. Converting to lowercase
 */
export function normalizePlate(plate: string): string {
  if (!plate) return "";
  
  // Split by / or - and take the first part
  // We handle " /" or " -" as well by trimming
  let cleaned = plate.split(/[/|-]/)[0].trim();
  
  // Remove all spaces and lowercase
  return cleaned.replace(/\s+/g, "").toLowerCase();
}

/**
 * Normalizes a date string to YYYY-MM-DD for consistent sorting and storage.
 * Handles both YYYY-MM-DD and DD-MM-YYYY formats.
 */
export function normalizeDate(d: string): string {
  if (!d) return "";
  
  // Clean up any extra time info (e.g. "18/04/2026, 03:00:00")
  const dateOnly = d.split(',')[0].trim();
  
  const matchYMD = dateOnly.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (matchYMD) {
    const [_, y, m, day] = matchYMD;
    return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  const matchDMY = dateOnly.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (matchDMY) {
    const [_, day, m, y] = matchDMY;
    return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return dateOnly;
}

/**
 * Checks if two plate numbers are "similar" based on the user's rule:
 * "more than 5 characters match at the same positions"
 */
export function arePlatesSimilar(plateA: string, plateB: string): boolean {
  const normA = normalizePlate(plateA);
  const normB = normalizePlate(plateB);
  
  if (normA === normB) return true;
  
  // Count matching characters at the same positions
  let matches = 0;
  const minLen = Math.min(normA.length, normB.length);
  
  for (let i = 0; i < minLen; i++) {
    if (normA[i] === normB[i]) {
      matches++;
    }
  }
  
  // User rule: "more than 5 digits so they are the same"
  return matches > 5;
}

import { MaintenanceRecord } from '../types';

/**
 * Removes duplicate maintenance records from an array.
 * A record is considered a duplicate if it has the same:
 * 1. Normalized plate number
 * 2. Normalized date
 * 3. Normalized service description
 */
export function deduplicateRecords(records: MaintenanceRecord[]): MaintenanceRecord[] {
  const seen = new Set<string>();
  return records.filter(r => {
    const plate = normalizePlate(r.plate_number);
    const date = normalizeDate(r.service_date);
    const desc = r.service_description.toLowerCase().trim().replace(/\s+/g, ' ');
    const key = `${plate}|${date}|${desc}`;
    
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Cleans a service description by:
 * 1. Removing metadata headers (MAINTENANCE LOG, LOG ENTRY, etc.)
 * 2. Removing supervisor, place, garage, and mechanic names
 * 3. Truncating to 4 lines maximum
 */
export function cleanServiceDescription(desc: string): string {
  if (!desc) return "";

  // 1. Remove meta headers
  let cleaned = desc.replace(/^(MAINTENANCE LOG:|LOG ENTRY:|METADATA:|LOG NUMBER \d+,|LOG ENTRY \d+,)\s*/i, '');

  // 2. Remove Supervisor, Place, Mechanic, etc. patterns
  // Pattern example: "PLACE: ICD, SUPERVISOR: JHON, MECHANIC: BONI."
  const patterns = [
    /SUPERVISOR\/SUP PLACE:\s*[^,.]*([,.]|$)/gi,
    /SUPERVISOR:\s*[^,.]*([,.]|$)/gi,
    /SUP PLACE:\s*[^,.]*([,.]|$)/gi,
    /PLACE:\s*[^,.]*([,.]|$)/gi,
    /MECHANIC:\s*[^,.]*([,.]|$)/gi,
    /MEC:\s*[^,.]*([,.]|$)/gi,
    /FUNDI:\s*[^,.]*([,.]|$)/gi,
    /GARAGE:\s*[^,.]*([,.]|$)/gi,
    /SUP:\s*[^,.]*([,.]|$)/gi,
    /ADDITIONAL INFORMATION:\s*/gi,
  ];

  patterns.forEach(p => {
    cleaned = cleaned.replace(p, '');
  });

  // 3. Cleanup artifacts
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/^[,.\s]+/, '').replace(/[,.\s]+$/, '').trim();

  // 4. Truncate long descriptions (max 4 lines)
  const lines = cleaned.split('\n');
  if (lines.length > 4) {
    cleaned = lines.slice(0, 4).join('\n') + ' (...etc)';
  } else if (cleaned.length > 400) {
    cleaned = cleaned.substring(0, 400) + ' (...etc)';
  }

  return cleaned || "Maintenance performed.";
}
