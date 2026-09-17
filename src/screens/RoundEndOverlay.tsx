import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { COLOR_VAR } from "@/game/constants";
import { hostForceNext, sendNext } from "@/game/controller";
import { useGame } from "@/game/store";
import { say } from "@/game/text";
import { pieces, type MatchState, type PlayerRoundStats, type PlayerState, type RoundResult } from "@/game/types";
import { celebrate } from "@/lib/confetti";
import { formatDuration, formatSecondsShort, percent } from "@/lib/format";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";

export interface RecordInfo {
  roundId: string;
  isRecord: boolean;
  previous: number | null;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function RoundEndOverlay({
  match,
  result,
  me,
  record,
}: {
  match: MatchState;
  result: RoundResult;
  me: PlayerState;
  record: RecordInfo | null;
}) {
  const assets = useGame((s) => s.assets);
  const role = useGame((s) => s.role);
  const photoUrl = assets[result.photoId];
  const count = pieces(result.grid);
  const winner = match.players[result.winner];
  const ranking = result.ranking.filter((slot) => match.players[slot]);
  // הכרטיס הולך למי שסיים/ה אחרון/ה מבין מי שעדיין בחדר
  const ranked = ranking.map((slot) => match.players[slot]);
  const last = [...ranked].reverse().find((p) => p.connected) ?? ranked[ranked.length - 1] ?? null;
  const iWon = result.winner === me.slot;
  const myPlace = Math.max(1, ranking.indexOf(me.slot) + 1);
  // מי שנכנס/ה לחדר באמצע השלב עוד לא נמצא/ת בתוצאות שלו
  const mine: PlayerRoundStats = result.stats[me.slot] ?? {
    finished: false,
    timeMs: null,
    moves: 0,
    progress: 0,
    bestCombo: 0,
    powersUsed: 0,
  };
  const duel = match.players.length === 2;
  const rival = duel ? (match.players.find((p) => p.pid !== me.pid) ?? null) : null;
  const rivalStats = rival ? result.stats[rival.slot] : null;
  const isLast = result.index + 1 >= match.grids.length;
  const nextGrid = match.grids[result.index + 1];
  const iAmReady = match.nextReady[me.slot];
  const live = match.players.filter((p) => p.connected);
  const readyCount = live.filter((p) => match.nextReady[p.slot]).length;
  const alone = live.filter((p) => p.pid !== me.pid);
  const waitingFor = alone.length === 1 ? alone[0] : null;
  const newRecord = !!record?.isRecord && record.previous !== null;
  const winnerTime = result.stats[result.winner]?.timeMs ?? null;
  const gap = mine.timeMs !== null && winnerTime !== null ? mine.timeMs - winnerTime : null;

  // רגע לראות את הלוח מתחבר לתמונה שלמה — ורק אז הכרטיס
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const t = window.setTimeout(() => setVisible(true), 1100);
    return () => window.clearTimeout(t);
  }, [result.roundId]);

  useEffect(() => {
    if (!visible) return;
    if (iWon) window.setTimeout(() => celebrate(newRecord ? "record" : "round"), 150);
    if (newRecord) window.setTimeout(() => sound.play("record"), 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const headline = iWon ? "ניצחת בשלב! 🏆" : `${winner.name} ${say(winner.gender, "לקח", "לקחה")} את השלב`;
  let subline = "";
  if (duel && rivalStats) {
    const diff = mine.timeMs !== null && rivalStats.timeMs !== null ? Math.abs(mine.timeMs - rivalStats.timeMs) : null;
    if (diff !== null) subline = iWon ? `מהר יותר ב־${formatSecondsShort(diff)} שניות` : `רק ${formatSecondsShort(diff)} שניות הפרידו ביניכם`;
    else if (iWon && rival) subline = `${rival.name} ${say(rival.gender, "הגיע", "הגיעה")} ל־${percent(rivalStats.progress)}`;
    else subline = `הגעת ל־${percent(mine.progress)} — השלב הבא שלך!`;
  } else if (iWon) {
    subline = `${match.players.length} שחקנים, ואתם הראשונים`;
  } else if (gap !== null) {
    subline = `מקום ${myPlace} · ${formatSecondsShort(gap)} שניות אחרי`;
  } else {
    subline = `מקום ${myPlace} מתוך ${match.players.length} · הגעת ל־${percent(mine.progress)}`;
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="glass w-full max-w-3xl animate-rise-in overflow-hidden rounded-[2rem]">
          <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="relative overflow-hidden bg-background/40">
              {photoUrl && (
                <>
                  <img
                    src={photoUrl}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
                  />
                  <div className="relative grid h-full place-items-center p-4 pt-12 md:p-5 md:pt-12">
                    <img
                      src={photoUrl}
                      alt="התמונה שהרכבתם"
                      className="aspect-square w-full max-w-[22rem] animate-[kenburns_1.6s_cubic-bezier(.2,.8,.2,1)_both] rounded-2xl object-cover shadow-2xl ring-1 ring-foreground/15"
                    />
                  </div>
                </>
              )}
              <span className="chip absolute start-3 top-3 bg-background/60">
                שלב {result.index + 1} · {count} חלקים
              </span>
            </div>

            <div className="p-5 sm:p-7">
              <div className="flex items-center gap-4">
                <PlayerAvatar player={winner} size="lg" crown />
                <div className="min-w-0">
                  <div className="font-display text-2xl font-black leading-tight sm:text-3xl">{headline}</div>
                  {subline && <div className="mt-1 text-sm text-muted-foreground">{subline}</div>}
                </div>
              </div>

              {newRecord && <div className="chip mt-4 border-gold/50 bg-gold/10 text-gold">🏅 שיא אישי חדש ל־{count} חלקים!</div>}

              <div className="mt-5 space-y-2">
                {ranking.map((slot, i) => (
                  <StandingRow
                    key={match.players[slot].pid}
                    place={i + 1}
                    player={match.players[slot]}
                    stats={result.stats[slot]}
                    score={match.scores[slot] ?? 0}
                    isMe={match.players[slot].pid === me.pid}
                  />
                ))}
              </div>

              {last && (
                <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/10 p-4">
                  <div className="text-xs font-semibold text-primary">
                    💌 כרטיס אהבה ל{last.pid === me.pid ? "ך" : last.name}
                  </div>
                  <div className="mt-2 flex items-start gap-3">
                    <span className="text-3xl leading-none">{result.card.emoji}</span>
                    <p className="font-display text-xl leading-snug">{result.card.text}</p>
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  size="lg"
                  variant={iAmReady ? "secondary" : "default"}
                  disabled={iAmReady}
                  onClick={() => {
                    sendNext(result.roundId);
                    sound.play("ready");
                  }}
                >
                  {iAmReady
                    ? waitingFor
                      ? `ממתינים ל${waitingFor.name}…`
                      : `ממתינים לשאר… ${readyCount}/${live.length}`
                    : isLast
                      ? "לתוצאות הסופיות 🏆"
                      : `${say(me.gender, "מוכן", "מוכנה", "מוכן/ה")} לשלב הבא · ${nextGrid ? pieces(nextGrid) : ""} חלקים`}
                </Button>
                {!iAmReady && live.length > 1 && (
                  <div className="text-center text-xs text-muted-foreground">
                    {waitingFor
                      ? match.nextReady[waitingFor.slot]
                        ? `${waitingFor.name} ${say(waitingFor.gender, "מוכן", "מוכנה", "מוכן/ה")} ✓`
                        : `${waitingFor.name} עוד עם הכרטיס…`
                      : readyCount
                        ? `${readyCount} מתוך ${live.length} כבר מוכנים`
                        : "כולם עוד עם הכרטיס…"}
                  </div>
                )}
                {role === "host" && iAmReady && readyCount < live.length && (
                  <button
                    type="button"
                    onClick={hostForceNext}
                    className="mx-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    להמשיך בלי לחכות
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StandingRow({
  place,
  player,
  stats,
  score,
  isMe,
}: {
  place: number;
  player: PlayerState;
  stats: PlayerRoundStats;
  score: number;
  isMe: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-2.5",
        place === 1 ? "border-gold/40 bg-gold/10" : "border-foreground/10 bg-foreground/[0.04]",
        isMe && place !== 1 && "border-pc/40",
      )}
    >
      <span className="w-6 shrink-0 text-center text-lg">{MEDALS[place - 1] ?? place}</span>
      <PlayerAvatar player={player} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{isMe ? `${player.name} (אני)` : player.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {stats.moves} מהלכים · רצף {stats.bestCombo}
          {stats.powersUsed ? ` · ${stats.powersUsed === 1 ? "כוח אחד" : `${stats.powersUsed} כוחות`}` : ""}
        </div>
      </div>
      <div className="text-end">
        <div className="tabular font-display text-lg font-black leading-none">
          {stats.timeMs !== null ? formatDuration(stats.timeMs) : percent(stats.progress)}
        </div>
        <div
          className="tabular mt-1 text-[11px] text-muted-foreground"
          title="שלבים שנוצחו"
          style={{ color: `hsl(${COLOR_VAR[player.color]})` }}
        >
          🏆 {score}
        </div>
      </div>
    </div>
  );
}
