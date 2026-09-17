import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Grid } from "@/game/types";
import { cn } from "@/lib/utils";
import { sound } from "@/lib/sound";
import "./puzzle.css";

interface PuzzleBoardProps {
  grid: Grid;
  photoUrl?: string;
  board: number[];
  /** חלקים שהגיעו למקום ננעלים ונדלקים */
  locks: boolean;
  interactive: boolean;
  merged?: boolean;
  scatter?: boolean;
  solved?: boolean;
  hint?: { from: number; to: number } | null;
  twist?: { a: number; b: number; key: number } | null;
  magnet?: { slot: number; key: number } | null;
  onSwap: (a: number, b: number) => void;
  className?: string;
  children?: ReactNode;
}

interface DragState {
  pointerId: number;
  slot: number;
  piece: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  left: number;
  top: number;
  active: boolean;
  over: number | null;
}

/** החלק זז לפי גודלו שלו, כך שאותו נוסח עובד גם ללוחות מלבניים */
export function slotTransform(slot: number, cols: number): string {
  return `translate3d(${(slot % cols) * 100}%, ${Math.floor(slot / cols) * 100}%, 0)`;
}

const tileGap = (max: number) => (max <= 3 ? 3 : max <= 6 ? 2 : max <= 12 ? 1.5 : 1);
const tileRadius = (max: number) => (max <= 3 ? 14 : max <= 6 ? 9 : max <= 12 ? 5 : 3);

function restartClass(el: HTMLElement | null | undefined, cls: string, ms: number) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}

/**
 * לוח הפאזל: גוררים חלק על חלק כדי להחליף, או לוחצים על שניהם.
 * כל חלק הוא אלמנט קבוע (לפי מספר החלק) שזז בין משבצות ב-transform — כך ההחלפות מונפשות בחינם.
 * הגרירה עצמה מעדכנת את ה-DOM ישירות, בלי רינדור של React בכל תזוזת עכבר.
 */
