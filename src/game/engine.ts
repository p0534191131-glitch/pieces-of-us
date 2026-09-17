import { AVATARS, COLOR_ORDER, LOVE_CARDS, MAX_LEVELS, MAX_PLAYERS, MIN_PLAYERS, PLANS, planGrids } from "./constants";
import type {
  FinishMsg,
  Grid,
  LoveCard,
  MatchSettings,
  MatchState,
  PeerMsg,
  PhotoMeta,
  PlayerColor,
  PlayerPatch,
  PlayerRoundStats,
  PlayerState,
  Profile,
  Slot,
  ToHostMsg,
} from "./types";
import { randomSeed, shuffle, uid } from "@/lib/random";

/**
 * מנוע המשחק — רץ אצל המארח/ת בלבד והוא מקור האמת.
 * לא תלוי ב-React או ברשת: מקבל הודעות, משנה מצב, ומשדר את המצב החדש דרך hooks.emit.
 * תומך ב-2 עד 6 שחקנים; אינדקס בכל המערכים = slot של השחקן/ית.
 */

export const COUNTDOWN_MS = 3200;
/** אם מסיימים כמעט יחד — מחכים רגע כדי להכריע לפי הזמן המדויק של כל מחשב */
const FINISH_GRACE_MS = 350;
/** מבנה ה-snapshot. שינוי כאן מבטל שחזור של משחקים שנשמרו בגרסה ישנה */
export const SNAPSHOT_VERSION = 2;

export interface EngineHooks {
  emit(state: MatchState): void;
  persist(): void;
  planPhotos(grids: Grid[], settings: MatchSettings, used: ReadonlySet<string>): PhotoMeta[] | null;
  prepare(photos: PhotoMeta[], matchId: string): void;
}

interface FinishRecord {
  timeMs: number;
  moves: number;
  bestCombo: number;
  powersUsed: number;
}

interface LiveRecord {
  correct: number;
  total: number;
  moves: number;
  bestCombo: number;
}

export interface EngineSnapshot {
  version: number;
  state: MatchState;
  notes: string[];
  finishes: (FinishRecord | null)[];
  live: LiveRecord[];
  powers: number[];
  used: string[];
  deck: LoveCard[];
}

export type StartResult = "ok" | "not-ready" | "no-photos";

const emptyLive = (): LiveRecord => ({ correct: 0, total: 0, moves: 0, bestCombo: 0 });

export function defaultSettings(): MatchSettings {
  return {
    plan: "classic",
    mischief: true,
    photoMode: "surprise",
    manual: Array.from({ length: MAX_LEVELS }, () => null),
    premiumFinale: true,
    maxPlayers: 2,
  };
}

export function sanitizeProfile(input: Partial<Profile>, players: readonly PlayerState[] = [], slot = -1): Profile {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 16) || "שחקן/ית";
  const avatar = input.avatar && AVATARS.includes(input.avatar) ? input.avatar : AVATARS[0];
  const gender = input.gender === "m" || input.gender === "f" ? input.gender : null;
  const taken = new Set(players.filter((p) => p.slot !== slot).map((p) => p.color));
  let color: PlayerColor = input.color && COLOR_ORDER.includes(input.color) ? input.color : COLOR_ORDER[0];
  if (taken.has(color)) color = COLOR_ORDER.find((c) => !taken.has(c)) ?? color;
  return { name, avatar, color, gender };
}

function makePlayer(pid: string, slot: Slot, profile: Profile, players: readonly PlayerState[]): PlayerState {
  return {
    ...sanitizeProfile(profile, players, slot),
    pid,
    slot,
    connected: true,
    ready: slot === 0,
    assist: 1,
    wish: "",
    hasNote: false,
    assetsReady: false,
    rematch: false,
  };
}

export class MatchEngine {
  private s: MatchState;
  private notes: string[] = [""];
  private finishes: (FinishRecord | null)[] = [null];
  private live: LiveRecord[] = [emptyLive()];
  private powers: number[] = [0];
  private used = new Set<string>();
  private deck: LoveCard[] = [];
  private timers = new Set<number>();
  private graceTimer = 0;
  private readonly hooks: EngineHooks;

