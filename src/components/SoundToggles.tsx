import { useEffect, useState, useSyncExternalStore } from "react";
import { Maximize, Minimize, Music, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";

export function useSoundPrefs() {
  return useSyncExternalStore(sound.subscribe, sound.getSnapshot);
}

export function SoundToggles({ className }: { className?: string }) {
  const prefs = useSoundPrefs();
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className={cn("flex items-center", className)}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={prefs.sfx ? "השתקת צלילים" : "הפעלת צלילים"}
        aria-pressed={prefs.sfx}
        title={prefs.sfx ? "צלילים: פועלים" : "צלילים: מושתקים"}
        onClick={() => sound.setSfx(!prefs.sfx)}
      >
        {prefs.sfx ? <Volume2 /> : <VolumeX />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={prefs.music ? "כיבוי מוזיקה" : "הפעלת מוזיקה"}
        aria-pressed={prefs.music}
        title={prefs.music ? "מוזיקה: פועלת" : "מוזיקה: כבויה"}
        onClick={() => sound.setMusic(!prefs.music)}
        className={cn(!prefs.music && "opacity-40")}
      >
        <Music />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={fullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
        title="מסך מלא"
        onClick={toggleFullscreen}
        className="hidden sm:inline-flex"
      >
        {fullscreen ? <Minimize /> : <Maximize />}
      </Button>
    </div>
  );
}
