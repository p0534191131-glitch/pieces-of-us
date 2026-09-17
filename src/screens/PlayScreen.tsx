import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BoardEffects, CountdownOverlay, FinishedOverlay, RaceClock } from "@/components/game/BoardOverlays";
import { MiniMap } from "@/components/game/MiniMap";
import { PuzzleBoard } from "@/components/game/PuzzleBoard";
import { LogoHeart } from "@/components/LogoHeart";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ProgressRing } from "@/components/ProgressRing";
import { SoundToggles } from "@/components/SoundToggles";
import { ASSISTS, COLOR_VAR, EMOTES, POWERS } from "@/game/constants";
import { consumePower, sendEmote, sendFinish, sendPeer, sendPower, toast } from "@/game/controller";
import { useGame, type OpponentLive } from "@/game/store";
import { say } from "@/game/text";
import { pieces, type Grid, type MatchState, type PlayerState, type PowerKind } from "@/game/types";
import { chargeNeeded, usePuzzleRound, type ProgressSnapshot } from "@/game/usePuzzleRound";
import { percent } from "@/lib/format";
import { sound } from "@/lib/sound";
import { submitRecord } from "@/lib/storage";
import { cn } from "@/lib/utils";
import RoundEndOverlay, { type RecordInfo } from "./RoundEndOverlay";
import { LeaveButton, NetBadge } from "./shared";

type Game = ReturnType<typeof usePuzzleRound>;

interface Rival {
  player: PlayerState;
  live: OpponentLive | null;
  progress: number;
}

/** עדכוני התקדמות לשאר השחקנים — עד ~9 בשנייה, ותמיד מיד בסיום */
function useProgressSender(roundId: string | undefined) {
  const last = useRef(0);
  const timer = useRef(0);
  const latest = useRef<ProgressSnapshot | null>(null);
  const idRef = useRef(roundId);
  idRef.current = roundId;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return useCallback((snap: ProgressSnapshot, force: boolean) => {
    latest.current = snap;
    const send = () => {
      const s = latest.current;
      const id = idRef.current;
      if (!s || !id) return;
      last.current = performance.now();
      sendPeer({ k: "progress", roundId: id, ...s });
    };
    window.clearTimeout(timer.current);
    const elapsed = performance.now() - last.current;
    if (force || elapsed > 110) send();
    else timer.current = window.setTimeout(send, 110 - elapsed);
  }, []);
}

