import type { Grid, MatchSettings, PhotoMeta } from "./types";
import { pick, shuffle, uid } from "@/lib/random";
import { toSquareJpeg } from "@/lib/image";
import { uploadsDb } from "@/lib/idb";

export const GROUP_LABEL: Record<string, string> = {
  us: "שלנו",
  sweet: "מתוקים",
  other: "עוד מהתיקייה",
  upload: "הועלו מהמחשב",
  premium: "פרימיום 💎",
};

interface FolderPhotoDto {
  id: string;
  group: string;
  label: string;
  url: string;
}

interface PremiumDto {
  file: string;
  title: string;
}

/** התמונות מתיקיית photos — מגיעות מהשרת המקומי */
export async function fetchFolderPhotos(): Promise<PhotoMeta[]> {
  try {
    const res = await fetch("/api/photos", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { photos?: FolderPhotoDto[] };
    return (data.photos ?? []).map((p) => ({ id: p.id, source: "folder", group: p.group, label: p.label, url: p.url }));
  } catch {
    return [];
  }
}

/** תמונות הפרימיום — חלק מהמשחק עצמו (public/premium), עובדות גם ב-Lovable */
export async function fetchPremiumPhotos(): Promise<PhotoMeta[]> {
  try {
    const res = await fetch("/premium/manifest.json", { cache: "no-cache" });
    if (!res.ok) return [];
    const data = (await res.json()) as { photos?: PremiumDto[] };
    return (data.photos ?? []).map((p) => ({
      id: `premium:${p.file}`,
      source: "premium",
      group: "premium",
      label: p.title,
      url: `/premium/${p.file}`,
    }));
  } catch {
    return [];
  }
}

export interface LocalUpload {
  meta: PhotoMeta;
  blob: Blob;
}

export async function loadStoredUploads(): Promise<LocalUpload[]> {
  try {
    const items = await uploadsDb.all();
    return items
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((it) => ({ meta: { id: it.id, source: "upload", group: "upload", label: it.label }, blob: it.blob }));
  } catch {
    return [];
  }
}

/** מעבד תמונות שנבחרו מהמחשב: חיתוך לריבוע, הקטנה, ושמירה בדפדפן בלבד */
export async function importUploads(files: File[]): Promise<{ added: LocalUpload[]; failed: number }> {
  const added: LocalUpload[] = [];
  let failed = 0;
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      failed++;
      continue;
    }
    try {
      const blob = await toSquareJpeg(file, 1080, 0.88);
      const id = `upload:${uid(10)}`;
      const label = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "תמונה";
      try {
        await uploadsDb.put({ id, label, blob, createdAt: Date.now() });
      } catch {
        /* לא נשמר לפעם הבאה, אבל עדיין אפשר לשחק איתה */
      }
      added.push({ meta: { id, source: "upload", group: "upload", label }, blob });
    } catch {
      failed++;
    }
  }
  return { added, failed };
}

export async function forgetUpload(id: string): Promise<void> {
  try {
    await uploadsDb.remove(id);
  } catch {
    /* ignore */
  }
}

/**
 * בוחר תמונה לכל שלב.
 * - בחירה ידנית מכובדת, חורים מתמלאים בהפתעה
 * - "גמר פרימיום": השלב האחרון מקבל תמונת פרימיום
 * - עדיפות לתמונות זוגיות, בלי לחזור על תמונות מהמשחקים האחרונים
 * - התמונות העשירות בפרטים הולכות ללוחות הגדולים — כדי שגם 144 חלקים יהיו מאתגרים אבל הוגנים
 */
export function planPhotos(
  library: PhotoMeta[],
  grids: Grid[],
  settings: MatchSettings,
  used: ReadonlySet<string>,
): PhotoMeta[] | null {
  if (!library.length) return null;
  const count = grids.length;
  const result: (PhotoMeta | null)[] = Array.from({ length: count }, () => null);
  const byId = new Map(library.map((p) => [p.id, p]));
  const taken = new Set<string>();

  if (settings.photoMode === "manual") {
    for (let i = 0; i < count; i++) {
      const id = settings.manual[i];
      const photo = id ? byId.get(id) : undefined;
      if (photo) {
        result[i] = photo;
        taken.add(photo.id);
      }
    }
  }

  const fresh = (list: PhotoMeta[]) => {
    const unused = list.filter((p) => !used.has(p.id) && !taken.has(p.id));
    return unused.length ? unused : list.filter((p) => !taken.has(p.id));
  };

  const premium = library.filter((p) => p.source === "premium");
  if (settings.premiumFinale && premium.length && !result[count - 1]) {
    const choice = pick(fresh(premium)) ?? pick(premium);
    if (choice) {
      result[count - 1] = choice;
      taken.add(choice.id);
    }
  }

  const empty = result.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  if (empty.length) {
    const personal = library.filter((p) => p.source !== "premium");
    const ours = shuffle(fresh(personal.filter((p) => p.group === "us")));
    const others = shuffle(fresh(personal.filter((p) => p.group !== "us")));
    const need = empty.length;
    const oursWanted = Math.min(ours.length, Math.max(need - others.length, Math.ceil(need * 0.65)));
    let chosen = [...ours.slice(0, oursWanted), ...others.slice(0, need - oursWanted)];
    if (chosen.length < need) {
      const rest = shuffle(library.filter((p) => !taken.has(p.id) && !chosen.includes(p)));
      chosen = [...chosen, ...rest.slice(0, need - chosen.length)];
    }
    while (chosen.length < need) {
      const any = pick(library);
      if (!any) break;
      chosen.push(any);
    }
    chosen.sort((a, b) => (a.detail ?? 0.5) - (b.detail ?? 0.5));
    empty.forEach((slotIndex, k) => {
      result[slotIndex] = chosen[k] ?? null;
    });
  }

  return result.every(Boolean) ? (result as PhotoMeta[]) : null;
}
