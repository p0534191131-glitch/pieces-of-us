type Where = "local" | "session";

function storage(where: Where): Storage | null {
  try {
    return where === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJSON<T>(key: string, fallback: T, where: Where = "local"): T {
  try {
    const raw = storage(where)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown, where: Where = "local"): void {
  try {
    storage(where)?.setItem(key, JSON.stringify(value));
  } catch {
    /* אחסון מלא או חסום — המשחק ממשיך לעבוד בלי לשמור */
  }
}

export function removeKey(key: string, where: Where = "local"): void {
  try {
    storage(where)?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ---------- שיאים אישיים (לכל שם, לכל גודל לוח) ---------- */

const RECORDS_KEY = "pou:records";
type Records = Record<string, Record<string, number>>;

const recordOwner = (name: string) => name.trim().toLowerCase() || "anon";

export function getRecord(name: string, grid: number): number | null {
  const all = readJSON<Records>(RECORDS_KEY, {});
  return all[recordOwner(name)]?.[String(grid)] ?? null;
}

export function submitRecord(name: string, grid: number, ms: number): { isRecord: boolean; previous: number | null } {
  const all = readJSON<Records>(RECORDS_KEY, {});
  const owner = recordOwner(name);
  const mine = all[owner] ?? {};
  const previous = mine[String(grid)] ?? null;
  const isRecord = previous === null || ms < previous;
  if (isRecord) {
    mine[String(grid)] = Math.round(ms);
    all[owner] = mine;
    writeJSON(RECORDS_KEY, all);
  }
  return { isRecord, previous };
}
