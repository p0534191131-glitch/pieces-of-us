import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RoundStatus } from "@/game/usePuzzleRound";
import { formatClock } from "@/lib/format";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";

type Effects = Record<"hearts" | "fog" | "freeze" | "peek", boolean>;

export function BoardEffects({ effects, photoUrl }: { effects: Effects; photoUrl?: string }) {
  return (
    <>
      {effects.fog && <div className="fx-layer fx-fog" />}
      {effects.hearts && <HeartsRain />}
      {effects.freeze && (
        <div className="fx-layer fx-freeze grid place-items-center">
          <div className="animate-pop-in text-center">
            <div className="text-6xl drop-shadow-lg">🧊</div>
            <div className="mt-1 font-display text-2xl font-bold text-ice">קפוא!</div>
          </div>
        </div>
      )}
      {effects.peek && photoUrl && <div className="fx-layer fx-peek" style={{ backgroundImage: `url("${photoUrl}")` }} />}
    </>
  );
}

function HeartsRain() {
  const hearts = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        left: Math.random() * 96,
        size: 18 + Math.random() * 40,
        delay: Math.random() * 1.7,
        duration: 1.5 + Math.random() * 1.6,
        rot: (Math.random() - 0.5) * 90,
        emoji: ["💖", "💘", "💕", "❤️", "💗"][i % 5],
      })),
    [],
  );
  return (
    <div className="fx-layer bg-primary/10">
      {hearts.map((h, i) => (
        <span
          key={i}
          className="fx-heart"
          style={
            {
              left: `${h.left}%`,
              fontSize: h.size,
              animationDelay: `${h.delay}s`,
              animationDuration: `${h.duration}s`,
              "--rot": `${h.rot}deg`,
            } as CSSProperties
          }
        >
          {h.emoji}
        </span>
      ))}
    </div>
  );
}

/** 3, 2, 1 — עם דופק לב. בזמן הזה רואים את התמונה השלמה: שננו אותה! */
export function CountdownOverlay({ endsAt, caption }: { endsAt: number; caption: string }) {
  const [step, setStep] = useState(() => Math.max(0, Math.ceil((endsAt - performance.now() - 200) / 1000)));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const left = endsAt - performance.now();
      const next = Math.max(0, Math.ceil((left - 200) / 1000));
      setStep((s) => (s === next ? s : next));
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);

  useEffect(() => {
    if (step > 0) sound.play("heartbeat");
  }, [step]);

  return (
    <div className="fx-layer grid place-items-center bg-[radial-gradient(circle,hsl(var(--background)/0.15),hsl(var(--background)/0.55))]">
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-background/80 to-transparent p-4 text-center text-sm font-semibold sm:text-base">
        {caption}
      </div>
      <div
        key={step}
        className="animate-count-in font-display text-[clamp(5rem,22vmin,11rem)] font-black leading-none text-foreground drop-shadow-[0_0_40px_hsl(var(--primary)/0.8)]"
      >
        {step > 0 ? step : "צאו!"}
      </div>
    </div>
  );
}

export function FinishedOverlay({ timeMs }: { timeMs: number | null }) {
  return (
    <div className="fx-layer grid place-items-center bg-background/35">
      <div className="glass animate-pop-in rounded-3xl px-6 py-4 text-center">
        <div className="text-4xl">✨</div>
        <div className="mt-1 font-display text-2xl font-bold">סיימת!</div>
        {timeMs !== null && <div className="isolate-ltr tabular mt-1 text-lg text-gold">{formatClock(timeMs)}</div>}
        <div className="mt-1 text-xs text-muted-foreground">בודקים מי היה ראשון…</div>
      </div>
    </div>
  );
}

/** שעון המירוץ — מתעדכן ישירות ב-DOM, בלי לרנדר את כל המסך 60 פעם בשנייה */
export function RaceClock({
  status,
  startAt,
  finishMs,
  className,
}: {
  status: RoundStatus;
  startAt: number;
  finishMs: number | null;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (status !== "playing") {
      el.textContent = finishMs !== null ? formatClock(finishMs) : status === "ended" ? "—" : "0:00.0";
      return;
    }
    let raf = 0;
    let lastText = "";
    const tick = () => {
      const text = formatClock(performance.now() - startAt);
      if (text !== lastText) {
        el.textContent = text;
        lastText = text;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, startAt, finishMs]);
  return (
    <span ref={ref} className={cn("isolate-ltr tabular font-bold", className)}>
      0:00.0
    </span>
  );
}
