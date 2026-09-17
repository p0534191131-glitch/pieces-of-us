export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      img
        .decode()
        .catch(() => undefined)
        .finally(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`image failed to load: ${src}`));
    img.src = src;
  });
}

/**
 * ציון 0..1 של "כמה פרטים יש בכל אזור בתמונה".
 * קיר לבן או שמיים חלקים הופכים פאזל גדול למתסכל — לכן הלוחות הגדולים מקבלים את התמונות העשירות.
 */
export function detailScore(img: HTMLImageElement): number {
  const SIZE = 64;
  const BLOCK = 8;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !img.naturalWidth) return 0.5;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, SIZE, SIZE).data;
  } catch {
    return 0.5;
  }
  const cells = SIZE / BLOCK;
  let total = 0;
  for (let by = 0; by < cells; by++) {
    for (let bx = 0; bx < cells; bx++) {
      let sum = 0;
      let sumSq = 0;
      for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
        for (let x = bx * BLOCK; x < (bx + 1) * BLOCK; x++) {
          const i = (y * SIZE + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += lum;
          sumSq += lum * lum;
        }
      }
      const n = BLOCK * BLOCK;
      const mean = sum / n;
      const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
      total += Math.min(1, std / 26);
    }
  }
  return total / (cells * cells);
}

/** חיתוך לריבוע + הקטנה + JPEG — כך שהתמונה זהה בשני המחשבים וקלה להעברה */
export async function toSquareJpeg(source: Blob, maxSide = 1080, quality = 0.88): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(maxSide, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function chunkString(value: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts.length ? parts : [""];
}
