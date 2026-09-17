import { create } from "zustand";
import { AVATARS, COLOR_ORDER } from "./constants";
import type { MatchState, PhotoMeta, PowerKind, Profile, Role } from "./types";
import type { Member, NetStatus } from "@/net/transport";
import { readJSON, writeJSON } from "@/lib/storage";
import { uid } from "@/lib/random";

export type Screen = "home" | "room" | "solo";

export interface OpponentLive {
  roundId: string;
  correct: number;
  total: number;
  moves: number;
  combo: number;
  bestCombo: number;
  board: number[];
  at: number;
}

export interface FloatingEmote {
  id: string;
  emoji: string;
  mine: boolean;
  /** מי שלח/ה — מוצג כשיש יותר משני שחקנים */
  who: string;
}

export interface PowerEvent {
  id: string;
  roundId: string;
  kind: PowerKind;
  /** מי הפעיל/ה את הכוח */
  from: string;
  /** אל מי הכוח כוון (null = כוח אישי) */
  target: string | null;
}

export interface ToastItem {
  id: string;
  text: string;
  tone: "info" | "love" | "warn";
}

export interface ServerInfo {
  lan: string[];
  port: number;
  dev: boolean;
}

export interface GameStore {
  screen: Screen;
  profile: Profile;
  /** מזהה השחקן בלשונית הזו (נשמר ברענון, שונה בכל לשונית) */
  pid: string;
  room: string | null;
  role: Role | null;
  net: NetStatus;
  joinError: string | null;
  busy: boolean;
  members: Member[];
  match: MatchState | null;
  library: PhotoMeta[];
  libraryReady: boolean;
  /** photoId → כתובת מוכנה לציור */
  assets: Record<string, string>;
  assetsLoading: { done: number; total: number } | null;
  /** ההתקדמות החיה של שאר השחקנים — לפי pid */
  opponents: Record<string, OpponentLive>;
  emotes: FloatingEmote[];
  powerInbox: PowerEvent[];
  toasts: ToastItem[];
  serverInfo: ServerInfo | null;
  serverChecked: boolean;
}

export const PROFILE_KEY = "pou:profile";
const PID_KEY = "pou:pid";

function initialPid(): string {
  const existing = readJSON<string | null>(PID_KEY, null, "session");
  if (existing) return existing;
  const fresh = uid(12);
  writeJSON(PID_KEY, fresh, "session");
  return fresh;
}

function initialProfile(): Profile {
  const saved = readJSON<Partial<Profile> | null>(PROFILE_KEY, null);
  return {
    name: typeof saved?.name === "string" ? saved.name : "",
    avatar: saved?.avatar && AVATARS.includes(saved.avatar) ? saved.avatar : AVATARS[0],
    color: saved?.color && COLOR_ORDER.includes(saved.color) ? saved.color : "rose",
    gender: saved?.gender === "m" || saved?.gender === "f" ? saved.gender : null,
  };
}

export const useGame = create<GameStore>()(() => ({
  screen: "home",
  profile: initialProfile(),
  pid: initialPid(),
  room: null,
  role: null,
  net: "idle",
  joinError: null,
  busy: false,
  members: [],
  match: null,
  library: [],
  libraryReady: false,
  assets: {},
  assetsLoading: null,
  opponents: {},
  emotes: [],
  powerInbox: [],
  toasts: [],
  serverInfo: null,
  serverChecked: false,
}));

export const getGame = useGame.getState;
export const setGame = useGame.setState;
