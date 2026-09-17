import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoHeart } from "@/components/LogoHeart";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SoundToggles } from "@/components/SoundToggles";
import { COLOR_VAR, WISHES } from "@/game/constants";
import { hostBackToLobby, leaveRoom, patchMe } from "@/game/controller";
import { useGame } from "@/game/store";
import { say } from "@/game/text";
import { pieces, type PlayerState, type RoundResult, type Slot } from "@/game/types";
import { celebrate } from "@/lib/confetti";
import { formatDuration } from "@/lib/format";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { ConnectingScreen, LeaveButton } from "./shared";

const MEDALS = ["🥇", "🥈", "🥉"];

function wishFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return WISHES[h % WISHES.length];
}

function totals(results: RoundResult[], slot: Slot) {
  let won = 0;
  let time = 0;
  let finished = 0;
  let moves = 0;
  let best = 0;
  let powers = 0;
  for (const r of results) {
    const s = r.stats[slot];
    if (!s) continue;
    if (r.winner === slot) won++;
    if (s.timeMs !== null) {
      time += s.timeMs;
      finished++;
    }
    moves += s.moves;
    best = Math.max(best, s.bestCombo);
    powers += s.powersUsed;
  }
  return { won, time, finished, moves, best, powers };
}

export default function MatchEndScreen() {
  const match = useGame((s) => s.match);
  const pid = useGame((s) => s.pid);
  const role = useGame((s) => s.role);
  const assets = useGame((s) => s.assets);

  useEffect(() => {
    const t = window.setTimeout(() => celebrate("match"), 400);
    return () => window.clearTimeout(t);
  }, [match?.matchId]);

  const me = match?.players.find((p) => p.pid === pid) ?? null;
  if (!match || !me) return <ConnectingScreen />;

  const stats = match.players.map((p) => totals(match.results, p.slot));
  const board = match.players
    .map((p) => ({ player: p, score: match.scores[p.slot] ?? 0, total: stats[p.slot] }))
    .sort((a, b) => b.score - a.score || (a.total.finished ? a.total.time : Infinity) - (b.total.finished ? b.total.time : Infinity));
  const topScore = board[0]?.score ?? 0;
  const champions = board.filter((row) => row.score === topScore);
  const tie = champions.length > 1;
  const winner = tie ? null : champions[0]?.player ?? null;
  const runnersUp = board.filter((row) => row.score !== topScore).map((row) => row.player);
  const prize = winner ? winner.wish || wishFor(match.matchId) : null;
  const duel = match.players.length === 2;
  const owes = duel ? runnersUp[0] ?? null : null;
  const notes = match.notes ?? [];
  const rematchCount = match.players.filter((p) => p.connected && p.rematch).length;
  const liveCount = match.players.filter((p) => p.connected).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-5 sm:px-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoHeart animated={false} className="h-8 w-8" />
          <span className="font-display text-lg font-bold">חלקים מאיתנו</span>
        </div>
        <div className="flex items-center">
          <SoundToggles />
          <LeaveButton />
        </div>
      </header>

      <section className="mt-8 text-center">
        {winner ? (
          <PlayerAvatar player={winner} size="xl" crown className="mx-auto animate-heartbeat" />
        ) : (
          <div className="flex flex-wrap justify-center gap-3">
            {champions.map((row) => (
              <PlayerAvatar key={row.player.pid} player={row.player} size="xl" className="animate-heartbeat" />
            ))}
          </div>
        )}
        <p className="mt-6 text-sm text-muted-foreground">
          {match.grids.length} שלבים · {match.grids.map((g) => pieces(g)).join(" ← ")} חלקים · {match.players.length} שחקנים
        </p>
        <h1 className="mt-2 font-display text-[clamp(2.3rem,6vw,4.2rem)] font-black leading-tight">
          {winner ? (
            <>
              <span className="text-love">{winner.name}</span> {say(winner.gender, "האלוף", "האלופה", "האלופ/ה")} של הערב
            </>
          ) : (
            <span className="text-love">תיקו! {duel ? "שניכם מנצחים" : "מנצחים יחד"} 💞</span>
          )}
        </h1>

        <div dir="ltr" className="mt-6 flex flex-wrap items-end justify-center gap-x-5 gap-y-4">
          {board.map((row, i) => (
            <div key={row.player.pid} className="text-center">
              <div className="text-sm">{MEDALS[i] ?? ""}</div>
              <div
                className="tabular font-display text-[clamp(2.5rem,9vw,4.5rem)] font-black leading-none"
                style={{ color: `hsl(${COLOR_VAR[row.player.color]})` }}
              >
                {row.score}
              </div>
              <div dir="rtl" className="mt-2 max-w-[8rem] truncate text-sm text-muted-foreground">
                {row.player.avatar} {row.player.name}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass mx-auto mt-8 max-w-2xl animate-rise-in rounded-3xl p-6 text-center">
        <div className="text-sm font-semibold text-gold">🎁 הפרס</div>
        {winner ? (
          <p className="mt-3 font-display text-2xl leading-snug sm:text-3xl">
            {owes ? (
              <>
                {owes.name} {say(owes.gender, "חייב", "חייבת", "חייב/ת")} ל{winner.name}:
              </>
            ) : (
              <>כולם חייבים ל{winner.name}:</>
            )}
            <br />
            <span className="text-love">{prize}</span>
          </p>
        ) : (
          <div className="mt-3 font-display text-2xl leading-snug">
            כל המנצחים מקבלים את מה שביקשו
            <div className="mt-3 space-y-1 text-lg">
              {champions.map((row) => (
                <div key={row.player.pid}>
                  {row.player.avatar} {row.player.name}: <span className="text-love">{row.player.wish || "חיבוק ארוך 🤗"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {notes.some((text) => text.trim()) && (
        <section className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {match.players.map((p) =>
            notes[p.slot]?.trim() ? <SecretNote key={p.pid} from={p} text={notes[p.slot]} mine={p.pid === me.pid} /> : null,
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold">האלבום של הערב</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {match.results.map((result) => (
            <AlbumCard key={result.roundId} result={result} photoUrl={assets[result.photoId]} players={match.players} />
          ))}
        </div>
      </section>

      <section className="glass mt-10 overflow-x-auto rounded-3xl p-5 sm:p-6">
        <h2 className="font-display text-2xl font-bold">המספרים</h2>
        <table className="mt-4 w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-2 text-start font-medium">שחקן/ית</th>
              <th className="py-2 text-center font-medium">שלבים</th>
              <th className="py-2 text-center font-medium">זמן בשלבים שהושלמו</th>
              <th className="py-2 text-center font-medium">מהלכים</th>
              <th className="py-2 text-center font-medium">הרצף הכי ארוך</th>
              {match.settings.mischief && <th className="py-2 text-center font-medium">כוחות</th>}
            </tr>
          </thead>
          <tbody>
            {board.map((row, i) => (
              <tr key={row.player.pid} className="border-t border-foreground/10">
                <td className="py-2.5">
                  <span className="me-1">{MEDALS[i] ?? ""}</span>
                  <span className="me-1">{row.player.avatar}</span>
                  <span className="font-semibold">{row.player.name}</span>
                </td>
                <td className="tabular py-2.5 text-center font-semibold">{row.score}</td>
                <td className="tabular whitespace-nowrap py-2.5 text-center font-semibold">
                  {row.total.finished ? formatDuration(row.total.time) : "—"}
                </td>
                <td className="tabular py-2.5 text-center font-semibold">{row.total.moves}</td>
                <td className="tabular py-2.5 text-center font-semibold">{row.total.best}</td>
                {match.settings.mischief && <td className="tabular py-2.5 text-center font-semibold">{row.total.powers}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="sticky bottom-4 z-30 mt-10 flex flex-col items-center gap-2">
        {rematchCount > 0 && !me.rematch && (
          <span className="chip animate-pop-in border-primary/40 bg-background/80">
            🔥 {rematchCount} מתוך {liveCount} רוצים ריוואנש
          </span>
        )}
        <div className="glass flex flex-wrap items-center justify-center gap-2 rounded-full p-2">
          <Button
            size="lg"
            variant={me.rematch ? "secondary" : "default"}
            onClick={() => {
              patchMe({ rematch: !me.rematch });
              sound.play("ready");
            }}
          >
            {me.rematch ? `ממתינים לשאר… ${rematchCount}/${liveCount}` : "ריוואנש! 🔁"}
          </Button>
          {role === "host" && (
            <Button size="lg" variant="outline" onClick={hostBackToLobby}>
              ללובי
            </Button>
          )}
          <Button size="lg" variant="ghost" onClick={() => leaveRoom()}>
            יציאה
          </Button>
        </div>
      </div>
    </div>
  );
}

function SecretNote({ from, text, mine }: { from: PlayerState; text: string; mine: boolean }) {
  const [open, setOpen] = useState(mine);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => {
        if (open) return;
        setOpen(true);
        sound.play("record");
      }}
      className={cn(
        "glass group relative w-full overflow-hidden rounded-3xl p-6 text-start transition",
        !open && "hover:-translate-y-1 hover:border-primary/40",
      )}
    >
      {open ? (
        <div className="animate-rise-in">
          <div className="text-xs text-muted-foreground">{mine ? "הפתק שכתבת" : `💌 פתק סודי מ${from.name}`}</div>
          <p className="mt-3 whitespace-pre-wrap break-words font-display text-2xl leading-relaxed">{text}</p>
          <div className="mt-3 text-end text-2xl">{from.avatar}</div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <span className="text-5xl transition group-hover:scale-110 group-hover:-rotate-6">💌</span>
          <div>
            <div className="font-display text-xl font-bold">יש פתק סודי מ{from.name}</div>
            <div className="text-sm text-muted-foreground">לחיצה כדי לפתוח</div>
          </div>
        </div>
      )}
    </button>
  );
}

function AlbumCard({ result, photoUrl, players }: { result: RoundResult; photoUrl?: string; players: PlayerState[] }) {
  const winner = players[result.winner];
  const time = result.stats[result.winner]?.timeMs ?? null;
  return (
    <figure className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-foreground/10">
      {photoUrl && (
        <img src={photoUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
      )}
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/50 to-transparent p-2.5 pt-8">
        <div className="text-[11px] text-muted-foreground">
          שלב {result.index + 1} · {pieces(result.grid)} חלקים
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
          <span>{winner?.avatar}</span>
          <span className="truncate">{winner?.name}</span>
          {time !== null && <span className="ms-auto whitespace-nowrap text-xs text-gold">{formatDuration(time)}</span>}
        </div>
      </figcaption>
    </figure>
  );
}
