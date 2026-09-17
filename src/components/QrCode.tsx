import { useMemo } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/** QR מצויר כ-SVG עם צבעי המערכת — לטאבלט או לטלפון שרוצים להצטרף בסריקה */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const shape = useMemo(() => {
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
      const size = qr.modules.size;
      const data = qr.modules.data;
      let d = "";
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
        }
      }
      return { d, size };
    } catch {
      return null;
    }
  }, [value]);

  if (!shape) return null;
  return (
    <svg
      viewBox={`-2 -2 ${shape.size + 4} ${shape.size + 4}`}
      className={cn("rounded-xl bg-foreground text-background", className)}
      shapeRendering="crispEdges"
      role="img"
      aria-label="קוד QR להצטרפות לחדר"
    >
      <path d={shape.d} fill="currentColor" />
    </svg>
  );
}
