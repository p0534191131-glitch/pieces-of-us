/** 1:05.3 — שעון מירוץ עם עשיריות */
export function formatClock(ms: number): string {
  const tenthsTotal = Math.max(0, Math.floor(ms / 100));
  const tenths = tenthsTotal % 10;
  const secs = Math.floor(tenthsTotal / 10) % 60;
  const mins = Math.floor(tenthsTotal / 600);
  return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
}

/** "42.3 שנ׳" או "2:05 דק׳" */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} שנ׳`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} דק׳`;
}

export function formatSecondsShort(ms: number): string {
  return (Math.abs(ms) / 1000).toFixed(1);
}

export function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
