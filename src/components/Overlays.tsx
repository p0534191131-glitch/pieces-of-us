import type { CSSProperties } from "react";
import { useGame } from "@/game/store";
import { cn } from "@/lib/utils";

function hash(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** אימוג'ים שעפים על המסך — שלי מימין, של האחרים משמאל */
export function EmoteLayer() {
  const emotes = useGame((s) => s.emotes);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {emotes.map((e) => (
        <span
          key={e.id}
          className={cn(
            "absolute bottom-[6%] animate-float-up drop-shadow-[0_10px_24px_hsl(var(--background)/0.6)]",
            e.mine ? "text-5xl" : "text-7xl",
          )}
          style={
            {
              [e.mine ? "right" : "left"]: `${6 + hash(e.id, 1) * 24}%`,
              "--dx": `${(hash(e.id, 2) - 0.5) * 140}px`,
              "--rot": `${(hash(e.id, 3) - 0.5) * 50}deg`,
              animationDuration: `${2.3 + hash(e.id, 4)}s`,
            } as CSSProperties
          }
        >
          {e.emoji}
          {!e.mine && e.who && (
            <span className="mt-1 block text-center font-sans text-xs font-semibold text-muted-foreground">{e.who}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function ToastLayer() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "glass max-w-[min(92vw,34rem)] animate-rise-in rounded-full px-5 py-2.5 text-center text-sm font-medium shadow-xl",
            t.tone === "love" && "border-primary/30",
            t.tone === "warn" && "border-gold/40 text-gold",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
