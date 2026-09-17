import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_POWERS, RIVAL_POWERS, POWERS, SELF_POWERS } from "./constants";
import { countPlaced, hintMove, isSolved, magnetPair, scrambledBoard, solvedBoard, swapSlots, twistPair } from "./puzzle";
import type { PowerKind } from "./types";
import { readJSON, writeJSON } from "@/lib/storage";
import { sound } from "@/lib/sound";

/**
 * כל מה שקורה על הלוח של שחקן/ית אחד/ת בשלב אחד: ספירה לאחור, החלפות, רצפים, כוחות, רמזים וסיום.
 * משמש גם את המירוץ הזוגי וגם את מצב האימון.
 */

export type RoundStatus = "idle" | "countdown" | "playing" | "finished" | "ended";

export interface RoundLocal {
  key: string;
  size: number;
  status: RoundStatus;
  board: number[];
  startAt: number;
  startEpoch: number;
  finishMs: number | null;
  moves: number;
  combo: number;
  bestCombo: number;
  charge: number;
  powers: PowerKind[];
  powersUsed: number;
  countdownEndsAt: number;
}

export interface RoundFinish {
  timeMs: number;
  moves: number;
  bestCombo: number;
  powersUsed: number;
}

export interface ProgressSnapshot {
  board: number[];
  correct: number;
  total: number;
  moves: number;
  combo: number;
  bestCombo: number;
}

export interface PuzzleRoundOptions {
  key: string | null;
  size: number;
  seed: number;
  countdownMs: number;
  start: "countdown" | "now" | "ended";
  locks: boolean;
  hints: boolean;
  mischief: boolean;
  persist: boolean;
  onProgress?: (snap: ProgressSnapshot, force: boolean) => void;
  onFinish?: (result: RoundFinish) => void;
  onPowerUsed?: (kind: PowerKind) => void;
}

type EffectName = "hearts" | "fog" | "freeze" | "peek";
type Effects = Record<EffectName, boolean>;

const NO_EFFECTS: Effects = { hearts: false, fog: false, freeze: false, peek: false };

/** כמה חלקים צריך לנעול כדי לקבל כוח */
export function chargeNeeded(size: number): number {
  return Math.max(5, Math.round(size / 5));
}

function blank(key: string, size: number): RoundLocal {
  return {
    key,
    size,
    status: "idle",
    board: solvedBoard(size),
    startAt: 0,
    startEpoch: 0,
    finishMs: null,
    moves: 0,
    combo: 0,
    bestCombo: 0,
    charge: 0,
    powers: [],
    powersUsed: 0,
    countdownEndsAt: 0,
  };
}

function snapshotOf(r: RoundLocal): ProgressSnapshot {
  return {
    board: r.board,
    correct: countPlaced(r.board),
    total: r.board.length,
    moves: r.moves,
    combo: r.combo,
    bestCombo: r.bestCombo,
  };
}

