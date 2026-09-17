import type { NetMessage, Role } from "@/game/types";

/**
 * שכבת הרשת של המשחק. יש שני מימושים עם אותו ממשק:
 * - local-server: WebSocket לשרת המקומי (server/index.mjs) — כל המחשבים באותה רשת ביתית
 * - supabase: Realtime של Supabase / Lovable Cloud — משחק מכל מקום בעולם
 * כל שאר הקוד לא יודע ולא אכפת לו באיזה מהם משתמשים.
 */

export interface Member {
  pid: string;
  role: Role;
  name: string;
}

export type NetStatus = "idle" | "connecting" | "online" | "reconnecting" | "offline";
export type JoinError = "room-not-found" | "room-full" | "room-taken" | "server-unreachable" | "bad-request";

export interface JoinOptions {
  room: string;
  pid: string;
  role: Role;
  name: string;
}

export type TransportEvents = {
  message: (from: string, msg: NetMessage) => void;
  presence: (members: Member[]) => void;
  status: (status: NetStatus) => void;
  /** המארח/ת סגר/ה את החדר */
  closed: () => void;
  /** אותו שחקן פתח את המשחק בלשונית אחרת — הלשונית הזו מפנה את המקום */
  replaced: () => void;
};

export interface Transport {
  readonly kind: "local-server" | "supabase";
  join(opts: JoinOptions): Promise<void>;
  send(msg: NetMessage, to?: string): void;
  leave(): void;
  on<E extends keyof TransportEvents>(event: E, handler: TransportEvents[E]): () => void;
}

export class JoinFailure extends Error {
  readonly code: JoinError;
  constructor(code: JoinError) {
    super(code);
    this.name = "JoinFailure";
    this.code = code;
  }
}

function supabaseConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export function transportKind(): Transport["kind"] {
  return supabaseConfig() ? "supabase" : "local-server";
}

/** האם הדף נפתח מהרשת הביתית? באתר בענן ההודעות על "אין שרת" צריכות להיות אחרות */
export function isHomeNetwork(): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
}

export async function createTransport(): Promise<Transport> {
  const supabase = supabaseConfig();
  if (supabase) {
    const { SupabaseTransport } = await import("./supabaseTransport");
    return new SupabaseTransport(supabase.url, supabase.key);
  }
  const { WsTransport } = await import("./wsTransport");
  return new WsTransport();
}