  constructor(
    hooks: EngineHooks,
    init: { room: string; hostPid: string; profile: Profile } | { snapshot: EngineSnapshot },
  ) {
    this.hooks = hooks;
    if ("snapshot" in init) {
      const snap = init.snapshot;
      this.s = snap.state;
      this.notes = snap.notes;
      this.finishes = snap.finishes;
      this.live = snap.live;
      this.powers = snap.powers;
      this.used = new Set(snap.used);
      this.deck = snap.deck;
      this.fit(this.s.players.length);
    } else {
      this.s = {
        v: 1,
        matchId: uid(),
        room: init.room,
        phase: "lobby",
        players: [makePlayer(init.hostPid, 0, init.profile, [])],
        settings: defaultSettings(),
        grids: planGrids("classic"),
        photos: [],
        round: null,
        results: [],
        scores: [0],
        nextReady: [false],
        notes: null,
      };
    }
  }

  get state(): MatchState {
    return this.s;
  }

  snapshot(): EngineSnapshot {
    return {
      version: SNAPSHOT_VERSION,
      state: this.s,
      notes: this.notes,
      finishes: this.finishes,
      live: this.live,
      powers: this.powers,
      used: [...this.used],
      deck: this.deck,
    };
  }

  /** אחרי רענון של המארח/ת — משלים טיימרים שאבדו */
  resume() {
    const s = this.s;
    if (s.phase === "countdown") {
      this.commit((d) => {
        d.phase = "playing";
      });
    } else if (s.phase === "playing" && this.finishes.some(Boolean)) {
      this.endRound();
    } else if (s.phase === "preparing") {
      this.commit((d) => {
        d.players[0].assetsReady = false;
      });
      this.hooks.prepare(this.s.photos, this.s.matchId);
    } else {
      this.hooks.emit(s);
    }
  }

  dispose() {
    this.clearTimers();
  }

  slotOf(pid: string): Slot | null {
    const player = this.s.players.find((p) => p.pid === pid);
    return player ? player.slot : null;
  }

  private connectedPlayers(): PlayerState[] {
    return this.s.players.filter((p) => p.connected);
  }

  setOnline(online: ReadonlySet<string>) {
    if (!this.s.players.some((p) => p.connected !== online.has(p.pid))) return;
    this.commit((d) => {
      d.players.forEach((p) => {
        p.connected = online.has(p.pid);
      });
    });
    // מישהו יצא באמצע — בודקים אם השאר כבר מחכים להמשך
    const s = this.s;
    const live = this.connectedPlayers();
    if (!live.length) return;
    if (s.phase === "preparing" && live.length >= MIN_PLAYERS && live.every((p) => p.assetsReady)) this.startRound(0);
    else if (s.phase === "playing" && live.every((p) => this.finishes[p.slot])) this.endRound();
    else if (s.phase === "roundEnd" && live.every((p) => s.nextReady[p.slot])) this.advance();
    else if (s.phase === "matchEnd" && live.length >= MIN_PLAYERS && live.every((p) => p.rematch)) this.startMatch(true);
  }

  /* ---------------- הודעות מהשחקנים ---------------- */

  receive(pid: string, msg: ToHostMsg): "ok" | "denied" | "ignored" {
    if (msg.k === "hello") return this.hello(pid, msg.profile, msg.assetsFor) ? "ok" : "denied";
    const slot = this.slotOf(pid);
    if (slot === null) return "ignored";
    switch (msg.k) {
      case "player":
        this.patchPlayer(slot, msg.patch);
        break;
      case "note":
        this.setNote(slot, msg.text);
        break;
      case "assets-ready":
        this.markAssetsReady(slot, msg.matchId);
        break;
      case "finish":
        this.finish(slot, msg);
        break;
      case "next":
        this.next(slot, msg.roundId);
        break;
    }
    return "ok";
  }

  receivePeer(pid: string, msg: PeerMsg) {
    const slot = this.slotOf(pid);
    const round = this.s.round;
    if (slot === null || !round) return;
    if (msg.k === "progress" && msg.roundId === round.id) {
      this.live[slot] = { correct: msg.correct, total: msg.total, moves: msg.moves, bestCombo: msg.bestCombo };
    } else if (msg.k === "power" && msg.roundId === round.id) {
      this.powers[slot] += 1;
    }
  }

  /* ---------------- פעולות של המארח/ת ---------------- */

