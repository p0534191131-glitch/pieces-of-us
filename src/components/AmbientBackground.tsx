import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  a: number;
  color: string;
  heart: boolean;
  phase: number;
}

/** רקע חי: הילות רכות וחלקיקי אור ולבבות קטנים שעולים לאט. במשחק עצמו — נרגע כדי לא להסיח. */
export function AmbientBackground({ calm = false }: { calm?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calmRef = useRef(calm);
  calmRef.current = calm;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const styles = getComputedStyle(document.documentElement);
    const palette = ["--primary", "--gold", "--player-violet"].map((v) => styles.getPropertyValue(v).trim());

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const make = (initial: boolean): Particle => ({
      x: Math.random() * width,
      y: initial ? Math.random() * height : height + 24,
      r: 0.8 + Math.random() * 2.6,
      vy: 0.12 + Math.random() * 0.34,
      vx: (Math.random() - 0.5) * 0.12,
      a: 0.14 + Math.random() * 0.44,
      color: palette[Math.floor(Math.random() * palette.length)],
      heart: Math.random() < 0.22,
      phase: Math.random() * Math.PI * 2,
    });
    const count = Math.round(Math.max(24, Math.min(70, (width * height) / 26000)));
    const particles = Array.from({ length: count }, () => make(true));

    const heart = (x: number, y: number, s: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.3);
      ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
      ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
      ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
      ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
      ctx.fill();
    };

    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return;
      const dt = last ? Math.min(3, (t - last) / 16.7) : 1;
      last = t;
      ctx.clearRect(0, 0, width, height);
      const dim = calmRef.current ? 0.4 : 1;
      for (const p of particles) {
        p.y -= p.vy * dt;
        p.x += p.vx * dt + Math.sin(t / 1800 + p.phase) * 0.15;
        if (p.y < -24) Object.assign(p, make(false));
        const alpha = p.a * (0.65 + 0.35 * Math.sin(t / 900 + p.phase)) * dim;
        if (p.heart) {
          ctx.fillStyle = `hsl(${p.color} / ${alpha})`;
          heart(p.x, p.y, p.r * 3.2);
        } else {
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
          glow.addColorStop(0, `hsl(${p.color} / ${alpha})`);
          glow.addColorStop(1, `hsl(${p.color} / 0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const start = () => {
      if (reduced) return;
      cancelAnimationFrame(raf);
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="ambient-base absolute inset-0" />
      <div className={cn("ambient-orb ambient-orb-rose", calm && "opacity-50")} />
      <div className={cn("ambient-orb ambient-orb-gold", calm && "opacity-50")} />
      <div className={cn("ambient-orb ambient-orb-violet", calm && "opacity-40")} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="ambient-vignette absolute inset-0" />
    </div>
  );
}