function randomPower(): PowerKind {
  const pool = Math.random() < 0.68 ? RIVAL_POWERS : SELF_POWERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

const storageKey = (key: string) => `pou:round:${key}`;

export function usePuzzleRound(opts: PuzzleRoundOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [round, setRound] = useState<RoundLocal>(() => blank(opts.key ?? "", opts.size));
  const roundRef = useRef(round);
  const [effects, setEffects] = useState<Effects>(NO_EFFECTS);
  const effectTimers = useRef<Partial<Record<EffectName, number>>>({});
  const frozenUntil = useRef(0);
  const lastPlacedAt = useRef(0);
  const [twist, setTwist] = useState<{ a: number; b: number; key: number } | null>(null);
  const [magnet, setMagnet] = useState<{ slot: number; key: number } | null>(null);
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null);
  const [scatter, setScatter] = useState(false);
  const [comboFlash, setComboFlash] = useState<{ value: number; key: number } | null>(null);
  const [powerFlash, setPowerFlash] = useState<{ kind: PowerKind; key: number } | null>(null);

  const commit = useCallback((next: RoundLocal) => {
    roundRef.current = next;
    setRound(next);
    if (optsRef.current.persist && next.key) writeJSON(storageKey(next.key), next, "session");
  }, []);

  const flash = useCallback((name: EffectName, ms: number) => {
    window.clearTimeout(effectTimers.current[name]);
    setEffects((e) => ({ ...e, [name]: true }));
    effectTimers.current[name] = window.setTimeout(() => setEffects((e) => ({ ...e, [name]: false })), ms);
  }, []);

  const finishIfSolved = useCallback((next: RoundLocal, startAt: number): RoundLocal => {
    if (!isSolved(next.board)) return next;
    return { ...next, status: "finished", finishMs: performance.now() - startAt };
  }, []);

  const go = useCallback(() => {
    const o = optsRef.current;
    if (!o.key) return;
    const now = performance.now();
    const next: RoundLocal = {
      ...blank(o.key, o.size),
      status: "playing",
      board: scrambledBoard(o.size, o.seed),
      startAt: now,
      startEpoch: Date.now(),
    };
    lastPlacedAt.current = now;
    commit(next);
    setScatter(true);
    window.setTimeout(() => setScatter(false), 950);
    sound.play("shatter");
    sound.play("go");
    o.onProgress?.(snapshotOf(next), true);
  }, [commit]);

  // שלב חדש
  useEffect(() => {
    const o = optsRef.current;
    const key = o.key;
    if (!key) return;
    setHint(null);
    setTwist(null);
    setMagnet(null);
    setComboFlash(null);
    setPowerFlash(null);
    setEffects(NO_EFFECTS);
    frozenUntil.current = 0;

    if (o.persist) {
      const saved = readJSON<RoundLocal | null>(storageKey(key), null, "session");
      if (saved && saved.key === key && saved.size === o.size && (saved.status === "playing" || saved.status === "finished")) {
        const restored: RoundLocal = { ...saved, startAt: performance.now() - (Date.now() - saved.startEpoch) };
        commit(restored);
        lastPlacedAt.current = performance.now();
        if (restored.status === "finished" && restored.finishMs !== null) {
          o.onFinish?.({ timeMs: restored.finishMs, moves: restored.moves, bestCombo: restored.bestCombo, powersUsed: restored.powersUsed });
        }
        o.onProgress?.(snapshotOf(restored), true);
        return;
      }
    }
    if (o.start === "ended") {
      commit({ ...blank(key, o.size), status: "ended" });
      return;
    }
    if (o.start === "now" || o.countdownMs <= 0) {
      go();
      return;
    }
    commit({ ...blank(key, o.size), status: "countdown", countdownEndsAt: performance.now() + o.countdownMs });
    const timer = window.setTimeout(go, o.countdownMs);
    return () => window.clearTimeout(timer);
  }, [opts.key, commit, go]);

  useEffect(
    () => () => {
      Object.values(effectTimers.current).forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const swap = useCallback(
    (a: number, b: number) => {
      const o = optsRef.current;
      const cur = roundRef.current;
      if (cur.status !== "playing" || a === b) return;
      if (performance.now() < frozenUntil.current) {
        sound.play("locked");
        return;
      }
      if (o.locks && (cur.board[a] === a || cur.board[b] === b)) {
        sound.play("locked");
        return;
      }
      const board = swapSlots(cur.board, a, b);
      const placed = Number(board[a] === a) + Number(board[b] === b);
      const broke = Number(cur.board[a] === a) + Number(cur.board[b] === b);
      const combo = placed > 0 && !broke ? cur.combo + placed : 0;

      let charge = cur.charge;
      let powers = cur.powers;
      let granted: PowerKind | null = null;
      if (o.mischief && placed > 0) {
        charge += placed + (combo >= 3 ? 1 : 0);
        const need = chargeNeeded(o.size);
        while (charge >= need) {
          charge -= need;
          if (powers.length < MAX_POWERS) {
            granted = randomPower();
            powers = [...powers, granted];
          }
        }
      }

      const next = finishIfSolved(
        { ...cur, board, moves: cur.moves + 1, combo, bestCombo: Math.max(cur.bestCombo, combo), charge, powers },
        cur.startAt,
      );
      commit(next);
      const solved = next.status === "finished";

      if (placed > 0) lastPlacedAt.current = performance.now();
      if (solved) sound.play("finish");
      else if (placed === 2) sound.play("double", Math.min(combo, 8));
      else if (placed === 1) sound.play("place", Math.min(combo - 1, 10));
      else sound.play("swap");

      if (!solved && placed > 0 && combo >= 3) {
        setComboFlash({ value: combo, key: performance.now() });
        if (combo % 3 === 0) sound.play("combo", Math.min(combo, 7));
      }
      if (granted) {
        setPowerFlash({ kind: granted, key: performance.now() });
        sound.play("power-ready");
      }
      setHint((h) => (h && (board[h.to] === h.to || h.from === a || h.from === b) ? null : h));

      o.onProgress?.(snapshotOf(next), solved);
      if (solved && next.finishMs !== null) {
        o.onFinish?.({ timeMs: next.finishMs, moves: next.moves, bestCombo: next.bestCombo, powersUsed: next.powersUsed });
      }
    },
    [commit, finishIfSolved],
  );

  const activatePower = useCallback(
    (index: number) => {
      const o = optsRef.current;
      const cur = roundRef.current;
      if (cur.status !== "playing") return;
      const kind = cur.powers[index];
      if (!kind) return;
      let next: RoundLocal = { ...cur, powers: cur.powers.filter((_, i) => i !== index), powersUsed: cur.powersUsed + 1 };

      if (kind === "peek") {
        flash("peek", POWERS.peek.ms);
        sound.play("peek");
      } else if (kind === "magnet") {
        const pair = magnetPair(cur.board);
        if (pair) {
          next = { ...next, board: swapSlots(cur.board, pair[0], pair[1]) };
          setMagnet({ slot: pair[0], key: performance.now() });
          lastPlacedAt.current = performance.now();
        }
        sound.play("magnet");
      } else {
        sound.play("power-send");
      }

      next = finishIfSolved(next, cur.startAt);
      commit(next);
      o.onPowerUsed?.(kind);
      const solved = next.status === "finished";
      o.onProgress?.(snapshotOf(next), solved);
      if (solved && next.finishMs !== null) {
        sound.play("finish");
        o.onFinish?.({ timeMs: next.finishMs, moves: next.moves, bestCombo: next.bestCombo, powersUsed: next.powersUsed });
      }
    },
    [commit, flash, finishIfSolved],
  );

  /** כוח שמישהו שלח אליי. מחזיר true אם השפיע */
  const receivePower = useCallback(
    (kind: PowerKind): boolean => {
      const cur = roundRef.current;
      if (cur.status !== "playing") return false;
      const def = POWERS[kind];
      if (def.target !== "rival") return false;
      switch (kind) {
        case "hearts":
        case "fog":
          flash(kind, def.ms);
          sound.play("power-hit");
          return true;
        case "freeze":
          frozenUntil.current = performance.now() + def.ms;
          flash("freeze", def.ms);
          sound.play("freeze");
          return true;
        case "twist": {
          const pair = twistPair(cur.board);
          if (!pair) return false;
          const next: RoundLocal = { ...cur, board: swapSlots(cur.board, pair[0], pair[1]), combo: 0 };
          commit(next);
          setTwist({ a: pair[0], b: pair[1], key: performance.now() });
          sound.play("power-hit");
          optsRef.current.onProgress?.(snapshotOf(next), false);
          return true;
        }
        default:
          return false;
      }
    },
    [commit, flash],
  );

  /** סוף השלב: הלוח מתחבר לתמונה שלמה */
  const reveal = useCallback(() => {
    const cur = roundRef.current;
    if (cur.status === "ended" || cur.status === "finished") return;
    commit({ ...cur, status: "ended", board: solvedBoard(cur.size) });
    setHint(null);
    setEffects(NO_EFFECTS);
  }, [commit]);

  // רמזים (רמת "בנחת")
  useEffect(() => {
    if (!opts.hints || round.status !== "playing") {
      setHint(null);
      return;
    }
    const timer = window.setInterval(() => {
      const cur = roundRef.current;
      if (cur.status !== "playing") return;
      if (performance.now() - lastPlacedAt.current < 9000) return;
      const move = hintMove(cur.board);
      if (!move) return;
      setHint(move);
      lastPlacedAt.current = performance.now() - 4000;
      window.setTimeout(() => setHint((h) => (h === move ? null : h)), 3500);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [opts.hints, round.status]);

  const placed = countPlaced(round.board);

  return {
    round,
    placed,
    total: round.board.length,
    effects,
    twist,
    magnet,
    hint,
    scatter,
    comboFlash,
    powerFlash,
    swap,
    activatePower,
    receivePower,
    reveal,
  };
}
