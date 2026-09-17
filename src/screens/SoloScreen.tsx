import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountdownOverlay, RaceClock } from "@/components/game/BoardOverlays";
import { PuzzleBoard } from "@/components/game/PuzzleBoard";
import { PhotoPicker } from "@/components/PhotoPicker";
import { SoundToggles } from "@/components/SoundToggles";
import { ASSISTS, COLOR_VAR, LADDER } from "@/game/constants";
import { goHome, libraryThumb, loadLibrary, toast } from "@/game/controller";
import { useGame } from "@/game/store";
import { pieces, type AssistLevel } from "@/game/types";
import { usePuzzleRound } from "@/game/usePuzzleRound";
import { celebrate } from "@/lib/confetti";
import { formatClock, formatDuration } from "@/lib/format";
import { loadImage } from "@/lib/image";
import { pick, randomSeed, uid } from "@/lib/random";
import { sound } from "@/lib/sound";
import { getRecord, submitRecord } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./shared";

interface SoloSession {
  key: string;
  /** אינדקס בסולם השלבים */
  level: number;
  seed: number;
  url: string;
  assist: AssistLevel;
}

interface SoloResult {
  timeMs: number;
  moves: number;
  isRecord: boolean;
  previous: number | null;
}

export default function SoloScreen() {
  const library = useGame((s) => s.library);
  const libraryReady = useGame((s) => s.libraryReady);
  const profile = useGame((s) => s.profile);
  const [level, setLevel] = useState(1);
  const [assist, setAssist] = useState<AssistLevel>(1);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [session, setSession] = useState<SoloSession | null>(null);
  const [result, setResult] = useState<SoloResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const owner = profile.name.trim() || "אני";
  const activeGrid = LADDER[session?.level ?? level];
  const activeSize = pieces(activeGrid);

  useEffect(() => {
    void loadLibrary();
  }, []);

  const game = usePuzzleRound({
    key: session?.key ?? null,
    size: activeSize,
    seed: session?.seed ?? 1,
    countdownMs: 2200,
    start: "countdown",
    locks: (session?.assist ?? assist) >= 1,
    hints: (session?.assist ?? assist) === 2,
    mischief: false,
    persist: false,
    onFinish: (res) => {
      if (!session) return;
      const rec = submitRecord(owner, pieces(LADDER[session.level]), res.timeMs);
      setResult({ timeMs: res.timeMs, moves: res.moves, ...rec });
      window.setTimeout(() => celebrate(rec.isRecord ? "record" : "round"), 300);
      if (rec.isRecord && rec.previous !== null) window.setTimeout(() => sound.play("record"), 800);
    },
  });

  useEffect(() => {
    if (!result) {
      setShowResult(false);
      return;
    }
    const t = window.setTimeout(() => setShowResult(true), 1000);
    return () => window.clearTimeout(t);
  }, [result]);

  const begin = async (nextLevel: number) => {
    const chosen = photoId ? library.find((p) => p.id === photoId) : pick(library);
    if (!chosen) {
      toast("אין תמונות — העלו תמונה או הוסיפו לתיקייה", "warn");
      return;
    }
    const url = libraryThumb(chosen);
    if (!url) return;
    try {
      await loadImage(url);
    } catch {
      toast("התמונה לא נטענה, נסו אחרת", "warn");
      return;
    }
    setResult(null);
    setLevel(nextLevel);
    setSession({ key: uid(8), level: nextLevel, seed: randomSeed(), url, assist });
  };

  const selected = photoId ? library.find((p) => p.id === photoId) : undefined;
  const selectedThumb = selected ? libraryThumb(selected) : null;

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5 sm:px-6" style={{ "--pc": COLOR_VAR[profile.color] } as CSSProperties}>
        <header className="flex items-center justify-between">
          <Button variant="ghost" onClick={goHome}>
            <ArrowRight /> חזרה
          </Button>
          <SoundToggles />
        </header>

        <div className="glass mt-6 animate-rise-in rounded-[2rem] p-6 sm:p-8">
          <h1 className="font-display text-4xl font-black">אימון לבד 🧩</h1>
          <p className="mt-2 text-muted-foreground">מתחממים לפני המירוץ ושוברים שיאים אישיים.</p>

          <div className="mt-6">
            <FieldLabel>כמה חלקים · השיא שלך</FieldLabel>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {LADDER.map((g, i) => {
                const count = pieces(g);
                const best = getRecord(owner, count);
                return (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={level === i}
                    onClick={() => setLevel(i)}
                    className={cn(
                      "rounded-2xl border py-3 text-center transition",
                      level === i ? "border-pc bg-pc/15" : "border-foreground/10 hover:bg-foreground/5",
                    )}
                  >
                    <div className="tabular text-lg font-bold">{count}</div>
                    <div className="isolate-ltr tabular text-[11px] text-muted-foreground">{best ? formatClock(best) : "—"}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <FieldLabel>רמת עזרה</FieldLabel>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([0, 1, 2] as AssistLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  aria-pressed={assist === lvl}
                  onClick={() => setAssist(lvl)}
                  className={cn(
                    "rounded-2xl border p-3 text-center transition",
                    assist === lvl ? "border-pc bg-pc/15" : "border-foreground/10 hover:bg-foreground/5",
                  )}
                >
                  <div className="text-2xl">{ASSISTS[lvl].emoji}</div>
                  <div className="mt-1 text-sm font-semibold">{ASSISTS[lvl].name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>תמונה</FieldLabel>
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              {selectedThumb ? <img src={selectedThumb} alt="" className="h-6 w-6 rounded-md object-cover" /> : "🎁"}
              {selected ? selected.label : "הפתעה"}
            </Button>
          </div>

          <Button size="xl" className="mt-8 w-full" disabled={!libraryReady || !library.length} onClick={() => void begin(level)}>
            מתחילים
          </Button>
          {libraryReady && !library.length && (
            <p className="mt-3 text-center text-sm text-gold">אין תמונות עדיין — העלו תמונה דרך בחירת התמונה.</p>
          )}
        </div>

        <PhotoPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="תמונה לאימון"
          selectedId={photoId}
          onSelect={(id) => {
            setPhotoId(id);
            setPickerOpen(false);
          }}
        />
      </div>
    );
  }

  const status = game.round.status;
  const best = getRecord(owner, activeSize);
  const hasBigger = session.level < LADDER.length - 1;

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ "--pc": COLOR_VAR[profile.color] } as CSSProperties}>
      <header className="flex items-center justify-between gap-3 px-3 py-2 sm:px-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSession(null);
            setResult(null);
          }}
        >
          <ArrowRight /> הגדרות
        </Button>
        <div className="text-sm font-semibold">אימון · {activeSize} חלקים</div>
        <SoundToggles />
      </header>

      <main className="flex flex-1 flex-col items-center gap-3 px-3 pb-4 lg:flex-row lg:justify-center lg:gap-6 lg:px-6">
        <aside className="glass order-3 w-full rounded-3xl p-4 lg:order-1 lg:w-[17rem] lg:self-stretch lg:p-5">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["מהלכים", game.round.moves],
              ["רצף", game.round.combo],
              ["שיא רצף", game.round.bestCombo],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-foreground/[0.05] px-2 py-1.5">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="tabular text-lg font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-foreground/[0.05] px-3 py-2 text-sm">
            <span className="text-muted-foreground">השיא שלך</span>
            <span className="isolate-ltr tabular font-bold text-gold">{best ? formatClock(best) : "—"}</span>
          </div>
          {session.assist >= 1 && (
            <figure className="mt-4 hidden lg:block">
              <figcaption className="mb-1.5 text-xs text-muted-foreground">התמונה המקורית</figcaption>
              <img src={session.url} alt="" className="aspect-square w-full rounded-2xl object-cover ring-1 ring-foreground/10" />
            </figure>
          )}
        </aside>

        <section className="order-2 flex flex-col items-center gap-2">
          <RaceClock
            status={status}
            startAt={game.round.startAt}
            finishMs={game.round.finishMs}
            className={cn("text-3xl sm:text-4xl", status === "finished" && "text-gold")}
          />
          <div className="play-board relative">
            <PuzzleBoard
              key={session.key}
              grid={activeGrid}
              photoUrl={session.url}
              board={game.round.board}
              locks={session.assist >= 1}
              interactive={status === "playing"}
              merged={status !== "playing"}
              scatter={game.scatter}
              solved={status === "finished"}
              hint={game.hint}
              onSwap={game.swap}
            >
              {status === "countdown" && <CountdownOverlay endsAt={game.round.countdownEndsAt} caption="שננו את התמונה!" />}
            </PuzzleBoard>
          </div>
        </section>

        <div className="order-1 hidden lg:order-3 lg:block lg:w-[17rem]" />
      </main>

      {result && showResult && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="glass w-full max-w-sm animate-rise-in rounded-[2rem] p-7 text-center">
            <div className="text-5xl">{result.isRecord ? "🏅" : "✨"}</div>
            <div className="mt-2 font-display text-3xl font-black">
              {result.isRecord ? (result.previous === null ? "השיא הראשון שלך!" : "שיא אישי חדש!") : "כל הכבוד!"}
            </div>
            <div className="tabular mt-3 font-display text-5xl font-black">
              <span className="text-love">{formatDuration(result.timeMs)}</span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {result.moves} מהלכים
              {result.previous !== null && !result.isRecord && ` · השיא: ${formatDuration(result.previous)}`}
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Button size="lg" onClick={() => void begin(session.level)}>
                <RotateCcw /> שוב
              </Button>
              {hasBigger && (
                <Button size="lg" variant="gold" onClick={() => void begin(session.level + 1)}>
                  כפול חלקים · {pieces(LADDER[session.level + 1])} חלקים
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setSession(null);
                  setResult(null);
                }}
              >
                הגדרות
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
