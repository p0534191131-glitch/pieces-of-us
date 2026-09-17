import { LogoHeart } from "@/components/LogoHeart";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useGame } from "@/game/store";
import { pieces } from "@/game/types";
import { say } from "@/game/text";
import { cn } from "@/lib/utils";
import { CenteredScreen, ConnectingScreen } from "./shared";

export default function PreparingScreen() {
  const match = useGame((s) => s.match);
  const loading = useGame((s) => s.assetsLoading);
  if (!match) return <ConnectingScreen />;
  const live = match.players.filter((p) => p.connected);
  const ready = live.filter((p) => p.assetsReady).length;
  const pct = loading ? loading.done / Math.max(1, loading.total) : ready / Math.max(1, live.length);

  return (
    <CenteredScreen>
      <LogoHeart className="mx-auto h-28 w-28" />
      <h2 className="mt-5 font-display text-3xl font-bold">מכינים את התמונות…</h2>
      <p className="mt-2 text-sm text-muted-foreground">מפרקים לחלקים, מחממים את הלבבות.</p>
      <div className="mt-6 space-y-2">
        {match.players.map((p) => (
          <div key={p.pid} className="flex items-center gap-3 rounded-2xl bg-foreground/[0.05] p-2.5">
            <PlayerAvatar player={p} size="sm" />
            <span className="flex-1 truncate text-start font-semibold">{p.name}</span>
            <span className={cn("text-sm", p.assetsReady ? "text-success" : "animate-soft-pulse text-muted-foreground")}>
              {p.assetsReady ? `✓ ${say(p.gender, "מוכן", "מוכנה", "מוכן/ה")}` : "טוען…"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-gradient-to-l from-primary to-gold transition-[width] duration-300"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <div className="mt-4 text-xs text-muted-foreground">{match.grids.map((g) => pieces(g)).join(" ← ")} חלקים</div>
    </CenteredScreen>
  );
}