export default function PlayScreen() {
  const match = useGame((s) => s.match);
  const pid = useGame((s) => s.pid);
  const assets = useGame((s) => s.assets);
  const opponents = useGame((s) => s.opponents);
  const powerInbox = useGame((s) => s.powerInbox);
  const net = useGame((s) => s.net);

  const round = match?.round ?? null;
  const roundId = round?.id;
  const phase = match?.phase ?? "lobby";
  const me = match?.players.find((p) => p.pid === pid) ?? null;
  const photoUrl = round ? assets[round.photoId] : undefined;
  const grid: Grid = round?.grid ?? { c: 3, r: 3 };
  const size = pieces(grid);

  // היריבים לפי סדר ההתקדמות — הראשון הוא מי שהכי קרוב לסיום
  const rivals = useMemo<Rival[]>(() => {
    if (!match) return [];
    return match.players
      .filter((p) => p.pid !== pid)
      .map((player) => {
        const raw = opponents[player.pid];
        const live = raw && roundId && raw.roundId === roundId ? raw : null;
        return { player, live, progress: live ? live.correct / Math.max(1, live.total) : 0 };
      })
      .sort((a, b) => b.progress - a.progress || Number(b.player.connected) - Number(a.player.connected));
  }, [match, opponents, pid, roundId]);
  const leader = rivals[0] ?? null;
  const rivalsRef = useRef(rivals);
  rivalsRef.current = rivals;

  const sendProgress = useProgressSender(roundId);
  const [record, setRecord] = useState<RecordInfo | null>(null);
  const [incoming, setIncoming] = useState<{ kind: PowerKind; key: number; from: PlayerState } | null>(null);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null);
  const milestones = useRef(new Set<number>());

  const game = usePuzzleRound({
    key: roundId ?? null,
    size,
    seed: round?.seed ?? 1,
    countdownMs: round?.countdownMs ?? 3000,
    start: phase === "countdown" ? "countdown" : phase === "playing" ? "now" : "ended",
    locks: (me?.assist ?? 1) >= 1,
    hints: me?.assist === 2,
    mischief: !!match?.settings.mischief,
    persist: true,
    onProgress: sendProgress,
    onFinish: (result) => {
      if (!round || !me) return;
      sendFinish(round.id, result);
      setRecord({ roundId: round.id, ...submitRecord(me.name, pieces(round.grid), result.timeMs) });
    },
    onPowerUsed: (kind) => {
      if (!round) return;
      if (POWERS[kind].target !== "rival") {
        sendPower(round.id, kind, null);
        return;
      }
      // כוח התקפה הולך למי שמוביל/ה במירוץ
      const target = rivalsRef.current.find((r) => r.player.connected) ?? rivalsRef.current[0] ?? null;
      sendPower(round.id, kind, target?.player.pid ?? null);
      if (target && rivalsRef.current.length > 1) {
        toast(`${POWERS[kind].emoji} ${POWERS[kind].name} → ${target.player.name}`, "info", 2000);
      }
    },
  });

  const status = game.round.status;
  const myProgress = game.placed / Math.max(1, game.total);
  const topRivalProgress = leader?.progress ?? 0;

  // כוחות ששאר השחקנים שלחו
  const { receivePower, reveal, activatePower } = game;
  useEffect(() => {
    if (!powerInbox.length || !match) return;
    for (const event of powerInbox) {
      consumePower(event.id);
      if (event.roundId !== roundId) continue;
      const from = match.players.find((p) => p.pid === event.from);
      if (!from) continue;
      const def = POWERS[event.kind];
      if (def.target === "self") {
        toast(`${from.avatar} ${from.name} ${say(from.gender, "הפעיל", "הפעילה")} ${def.emoji} ${def.name}`, "info", 2200);
        continue;
      }
      if (event.target && event.target !== pid) {
        const at = match.players.find((p) => p.pid === event.target);
        if (at) toast(`${from.avatar} ${from.name} → ${def.emoji} → ${at.avatar} ${at.name}`, "info", 2000);
        continue;
      }
      if (receivePower(event.kind)) setIncoming({ kind: event.kind, key: performance.now(), from });
    }
  }, [powerInbox, match, pid, roundId, receivePower]);

  // סוף השלב — הלוח מתחבר לתמונה שלמה
  useEffect(() => {
    if (phase !== "roundEnd") return;
    const t = window.setTimeout(reveal, 450);
    return () => window.clearTimeout(t);
  }, [phase, roundId, reveal]);

  // מוזיקה שנעשית דחופה כשהמירוץ צמוד וקרוב לסוף
  useEffect(() => {
    if (status !== "playing") {
      sound.setTension(0);
      return;
    }
    const top = Math.max(myProgress, topRivalProgress);
    const closeness = 1 - Math.min(1, Math.abs(myProgress - topRivalProgress) * 2.5);
    sound.setTension(Math.max(0, (top - 0.45) / 0.55) * (0.55 + 0.45 * closeness));
  }, [status, myProgress, topRivalProgress]);
  useEffect(() => () => sound.setTension(0), []);

  // התראות כשמישהו מתקרב לסוף
  useEffect(() => {
    milestones.current = new Set();
  }, [roundId]);
  useEffect(() => {
    if (!leader || status !== "playing" || !leader.live) return;
    const name = leader.player.name;
    const marks: Array<[number, string]> = [
      [0.5, `${name} כבר בחצי הדרך!`],
      [0.75, `${name} ב־75%… לחץ! ⚡`],
      [0.9, `${name} ${say(leader.player.gender, "כמעט סיים", "כמעט סיימה", "כמעט סיים/ה")}! 😱`],
    ];
    for (const [mark, text] of marks) {
      if (leader.progress >= mark && !milestones.current.has(mark)) {
        milestones.current.add(mark);
        setBanner({ text, key: performance.now() });
        sound.play("milestone");
      }
    }
  }, [leader, status]);

  // מקלדת: 1 / 2 / רווח מפעילים כוחות
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (e.code === "Digit1" || e.code === "Numpad1") activatePower(0);
      else if (e.code === "Digit2" || e.code === "Numpad2") activatePower(1);
      else if (e.code === "Space" && !(target instanceof HTMLButtonElement)) {
        e.preventDefault();
        activatePower(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activatePower]);

  useEffect(() => {
    if (!incoming) return;
    const t = window.setTimeout(() => setIncoming(null), 2400);
    return () => window.clearTimeout(t);
  }, [incoming]);

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 2300);
    return () => window.clearTimeout(t);
  }, [banner]);

  if (!match || !round || !me) return null;

  const result = match.results.find((r) => r.roundId === round.id) ?? null;
  const interactive = status === "playing" && phase !== "roundEnd" && !game.effects.freeze;
  const comboEmoji = game.comboFlash ? (game.comboFlash.value >= 9 ? " 👑" : game.comboFlash.value >= 6 ? " ⚡" : " 🔥") : "";

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col"
      style={{ "--pc": COLOR_VAR[me.color], "--po": leader ? COLOR_VAR[leader.player.color] : COLOR_VAR.gold } as CSSProperties}
    >
      <PlayHeader match={match} me={me} net={net} />

      <main className="flex flex-1 flex-col items-center gap-3 px-3 pb-4 pt-1 lg:flex-row lg:items-center lg:justify-center lg:gap-6 lg:px-6">
        <MyPanel className="order-3 lg:order-1" me={me} game={game} size={size} photoUrl={photoUrl} mischief={match.settings.mischief} />

        <section className="order-2 flex w-full flex-col items-center gap-2 lg:w-auto">
          <div className="relative flex h-11 items-center justify-center">
            <RaceClock
              status={status}
              startAt={game.round.startAt}
              finishMs={game.round.finishMs}
              className={cn("text-3xl sm:text-4xl", status === "finished" && "text-gold")}
            />
            {game.comboFlash && (
              <div
                key={game.comboFlash.key}
                className="combo-pop absolute start-full top-0 ms-4 whitespace-nowrap font-display text-xl font-black text-gold"
              >
                רצף ×{game.comboFlash.value}
                {comboEmoji}
              </div>
            )}
          </div>

          <div className="play-board relative">
            <PuzzleBoard
              key={round.id}
              grid={grid}
              photoUrl={photoUrl}
              board={game.round.board}
              locks={me.assist >= 1}
              interactive={interactive}
              merged={status !== "playing"}
              scatter={game.scatter}
              solved={status === "finished"}
              hint={game.hint}
              twist={game.twist}
              magnet={game.magnet}
              onSwap={game.swap}
            >
              <BoardEffects effects={game.effects} photoUrl={photoUrl} />
              {status === "countdown" && (
                <CountdownOverlay
                  endsAt={game.round.countdownEndsAt}
                  caption={`שלב ${round.index + 1} · ${size} חלקים — שננו את התמונה!`}
                />
              )}
              {status === "finished" && phase !== "roundEnd" && <FinishedOverlay timeMs={game.round.finishMs} />}
              {!photoUrl && (
                <div className="fx-layer grid place-items-center text-sm text-muted-foreground">טוענים את התמונה…</div>
              )}
            </PuzzleBoard>

            {incoming && (
              <div className="pointer-events-none absolute inset-x-0 -top-3 z-[65] flex justify-center px-2">
                <div
                  key={incoming.key}
                  className="glass animate-pop-in rounded-full border-primary/40 px-4 py-2 text-center text-sm font-semibold shadow-xl"
                >
                  {incoming.from.avatar} {incoming.from.name} {say(incoming.from.gender, "שלח", "שלחה")} לך{" "}
                  {POWERS[incoming.kind].emoji} {POWERS[incoming.kind].name}!
                </div>
              </div>
            )}
            {banner && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[65] flex justify-center px-2">
                <div key={banner.key} className="glass animate-pop-in rounded-full px-4 py-2 text-center text-sm font-semibold">
                  {banner.text}
                </div>
              </div>
            )}
          </div>
        </section>

        <RivalsPanel className="order-1 lg:order-3" rivals={rivals} grid={grid} />
      </main>

      {phase === "roundEnd" && result && (
        <RoundEndOverlay match={match} result={result} me={me} record={record?.roundId === round.id ? record : null} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PlayHeader({ match, me, net }: { match: MatchState; me: PlayerState; net: ReturnType<typeof useGame.getState>["net"] }) {
  const round = match.round;
  if (!round) return null;
  return (
    <header className="relative z-20 flex items-center justify-between gap-3 px-3 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <LogoHeart animated={false} className="h-8 w-8 shrink-0" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">
            <span className="sm:hidden">
              שלב {round.index + 1}/{match.grids.length}
            </span>
            <span className="hidden sm:inline">
              שלב {round.index + 1} מתוך {match.grids.length}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{pieces(round.grid)} חלקים</div>
        </div>
        <NetBadge net={net} />
      </div>
      <div className="hidden md:block">
        <LevelTrack match={match} />
      </div>
      <div className="flex items-center gap-1">
        <ScoreStrip match={match} me={me} />
        <SoundToggles />
        <LeaveButton />
      </div>
    </header>
  );
}

function LevelTrack({ match }: { match: MatchState }) {
  const current = match.round?.index ?? -1;
  return (
    <ol className="flex items-center gap-1.5" aria-label="השלבים">
      {match.grids.map((grid, i) => {
        const result = match.results.find((r) => r.index === i);
        const winner = result ? match.players[result.winner] : null;
        const isCurrent = i === current && !result;
        const count = pieces(grid);
        return (
          <li
            key={i}
            title={`שלב ${i + 1}: ${count} חלקים`}
            className={cn(
              "tabular grid h-8 min-w-[2.25rem] place-items-center rounded-full px-2 text-xs font-bold transition-all",
              isCurrent
                ? "scale-110 bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.55)]"
                : result
                  ? "bg-foreground/10"
                  : "bg-foreground/[0.05] text-muted-foreground",
            )}
          >
            {winner ? <span className="text-base leading-none">{winner.avatar}</span> : count}
          </li>
        );
      })}
    </ol>
  );
}

/** התוצאה: דו-קרב מוצג כ"2 : 1", ובקבוצה — רשימת מובילים */
function ScoreStrip({ match, me }: { match: MatchState; me: PlayerState }) {
  if (match.players.length === 2) {
    const [host, guest] = match.players;
    return (
      <div dir="ltr" className="chip shrink-0 gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-sm sm:gap-2 sm:px-3" title="שלבים שנוצחו">
        <span>{host?.avatar}</span>
        <span className="tabular whitespace-nowrap font-bold">
          {match.scores[0]} : {match.scores[1]}
        </span>
        <span>{guest?.avatar}</span>
      </div>
    );
  }
  const ranked = match.players
    .map((p) => ({ p, score: match.scores[p.slot] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.p.slot - b.p.slot);
  const top = ranked.slice(0, 3);
  const mine = ranked.find((r) => r.p.pid === me.pid);
  const showMine = mine && !top.includes(mine);
  return (
    <div dir="ltr" className="chip shrink-0 gap-1.5 whitespace-nowrap px-2 py-1.5 text-xs sm:gap-2 sm:px-2.5 sm:text-sm" title="שלבים שנוצחו">
      {top.map(({ p, score }, i) => (
        // במסך צר מציגים את שני המובילים בלבד
        <span key={p.pid} className={cn("flex items-center gap-1", i >= 2 && "hidden sm:flex")}>
          <span>{p.avatar}</span>
          <span className="tabular font-bold" style={{ color: `hsl(${COLOR_VAR[p.color]})` }}>
            {score}
          </span>
        </span>
      ))}
      {showMine && (
        <span className="flex items-center gap-1 border-s border-foreground/15 ps-2">
          <span>{mine.p.avatar}</span>
          <span className="tabular font-bold">{mine.score}</span>
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-foreground/[0.05] px-2 py-1.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn("tabular text-lg font-bold transition-colors", highlight && "text-gold")}>{value}</dd>
    </div>
  );
}

function MyPanel({
  me,
  game,
  size,
  photoUrl,
  mischief,
  className,
}: {
  me: PlayerState;
  game: Game;
  size: number;
  photoUrl?: string;
  mischief: boolean;
  className?: string;
}) {
  const { round } = game;
  const progress = game.placed / Math.max(1, game.total);
  const showReference = me.assist >= 1 && !!photoUrl;
  return (
    <aside className={cn("glass w-full rounded-3xl p-3 sm:p-4 lg:w-[17rem] lg:self-stretch lg:p-5", className)}>
      <div className="flex items-center gap-3">
        <PlayerAvatar player={me} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{me.name}</div>
          <div className="text-xs text-muted-foreground">
            {ASSISTS[me.assist].emoji} {ASSISTS[me.assist].name}
          </div>
        </div>
        {showReference && (
          <img src={photoUrl} alt="התמונה המקורית" className="h-12 w-12 rounded-xl object-cover ring-1 ring-foreground/15 lg:hidden" />
        )}
        <div className="isolate-ltr tabular text-xl font-black text-pc">{percent(progress)}</div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-gradient-to-l from-pc to-gold transition-[width] duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="מהלכים" value={round.moves} />
        <Stat label="רצף" value={round.combo} highlight={round.combo >= 3} />
        <Stat label="שיא רצף" value={round.bestCombo} />
      </dl>

      {mischief && (
        <PowerSlots
          powers={round.powers}
          charge={round.charge}
          need={chargeNeeded(size)}
          onUse={game.activatePower}
          flashKey={game.powerFlash?.key ?? 0}
          disabled={round.status !== "playing"}
        />
      )}

      {showReference && (
        <figure className="mt-4 hidden lg:block">
          <figcaption className="mb-1.5 text-xs text-muted-foreground">התמונה המקורית</figcaption>
          <img src={photoUrl} alt="" className="aspect-square w-full rounded-2xl object-cover shadow-lg ring-1 ring-foreground/10" />
        </figure>
      )}
    </aside>
  );
}

function PowerSlots({
  powers,
  charge,
  need,
  onUse,
  flashKey,
  disabled,
}: {
  powers: PowerKind[];
  charge: number;
  need: number;
  onUse: (index: number) => void;
  flashKey: number;
  disabled: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>😈 כוחות</span>
        <span>מקשים 1 · 2</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[0, 1].map((i) => {
          const kind = powers[i];
          const def = kind ? POWERS[kind] : null;
          return (
            <button
              key={def ? `${i}-${kind}-${flashKey}` : `${i}-empty`}
              type="button"
              disabled={!def || disabled}
              onClick={() => onUse(i)}
              title={def ? `${def.name} — ${def.desc}` : "ממלאים את המד כדי לקבל כוח"}
              className={cn(
                "relative flex h-[4.25rem] flex-col items-center justify-center rounded-2xl border px-1 text-center transition",
                def
                  ? "animate-pop-in border-pc/50 bg-pc/10 shadow-[0_0_24px_-6px_hsl(var(--pc)/0.7)] enabled:hover:-translate-y-0.5 enabled:hover:bg-pc/20"
                  : "border-dashed border-foreground/15 text-muted-foreground/60",
              )}
            >
              {def ? (
                <>
                  <span className="text-2xl leading-none">{def.emoji}</span>
                  <span className="mt-1 text-[11px] font-semibold leading-tight">{def.name}</span>
                </>
              ) : (
                <span className="text-xs">ריק</span>
              )}
              <kbd className="absolute start-2 top-1 font-sans text-[10px] text-muted-foreground">{i + 1}</kbd>
            </button>
          );
        })}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" title="מד כוח">
        <div
          className="h-full rounded-full bg-gradient-to-l from-gold to-primary transition-[width] duration-300"
          style={{ width: `${Math.min(1, charge / need) * 100}%` }}
        />
      </div>
    </div>
  );
}

function rivalStatus(rival: Rival): string {
  const g = rival.player.gender;
  if (!rival.player.connected) return `${say(g, "מנותק", "מנותקת", "מנותק/ת")}…`;
  if (rival.progress >= 1) return `${say(g, "סיים", "סיימה", "סיים/ה")}! 🏁`;
  if (rival.progress >= 0.9) return "כמעט שם! 😱";
  if (rival.progress >= 0.5) return "בחצי השני 🔥";
  if (rival.live) return `${rival.live.moves} מהלכים`;
  return say(g, "מתחיל…", "מתחילה…", "מתחיל/ה…");
}

function RivalsPanel({ rivals, grid, className }: { rivals: Rival[]; grid: Grid; className?: string }) {
  if (!rivals.length) return <div className={cn("hidden lg:block lg:w-[17rem]", className)} />;
  const duel = rivals.length === 1;

  return (
    <aside className={cn("glass w-full rounded-3xl p-3 sm:p-4 lg:w-[17rem] lg:self-stretch lg:p-5", className)}>
      {duel ? (
        <DuelRival rival={rivals[0]} grid={grid} />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>מי מוביל/ה</span>
            <span>{rivals.length} יריבים</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {rivals.map((rival, i) => (
              <RivalRow key={rival.player.pid} rival={rival} first={i === 0} />
            ))}
          </div>
        </>
      )}
      <EmoteBar many={!duel} name={rivals[0]?.player.name ?? ""} className="mt-3 hidden sm:block lg:mt-5" />
    </aside>
  );
}

/** אחד על אחד — מקבלים את המפה המלאה של היריב/ה */
function DuelRival({ rival, grid }: { rival: Rival; grid: Grid }) {
  const { player, live, progress } = rival;
  const status = rivalStatus(rival);
  return (
    <>
      <div className="flex items-center gap-3 lg:hidden">
        <ProgressRing value={progress} size={52} stroke={5}>
          <PlayerAvatar player={player} size="sm" showStatus />
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{player.name}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <div className="isolate-ltr tabular text-xl font-black text-po">{percent(progress)}</div>
        <MiniMap grid={grid} board={live?.board ?? null} className="w-12" />
      </div>

      <div className="hidden flex-col items-center text-center lg:flex">
        <ProgressRing value={progress} size={128} stroke={9}>
          <PlayerAvatar player={player} size="lg" showStatus />
        </ProgressRing>
        <div className="mt-3 max-w-full truncate font-display text-xl font-bold">{player.name}</div>
        <div className="isolate-ltr tabular mt-0.5 text-3xl font-black text-po">{percent(progress)}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{status}</div>
        <MiniMap grid={grid} board={live?.board ?? null} className="mt-4 w-40" />
        {live && live.combo >= 3 && <div className="chip mt-3 border-gold/40 text-gold">🔥 רצף ×{live.combo}</div>}
      </div>
    </>
  );
}

function RivalRow({ rival, first }: { rival: Rival; first: boolean }) {
  const { player, progress } = rival;
  return (
    <div
      className={cn(
        "flex min-w-[9rem] shrink-0 items-center gap-2.5 rounded-2xl border p-2 transition lg:min-w-0 lg:shrink",
        first ? "border-gold/40 bg-gold/[0.07]" : "border-foreground/10 bg-foreground/[0.04]",
      )}
      style={{ "--po": COLOR_VAR[player.color] } as CSSProperties}
    >
      <ProgressRing value={progress} size={42} stroke={4}>
        <PlayerAvatar player={player} size="sm" showStatus />
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-bold">{player.name}</span>
          {first && progress > 0 && <span className="text-xs">👑</span>}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{rivalStatus(rival)}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full bg-po transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="isolate-ltr tabular text-sm font-black text-po">{percent(progress)}</div>
    </div>
  );
}

function EmoteBar({ many, name, className }: { many: boolean; name: string; className?: string }) {
  const last = useRef(0);
  return (
    <div className={className}>
      <div className="mb-1.5 hidden text-center text-xs text-muted-foreground lg:block">{many ? "שליחה לכולם" : `שליחה ל${name}`}</div>
      <div className="flex justify-center gap-1">
        {EMOTES.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`שליחת ${emoji}`}
            onClick={() => {
              const now = performance.now();
              if (now - last.current < 450) return;
              last.current = now;
              sendEmote(emoji);
            }}
            className="grid h-9 w-9 place-items-center rounded-full text-xl transition hover:scale-125 hover:bg-foreground/10 active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