  updateSettings(patch: Partial<MatchSettings>) {
    if (this.s.phase !== "lobby") return;
    this.commit((d) => {
      const next: MatchSettings = { ...d.settings, ...patch };
      if (!PLANS[next.plan]) next.plan = "classic";
      next.manual = Array.from({ length: MAX_LEVELS }, (_, i) => next.manual[i] ?? null);
      next.maxPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, d.players.length, Math.round(next.maxPlayers) || MIN_PLAYERS));
      d.settings = next;
      d.grids = planGrids(next.plan);
    });
  }

  /** הסרת שחקן/ית מהלובי (למשל מישהו שהתנתק ולא חוזר) */
  removePlayer(slot: Slot) {
    const s = this.s;
    if (s.phase !== "lobby" || slot < 1 || slot >= s.players.length) return;
    this.notes.splice(slot, 1);
    this.finishes.splice(slot, 1);
    this.live.splice(slot, 1);
    this.powers.splice(slot, 1);
    this.commit((d) => {
      d.players.splice(slot, 1);
      d.players.forEach((p, i) => {
        p.slot = i;
      });
      d.scores.splice(slot, 1);
      d.nextReady.splice(slot, 1);
    });
  }

  canStart(): boolean {
    const s = this.s;
    if (s.phase !== "lobby") return false;
    const live = this.connectedPlayers();
    return live.length >= MIN_PLAYERS && live.every((p) => p.slot === 0 || p.ready);
  }

  startMatch(rematch = false): StartResult {
    const s = this.s;
    const live = this.connectedPlayers();
    const allowed = rematch ? s.phase === "matchEnd" && live.length >= MIN_PLAYERS : this.canStart();
    if (!allowed) return "not-ready";
    const grids = planGrids(s.settings.plan);
    const photos = this.hooks.planPhotos(grids, s.settings, this.used);
    if (!photos || photos.length < grids.length) return "no-photos";
    if (this.used.size > 300) this.used.clear();
    photos.forEach((p) => this.used.add(p.id));
    this.clearTimers();
    this.resetRoundData();
    if (rematch) this.notes = this.notes.map(() => "");
    const matchId = uid();
    this.commit((d) => {
      d.matchId = matchId;
      d.phase = "preparing";
      d.grids = grids;
      d.photos = photos;
      d.round = null;
      d.results = [];
      d.scores = d.players.map(() => 0);
      d.nextReady = d.players.map(() => false);
      d.notes = null;
      d.players.forEach((p) => {
        p.assetsReady = false;
        p.rematch = false;
        if (rematch) p.hasNote = false;
      });
    });
    this.hooks.prepare(photos, matchId);
    return "ok";
  }

  forceNext() {
    if (this.s.phase === "roundEnd") this.advance();
  }

  backToLobby() {
    this.clearTimers();
    const fromEnd = this.s.phase === "matchEnd";
    if (fromEnd) this.notes = this.notes.map(() => "");
    this.resetRoundData();
    this.commit((d) => {
      d.phase = "lobby";
      d.round = null;
      d.results = [];
      d.scores = d.players.map(() => 0);
      d.photos = [];
      d.nextReady = d.players.map(() => false);
      d.notes = null;
      d.players.forEach((p) => {
        p.assetsReady = false;
        p.rematch = false;
        if (p.slot !== 0) p.ready = false;
        if (fromEnd) p.hasNote = false;
      });
    });
  }

  /* ---------------- פנימי ---------------- */

  /** כל המערכים הפנימיים באורך מספר השחקנים */
  private fit(count: number) {
    const grow = <T>(list: T[], make: () => T) => {
      while (list.length < count) list.push(make());
      if (list.length > count) list.length = count;
    };
    grow(this.notes, () => "");
    grow(this.finishes, () => null);
    grow(this.live, emptyLive);
    grow(this.powers, () => 0);
  }

  private resetRoundData() {
    this.finishes = this.s.players.map(() => null);
    this.live = this.s.players.map(() => emptyLive());
    this.powers = this.s.players.map(() => 0);
  }

  private commit(mutate: (draft: MatchState) => void) {
    const draft = structuredClone(this.s);
    mutate(draft);
    const count = draft.players.length;
    draft.scores = Array.from({ length: count }, (_, i) => draft.scores[i] ?? 0);
    draft.nextReady = Array.from({ length: count }, (_, i) => draft.nextReady[i] ?? false);
    if (draft.notes) {
      const notes = draft.notes;
      draft.notes = Array.from({ length: count }, (_, i) => notes[i] ?? "");
    }
    draft.v = this.s.v + 1;
    this.s = draft;
    this.fit(count);
    this.hooks.emit(draft);
  }

  private later(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  private clearTimers() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers.clear();
    this.graceTimer = 0;
  }

  private hello(pid: string, profile: Profile, assetsFor: string | null): boolean {
    const s = this.s;
    const needsAssets = s.phase !== "lobby" && assetsFor !== s.matchId;
    const existing = s.players.find((p) => p.pid === pid);
    const free = s.players.find((p) => p.slot !== 0 && !p.connected);
    if (existing) {
      this.commit((d) => {
        const p = d.players[existing.slot];
        Object.assign(p, sanitizeProfile(profile, d.players, existing.slot));
        p.connected = true;
        if (needsAssets) p.assetsReady = false;
      });
    } else if (s.players.length < s.settings.maxPlayers) {
      this.commit((d) => {
        d.players.push(makePlayer(pid, d.players.length, profile, d.players));
      });
    } else if (free) {
      // מישהו שהתנתק לא חזר — המקום נמסר למי שנכנס/ת עכשיו
      const slot = free.slot;
      this.commit((d) => {
        const seat = d.players[slot];
        Object.assign(seat, sanitizeProfile(profile, d.players, slot));
        seat.pid = pid;
        seat.connected = true;
        seat.assetsReady = false;
        seat.ready = false;
      });
    } else {
      return false;
    }
    if (needsAssets && this.s.photos.length) this.hooks.prepare(this.s.photos, this.s.matchId);
    return true;
  }

  private patchPlayer(slot: Slot, patch: PlayerPatch) {
    const lobby = this.s.phase === "lobby";
    this.commit((d) => {
      const p = d.players[slot];
      if (!p) return;
      if (
        patch.name !== undefined ||
        patch.avatar !== undefined ||
        patch.color !== undefined ||
        patch.gender !== undefined
      ) {
        Object.assign(
          p,
          sanitizeProfile(
            {
              name: patch.name ?? p.name,
              avatar: patch.avatar ?? p.avatar,
              color: patch.color ?? p.color,
              gender: patch.gender !== undefined ? patch.gender : p.gender,
            },
            d.players,
            slot,
          ),
        );
      }
      if (lobby && slot !== 0 && typeof patch.ready === "boolean") p.ready = patch.ready;
      if (lobby && (patch.assist === 0 || patch.assist === 1 || patch.assist === 2)) p.assist = patch.assist;
      if (lobby && typeof patch.wish === "string") p.wish = patch.wish.slice(0, 90);
      if (d.phase === "matchEnd" && typeof patch.rematch === "boolean") p.rematch = patch.rematch;
    });
    const s = this.s;
    const live = this.connectedPlayers();
    if (s.phase === "matchEnd" && live.length >= MIN_PLAYERS && live.every((p) => p.rematch)) this.startMatch(true);
  }

  private setNote(slot: Slot, text: string) {
    if (this.s.phase !== "lobby") return;
    this.notes[slot] = String(text ?? "").slice(0, 500);
    const has = this.notes[slot].trim().length > 0;
    if (this.s.players[slot]?.hasNote !== has) {
      this.commit((d) => {
        d.players[slot].hasNote = has;
      });
    } else {
      this.hooks.persist();
    }
  }

  private markAssetsReady(slot: Slot, matchId: string) {
    const s = this.s;
    if (matchId !== s.matchId || !s.players[slot] || s.players[slot].assetsReady) return;
    this.commit((d) => {
      d.players[slot].assetsReady = true;
    });
    const live = this.connectedPlayers();
    if (this.s.phase === "preparing" && live.length >= MIN_PLAYERS && live.every((p) => p.assetsReady)) this.startRound(0);
  }

  private startRound(index: number) {
    this.clearTimers();
    this.resetRoundData();
    const id = uid(8);
    this.commit((d) => {
      d.phase = "countdown";
      d.round = {
        id,
        index,
        grid: { ...d.grids[index] },
        photoId: d.photos[index].id,
        seed: randomSeed(),
        countdownMs: COUNTDOWN_MS,
      };
      d.nextReady = d.players.map(() => false);
    });
    this.later(() => {
      if (this.s.round?.id === id && this.s.phase === "countdown") {
        this.commit((d) => {
          d.phase = "playing";
        });
      }
    }, COUNTDOWN_MS);
  }

  private finish(slot: Slot, msg: FinishMsg) {
    const s = this.s;
    if (!s.round || msg.roundId !== s.round.id) return;
    if (s.phase !== "playing" && s.phase !== "countdown") return;
    if (this.finishes[slot]) return;
    this.finishes[slot] = {
      timeMs: Math.max(0, Number(msg.timeMs) || 0),
      moves: Math.max(0, Math.floor(Number(msg.moves) || 0)),
      bestCombo: Math.max(0, Math.floor(Number(msg.bestCombo) || 0)),
      powersUsed: Math.max(0, Math.floor(Number(msg.powersUsed) || 0)),
    };
    this.hooks.persist();
    if (this.connectedPlayers().every((p) => this.finishes[p.slot])) {
      this.endRound();
      return;
    }
    if (!this.graceTimer) {
      this.graceTimer = this.later(() => {
        this.graceTimer = 0;
        this.endRound();
      }, FINISH_GRACE_MS);
    }
  }

  private progressOf(slot: Slot): number {
    const f = this.finishes[slot];
    if (f) return 1;
    const l = this.live[slot];
    return l && l.total ? l.correct / l.total : 0;
  }

  private endRound() {
    const s = this.s;
    const round = s.round;
    if (!round || (s.phase !== "playing" && s.phase !== "countdown")) return;
    if (this.graceTimer) {
      window.clearTimeout(this.graceTimer);
      this.timers.delete(this.graceTimer);
      this.graceTimer = 0;
    }
    if (!this.finishes.some(Boolean)) return;

    const ranking = s.players
      .map((p) => p.slot)
      .sort((a, b) => {
        const fa = this.finishes[a];
        const fb = this.finishes[b];
        if (fa && fb) return fa.timeMs - fb.timeMs;
        if (fa) return -1;
        if (fb) return 1;
        return this.progressOf(b) - this.progressOf(a);
      });
    const winner = ranking[0];

    const stats: PlayerRoundStats[] = s.players.map((p): PlayerRoundStats => {
      const f = this.finishes[p.slot];
      const l = this.live[p.slot] ?? emptyLive();
      if (f) {
        return {
          finished: true,
          timeMs: f.timeMs,
          moves: f.moves,
          progress: 1,
          bestCombo: f.bestCombo,
          powersUsed: Math.max(f.powersUsed, this.powers[p.slot] ?? 0),
        };
      }
      return {
        finished: false,
        timeMs: null,
        moves: l.moves,
        progress: l.total ? l.correct / l.total : 0,
        bestCombo: l.bestCombo,
        powersUsed: this.powers[p.slot] ?? 0,
      };
    });

    const card = this.drawCard();
    this.commit((d) => {
      d.phase = "roundEnd";
      d.results.push({
        roundId: round.id,
        index: round.index,
        grid: { ...round.grid },
        photoId: round.photoId,
        winner,
        ranking,
        stats,
        card,
      });
      d.scores[winner] += 1;
      d.nextReady = d.players.map(() => false);
    });
  }

  private next(slot: Slot, roundId: string) {
    const s = this.s;
    if (s.phase !== "roundEnd" || s.round?.id !== roundId || s.nextReady[slot]) return;
    this.commit((d) => {
      d.nextReady[slot] = true;
    });
    const after = this.s;
    if (this.connectedPlayers().every((p) => after.nextReady[p.slot])) this.advance();
  }

  private advance() {
    const round = this.s.round;
    if (!round) return;
    const nextIndex = round.index + 1;
    if (nextIndex < this.s.grids.length) {
      this.startRound(nextIndex);
      return;
    }
    this.clearTimers();
    const notes = this.s.players.map((p) => this.notes[p.slot] ?? "");
    this.commit((d) => {
      d.phase = "matchEnd";
      d.notes = notes;
      d.players.forEach((p) => {
        p.rematch = false;
      });
    });
  }

  private drawCard(): LoveCard {
    if (!this.deck.length) this.deck = shuffle(LOVE_CARDS);
    return this.deck.pop() ?? LOVE_CARDS[0];
  }
}
