import { memo } from "react";
import type { Grid } from "@/game/types";
import { cn } from "@/lib/utils";

/**
 * המפה של היריב/ה: רואים איפה הוא/היא כבר הצליח/ה — אבל לא את התמונה עצמה,
 * כדי שאי אפשר יהיה "להעתיק" ממנה.
 */
export const MiniMap = memo(function MiniMap({
  grid,
  board,
  className,
}: {
  grid: Grid;
  board: number[] | null;
  className?: string;
}) {
  const size = grid.c * grid.r;
  const cells = [];
  for (let slot = 0; slot < size; slot++) {
    const placed = !!board && board.length === size && board[slot] === slot;
    cells.push(
      <div
        key={slot}
        className={cn(
          "rounded-[2px] transition-all duration-300",
          placed ? "scale-100 bg-po shadow-[0_0_8px_hsl(var(--po)/0.75)]" : "scale-90 bg-foreground/[0.09]",
        )}
      />,
    );
  }
  return (
    <div
      dir="ltr"
      aria-hidden
      className={cn("grid aspect-square", Math.max(grid.c, grid.r) >= 7 ? "gap-[1.5px]" : "gap-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${grid.c}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.r}, minmax(0, 1fr))` }}
    >
      {cells}
    </div>
  );
});