export const PuzzleBoard = memo(function PuzzleBoard({
  grid,
  photoUrl,
  board,
  locks,
  interactive,
  merged,
  scatter,
  solved,
  hint,
  twist,
  magnet,
  onSwap,
  className,
  children,
}: PuzzleBoardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<DragState | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const prevBoard = useRef(board);
  const [selected, setSelected] = useState<number | null>(null);
  const { c: cols, r: rows } = grid;
  const size = cols * rows;

  const slotOf = useMemo(() => {
    const slots = new Array<number>(board.length);
    board.forEach((piece, slot) => {
      slots[piece] = slot;
    });
    return slots;
  }, [board]);

  useEffect(() => {
    if (!interactive) setSelected(null);
  }, [interactive]);

  // ברק על חלקים שננעלו עכשיו
  useLayoutEffect(() => {
    const prev = prevBoard.current;
    prevBoard.current = board;
    if (prev.length !== board.length || !locks || merged) return;
    for (let slot = 0; slot < board.length; slot++) {
      if (board[slot] === slot && prev[slot] !== slot) restartClass(tiles.current[slot], "pz-flash", 760);
    }
  }, [board, locks, merged]);

  useLayoutEffect(() => {
    if (!twist) return;
    for (const slot of [twist.a, twist.b]) restartClass(tiles.current[boardRef.current[slot]], "pz-twist", 950);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twist?.key]);

  useLayoutEffect(() => {
    if (magnet) restartClass(tiles.current[magnet.slot], "pz-magnet", 950);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magnet?.key]);

  const isLocked = (slot: number) => locks && boardRef.current[slot] === slot;

  const slotAt = (clientX: number, clientY: number): number | null => {
    const root = rootRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || y < 0 || x >= 1 || y >= 1) return null;
    return Math.floor(y * rows) * cols + Math.floor(x * cols);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const slot = slotAt(e.clientX, e.clientY);
    if (slot === null) return;
    if (!interactive) return;
    if (isLocked(slot)) {
      restartClass(tiles.current[slot], "pz-wiggle", 300);
      sound.play("locked");
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;
    drag.current = {
      pointerId: e.pointerId,
      slot,
      piece: boardRef.current[slot],
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left - (slot % cols) * cellW,
      offsetY: e.clientY - rect.top - Math.floor(slot / cols) * cellH,
      left: rect.left,
      top: rect.top,
      active: false,
      over: null,
    };
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 7) return;
      d.active = true;
      tiles.current[d.piece]?.classList.add("pz-dragging");
      setSelected(null);
      sound.play("pick");
    }
    const el = tiles.current[d.piece];
    if (el) {
      el.style.transform = `translate3d(${e.clientX - d.left - d.offsetX}px, ${e.clientY - d.top - d.offsetY}px, 0) scale(1.07)`;
    }
    const over = slotAt(e.clientX, e.clientY);
    const valid = over !== null && over !== d.slot && !isLocked(over) ? over : null;
    if (valid !== d.over) {
      if (d.over !== null) tiles.current[boardRef.current[d.over]]?.classList.remove("pz-drop-target");
      if (valid !== null) tiles.current[boardRef.current[valid]]?.classList.add("pz-drop-target");
      d.over = valid;
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    try {
      rootRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d.over !== null) tiles.current[boardRef.current[d.over]]?.classList.remove("pz-drop-target");

    if (!d.active) {
      if (cancelled || !interactive) return;
      if (selected === null) {
        setSelected(d.slot);
        sound.play("pick");
      } else if (selected === d.slot) {
        setSelected(null);
        sound.play("drop");
      } else {
        const from = selected;
        setSelected(null);
        if (!isLocked(from)) onSwap(from, d.slot);
      }
      return;
    }

    const el = tiles.current[d.piece];
    if (el) {
      el.classList.remove("pz-dragging");
      restartClass(el, "pz-settling", 280);
      // מחזירים את השליטה ל-React: אם הייתה החלפה, הרינדור הבא יעביר את החלק למשבצת החדשה בהנפשה
      el.style.transform = slotTransform(d.slot, cols);
    }
    if (!cancelled && d.over !== null && interactive) onSwap(d.slot, d.over);
    else sound.play("drop");
  };

  const biggest = Math.max(cols, rows);
  const style = { "--gap": `${tileGap(biggest)}px`, "--r": `${tileRadius(biggest)}px` } as CSSProperties;
  const tileW = `${100 / cols}%`;
  const tileH = `${100 / rows}%`;
  const bgSize = `${cols * 100}% ${rows * 100}%`;
  const image = photoUrl ? `url("${photoUrl}")` : undefined;

  const pieces: ReactNode[] = [];
  for (let piece = 0; piece < size; piece++) {
    const slot = slotOf[piece] ?? piece;
    const col = piece % cols;
    const row = Math.floor(piece / cols);
    pieces.push(
      <div
        key={piece}
        ref={(el) => {
          tiles.current[piece] = el;
        }}
        className={cn(
          "pz-tile",
          locks && slot === piece && "pz-placed",
          selected === slot && "pz-selected",
          hint?.from === slot && "pz-hint",
        )}
        style={{
          width: tileW,
          height: tileH,
          transform: slotTransform(slot, cols),
          transitionDelay: scatter ? `${(piece * 53) % 280}ms` : undefined,
        }}
      >
        <div
          className="pz-piece"
          style={{
            backgroundImage: image,
            backgroundSize: bgSize,
            backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
          }}
        />
      </div>,
    );
  }

  return (
    <div
      ref={rootRef}
      dir="ltr"
      role="grid"
      aria-label={`פאזל של ${size} חלקים`}
      className={cn(
        "pz-board",
        merged && "pz-merged",
        scatter && "pz-scatter",
        solved && "pz-solved",
        interactive ? "pz-live" : "pz-idle",
        className,
      )}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {pieces}
      {hint && (
        <div className="pz-hint-target" style={{ width: tileW, height: tileH, transform: slotTransform(hint.to, cols) }} />
      )}
      {children}
    </div>
  );
});
