import { useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addPhotos, libraryThumb, removeUploadedPhoto } from "@/game/controller";
import { GROUP_LABEL } from "@/game/photos";
import { useGame } from "@/game/store";
import type { PhotoMeta } from "@/game/types";
import { cn } from "@/lib/utils";

const GROUP_ORDER = ["us", "sweet", "upload", "other", "premium"];

function groupOf(photo: PhotoMeta): string {
  if (photo.source === "premium") return "premium";
  if (photo.source === "upload") return "upload";
  return photo.group === "us" || photo.group === "sweet" ? photo.group : "other";
}

export function UploadButton({ className, label = "העלאה מהמחשב" }: { className?: string; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" className={className} disabled={busy} onClick={() => inputRef.current?.click()}>
        <ImagePlus />
        {busy ? "מעבד…" : label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          await addPhotos(files);
          setBusy(false);
        }}
      />
    </>
  );
}

export function PhotoPicker({
  open,
  onOpenChange,
  title,
  selectedId,
  onSelect,
  allowSurprise = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  allowSurprise?: boolean;
}) {
  const library = useGame((s) => s.library);
  const groups = useMemo(
    () =>
      GROUP_ORDER.map((id) => ({ id, label: GROUP_LABEL[id], photos: library.filter((p) => groupOf(p) === id) })).filter(
        (g) => g.photos.length,
      ),
    [library],
  );
  const [tab, setTab] = useState<string | null>(null);
  const active = groups.find((g) => g.id === tab) ?? groups[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>התמונות לא יוצאות מהמחשבים שלכם. תמונות עם הרבה פרטים מתאימות ללוחות הגדולים.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setTab(g.id)}
              className={cn(
                "chip text-sm transition",
                active?.id === g.id ? "border-primary/50 bg-primary/20 text-foreground" : "hover:bg-foreground/10",
              )}
            >
              {g.label} <span className="text-muted-foreground">{g.photos.length}</span>
            </button>
          ))}
          <UploadButton className="ms-auto" />
        </div>

        <div className="grid max-h-[56dvh] grid-cols-3 gap-2 overflow-y-auto pe-1 sm:grid-cols-4 md:grid-cols-5">
          {allowSurprise && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={cn(
                "grid aspect-square place-items-center rounded-2xl border-2 border-dashed text-center transition",
                selectedId === null ? "border-primary bg-primary/15" : "border-foreground/15 hover:bg-foreground/5",
              )}
            >
              <span>
                <span className="block text-3xl">🎁</span>
                <span className="mt-1 block text-xs font-semibold">הפתעה</span>
              </span>
            </button>
          )}
          {active?.photos.map((photo) => {
            const src = libraryThumb(photo);
            const selected = photo.id === selectedId;
            return (
              <div key={photo.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(photo.id)}
                  className={cn(
                    "relative block aspect-square w-full overflow-hidden rounded-2xl ring-2 transition",
                    selected ? "ring-primary" : "ring-transparent hover:ring-foreground/30",
                  )}
                  title={photo.label}
                >
                  {src && (
                    <img src={src} alt={photo.label} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  )}
                  {photo.source === "premium" && <span className="chip absolute start-1.5 top-1.5 bg-background/70 px-2">💎</span>}
                  {selected && (
                    <span className="absolute inset-0 grid place-items-center bg-primary/30">
                      <Check className="h-8 w-8 text-foreground drop-shadow" />
                    </span>
                  )}
                </button>
                {photo.source === "upload" && (
                  <button
                    type="button"
                    aria-label="הסרת התמונה"
                    onClick={() => void removeUploadedPhoto(photo.id)}
                    className="absolute end-1.5 top-1.5 hidden rounded-full bg-background/80 p-1.5 text-muted-foreground hover:text-destructive group-hover:block"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
