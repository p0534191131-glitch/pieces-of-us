import { useId } from "react";
import { cn } from "@/lib/utils";

const HEART = "M50 88C20 68 0 50 0 28 0 12 12 0 27 0c11 0 19 6 23 14C54 6 62 0 73 0c15 0 27 12 27 28 0 22-20 40-50 60z";

/** הלב שבנוי מארבעה חלקי פאזל — מתפרק ומתחבר בלולאה, עם דופק כשהוא שלם */
export function LogoHeart({ className, animated = true }: { className?: string; animated?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradient = `${uid}-grad`;
  const glow = `${uid}-glow`;
  const box = { x: -14, y: -14, width: 128, height: 118 };

  const pieces = [
    { key: "tl", cls: "logo-tl", base: { x: -14, y: -14 }, add: [[50, 24], [24, 45]], cut: [] },
    { key: "tr", cls: "logo-tr", base: { x: 50, y: -14 }, add: [], cut: [[50, 24], [76, 45]] },
    { key: "bl", cls: "logo-bl", base: { x: -14, y: 45 }, add: [], cut: [[24, 45], [50, 64]] },
    { key: "br", cls: "logo-br", base: { x: 50, y: 45 }, add: [[76, 45], [50, 64]], cut: [] },
  ];

  return (
    <svg
      viewBox="-14 -14 128 118"
      className={cn("overflow-visible", animated && "logo-anim", className)}
      role="img"
      aria-label="חלקים מאיתנו"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "hsl(var(--primary))" }} />
          <stop offset="58%" style={{ stopColor: "hsl(var(--primary-deep))" }} />
          <stop offset="100%" style={{ stopColor: "hsl(var(--gold))" }} />
        </linearGradient>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        {pieces.map((p) => (
          <mask key={p.key} id={`${uid}-${p.key}`} maskUnits="userSpaceOnUse" {...box}>
            <rect x={p.base.x} y={p.base.y} width={64} height={59} fill="white" />
            {p.add.map(([cx, cy]) => (
              <circle key={`a${cx}-${cy}`} cx={cx} cy={cy} r={7} fill="white" />
            ))}
            {p.cut.map(([cx, cy]) => (
              <circle key={`c${cx}-${cy}`} cx={cx} cy={cy} r={7} fill="black" />
            ))}
          </mask>
        ))}
      </defs>

      <g className="logo-heart">
        <path d={HEART} fill={`url(#${gradient})`} opacity={0.55} filter={`url(#${glow})`} />
        {pieces.map((p) => (
          <g key={p.key} className={cn("logo-piece", p.cls)} mask={`url(#${uid}-${p.key})`}>
            <path d={HEART} fill={`url(#${gradient})`} />
            <path d={HEART} fill="none" style={{ stroke: "hsl(var(--foreground) / 0.28)" }} strokeWidth={0.9} />
          </g>
        ))}
      </g>
    </svg>
  );
}
