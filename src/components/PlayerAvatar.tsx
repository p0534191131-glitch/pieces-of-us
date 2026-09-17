import type { CSSProperties } from "react";
import { COLOR_VAR } from "@/game/constants";
import type { PlayerColor } from "@/game/types";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-9 w-9 text-lg",
  md: "h-12 w-12 text-2xl",
  lg: "h-16 w-16 text-[2rem]",
  xl: "h-24 w-24 text-5xl",
};

interface AvatarLike {
  avatar: string;
  color: PlayerColor;
  connected?: boolean;
}

export function PlayerAvatar({
  player,
  size = "md",
  showStatus = false,
  crown = false,
  className,
}: {
  player: AvatarLike;
  size?: keyof typeof SIZES;
  showStatus?: boolean;
  crown?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full", SIZES[size], className)}
      style={{ "--ac": COLOR_VAR[player.color] } as CSSProperties}
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,hsl(var(--ac)/0.5),hsl(var(--ac)/0.12)_70%)] shadow-[0_0_0_2px_hsl(var(--ac)/0.9),0_0_22px_-2px_hsl(var(--ac)/0.7)]" />
      <span className="relative select-none leading-none">{player.avatar}</span>
      {crown && (
        <span className="absolute -top-[0.55em] left-1/2 -translate-x-1/2 -rotate-6 text-[0.62em] drop-shadow-lg">👑</span>
      )}
      {showStatus && (
        <span
          className={cn(
            "absolute bottom-0 end-0 h-3 w-3 rounded-full border-2 border-background",
            player.connected ? "bg-success" : "animate-soft-pulse bg-muted-foreground",
          )}
          aria-label={player.connected ? "מחובר/ת" : "מנותק/ת"}
        />
      )}
    </div>
  );
}
