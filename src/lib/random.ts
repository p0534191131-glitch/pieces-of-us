/** PRNG דטרמיניסטי — שני המחשבים מקבלים בדיוק את אותו ערבוב מאותו seed */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(items: readonly T[], rng: () => number = Math.random): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(rng() * items.length)];
}

const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** מזהה אקראי. getRandomValues עובד גם בכתובת רשת מקומית (http), בניגוד ל-randomUUID */
export function uid(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

/** קוד חדר של 4 ספרות — קל להקריא בקול מחדר לחדר */
export function roomCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}
