import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ProgressRing({
  value,
  size = 96,
  stroke = 8,
  colorVar = "--po",
  className,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  colorVar?: string;
  className?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: "hsl(var(--foreground) / 0.08)" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{
            stroke: `hsl(var(${colorVar}))`,
            transition: "stroke-dashoffset 420ms cubic-bezier(.2,.8,.2,1)",
            filter: `drop-shadow(0 0 6px hsl(var(${colorVar}) / 0.6))`,
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
