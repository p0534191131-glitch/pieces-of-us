export type Role = "host" | "guest";
/** מקום בשולחן. 0 = המארח/ת */
export type Slot = number;
export type PlayerColor = "rose" | "gold" | "violet" | "teal" | "sky" | "lime";
/** איך לפנות אל השחקן/ית בעברית. null = פנייה כפולה (לקח/ה) */
export type Gender = "m" | "f" | null;
export type AssistLevel = 0 | 1 | 2;
export type PlanId = "sprint" | "classic" | "marathon" | "legend";
export type PhotoMode = "surprise" | "manual";
export type Phase = "lobby" | "preparing" | "countdown" | "playing" | "roundEnd" | "matchEnd";
export type PowerKind = "hearts" | "fog" | "twist" | "freeze" | "peek" | "magnet";
export type PhotoSource = "folder" | "upload" | "premium";

/** לוח של c עמודות על r שורות. מספר החלקים = c*r, ובכל שלב הוא מוכפל */
export interface Grid {
  c: number;
  r: number;
}

export const pieces = (grid: Grid): number => grid.c * grid.r;

export interface Profile {
  name: string;
  avatar: string;
  color: PlayerColor;
  gender: Gender;
}

export interface PlayerState extends Profile {
  pid: string;
  slot: Slot;
  connected: boolean;
  /** מוכנות בלובי (המארח/ת תמיד מוכן/ה) */
  ready: boolean;
  assist: AssistLevel;
  /** מה אני מקבל/ת אם אנצח */
  wish: string;
  /** כתב/ה פתק סודי — התוכן נחשף רק בסוף המשחק */
  hasNote: boolean;
  assetsReady: boolean;
  rematch: boolean;
}

export interface PhotoMeta {
  id: string;
  source: PhotoSource;
  group: string;
  label: string;
  /** תמונות מהתיקייה או פרימיום — כתובת שכל המחשבים טוענים. תמונות שהועלו — מועברות ישירות בין המחשבים */
  url?: string;
  /** 0..1 — כמה פרטים יש בתמונה (לוחות גדולים מקבלים תמונות עשירות) */
  detail?: number;
}

export interface MatchSettings {
  plan: PlanId;
  mischief: boolean;
  photoMode: PhotoMode;
  /** מזהה תמונה לכל שלב במצב בחירה ידנית */
  manual: (string | null)[];
  premiumFinale: boolean;
  /** כמה שחקנים מותר בחדר (2–6) */
  maxPlayers: number;
}

export interface RoundInfo {
  id: string;
  index: number;
  grid: Grid;
  photoId: string;
  seed: number;
  countdownMs: number;
}

export interface PlayerRoundStats {
  finished: boolean;
  timeMs: number | null;
  moves: number;
  progress: number;
  bestCombo: number;
  powersUsed: number;
}

export interface LoveCard {
  emoji: string;
  text: string;
}

export interface RoundResult {
  roundId: string;
  index: number;
  grid: Grid;
  photoId: string;
  winner: Slot;
  /** הדירוג בשלב: מי סיים ראשון, ואחריהם לפי ההתקדמות */
  ranking: Slot[];
  /** אינדקס = slot */
  stats: PlayerRoundStats[];
  /** כרטיס אהבה למי שסיים/ה אחרון/ה בשלב */
  card: LoveCard;
}

export interface MatchState {
  v: number;
  matchId: string;
  room: string;
  phase: Phase;
  /** אינדקס = slot. 0 = המארח/ת */
  players: PlayerState[];
  settings: MatchSettings;
  grids: Grid[];
  photos: PhotoMeta[];
  round: RoundInfo | null;
  results: RoundResult[];
  /** אינדקס = slot */
  scores: number[];
  nextReady: boolean[];
  /** הפתקים הסודיים — מתגלים רק בסוף המשחק */
  notes: string[] | null;
}

/* ------------------------------------------------------------------ */
/* הודעות רשת                                                          */
/* ------------------------------------------------------------------ */

/** בין השחקנים ישירות */
export interface ProgressMsg {
  k: "progress";
  roundId: string;
  correct: number;
  total: number;
  moves: number;
  combo: number;
  bestCombo: number;
  board: number[];
}
export interface PowerMsg {
  k: "power";
  roundId: string;
  power: PowerKind;
  /** כוח שנשלח לשחקן/ית מסוים/ת — השאר רק רואים הודעה */
  target: string | null;
  nonce: string;
}
export interface EmoteMsg {
  k: "emote";
  emoji: string;
  nonce: string;
}
export type PeerMsg = ProgressMsg | PowerMsg | EmoteMsg;

export type PlayerPatch = Partial<
  Pick<PlayerState, "name" | "avatar" | "color" | "gender" | "ready" | "assist" | "wish" | "rematch">
>;

export interface HelloMsg {
  k: "hello";
  profile: Profile;
  /** המשחק שהתמונות שלו כבר טעונות אצלי (אחרי רענון — null) */
  assetsFor: string | null;
}
export interface FinishMsg {
  k: "finish";
  roundId: string;
  timeMs: number;
  moves: number;
  bestCombo: number;
  powersUsed: number;
}

/** מהשחקנים אל "מנוע" המשחק שרץ אצל המארח/ת */
export type ToHostMsg =
  | HelloMsg
  | { k: "player"; patch: PlayerPatch }
  | { k: "note"; text: string }
  | { k: "assets-ready"; matchId: string }
  | FinishMsg
  | { k: "next"; roundId: string };

export interface AssetMsg {
  k: "asset";
  matchId: string;
  photoId: string;
  mime: string;
  part: number;
  parts: number;
  data: string;
}

/** מהמארח/ת אל שאר השחקנים */
export type ToGuestMsg = { k: "state"; state: MatchState } | AssetMsg | { k: "denied"; reason: "full" };

export type NetMessage = PeerMsg | ToHostMsg | ToGuestMsg;
