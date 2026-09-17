import { mulberry32 } from "@/lib/random";

/** board[slot] = piece. הלוח פתור כאשר board[i] === i לכל i */
export type Board = number[];

export function solvedBoard(size: number): Board {
  return Array.from({ length: size }, (_, i) => i);
}

/** אותו seed = אותו ערבוב בכל המחשבים. אף חלק לא מתחיל במקומו. */
export function scrambledBoard(size: number, seed: number): Board {
  const rng = mulberry32(seed);
  const board = solvedBoard(size);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  for (let guard = 0; guard < size * 8; guard++) {
    const fixed = board.findIndex((piece, slot) => piece === slot);
    if (fixed < 0) break;
    let j = Math.floor(rng() * (size - 1));
    if (j >= fixed) j++;
    [board[fixed], board[j]] = [board[j], board[fixed]];
  }
  return board;
}

export function swapSlots(board: Board, a: number, b: number): Board {
  const next = board.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function countPlaced(board: Board): number {
  let count = 0;
  for (let i = 0; i < board.length; i++) if (board[i] === i) count++;
  return count;
}

export function isSolved(board: Board): boolean {
  return board.length > 0 && countPlaced(board) === board.length;
}

export function misplacedSlots(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] !== i) out.push(i);
  return out;
}

/** מגנט: [המשבצת שתקבל את החלק שלה, המשבצת שבה החלק הזה נמצא עכשיו] */
export function magnetPair(board: Board, rng: () => number = Math.random): [number, number] | null {
  const wrong = misplacedSlots(board);
  if (!wrong.length) return null;
  const target = wrong[Math.floor(rng() * wrong.length)];
  return [target, board.indexOf(target)];
}

/** סחרור: שתי משבצות שגויות שהחלפתן לא מקדמת אף אחת מהן */
export function twistPair(board: Board, rng: () => number = Math.random): [number, number] | null {
  const wrong = misplacedSlots(board);
  if (wrong.length < 3) return null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = wrong[Math.floor(rng() * wrong.length)];
    const b = wrong[Math.floor(rng() * wrong.length)];
    if (a !== b && board[b] !== a && board[a] !== b) return [a, b];
  }
  return null;
}

/** רמז: חלק שלא במקומו, והמשבצת שהוא שייך אליה */
export function hintMove(board: Board, rng: () => number = Math.random): { from: number; to: number } | null {
  const wrong = misplacedSlots(board);
  if (!wrong.length) return null;
  const from = wrong[Math.floor(rng() * wrong.length)];
  return { from, to: board[from] };
}
