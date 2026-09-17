import confetti from "canvas-confetti";

let heartShape: confetti.Shape | null = null;

/** canvas-confetti מקבל רק HEX — ממירים מהטוקנים של המערכת כדי לא לקבע צבעים */
function tokenHex(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const match = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!match) return "#ffffff";
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

export function celebrate(kind: "round" | "match" | "record") {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  heartShape ??= confetti.shapeFromPath({
    path: "M167 72c19,-38 37,-56 75,-56 42,0 76,33 76,75 0,76 -76,151 -151,227 -76,-76 -151,-151 -151,-227 0,-42 33,-75 75,-75 38,0 57,18 76,56z",
  });
  const colors = ["--primary", "--gold", "--player-violet", "--foreground"].map(tokenHex);
  const base = { colors, shapes: [heartShape, "circle" as const], scalar: 1.25, zIndex: 90 };

  if (kind === "round" || kind === "record") {
    void confetti({ ...base, particleCount: kind === "record" ? 140 : 90, spread: 85, startVelocity: 40, origin: { y: 0.62 } });
    return;
  }
  const end = Date.now() + 2200;
  const frame = () => {
    void confetti({ ...base, particleCount: 5, angle: 60, spread: 62, origin: { x: 0, y: 0.72 } });
    void confetti({ ...base, particleCount: 5, angle: 120, spread: 62, origin: { x: 1, y: 0.72 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
