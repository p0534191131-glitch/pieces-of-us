import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sound } from "@/lib/sound";

function legacyCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } finally {
    area.remove();
  }
}

/** בכתובת רשת מקומית (http) אין clipboard API — לכן יש גם דרך ישנה */
export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else legacyCopy(value);
    } catch {
      legacyCopy(value);
    }
    setCopied(true);
    sound.play("tap");
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Button variant="secondary" size="sm" onClick={copy} className={className} aria-live="polite">
      {copied ? <Check /> : <Copy />}
      {copied ? "הועתק" : "העתקה"}
    </Button>
  );
}
