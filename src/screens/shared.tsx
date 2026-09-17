import { useState, type ReactNode } from "react";
import { LoaderCircle, LogOut, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogoHeart } from "@/components/LogoHeart";
import { hostBackToLobby, leaveRoom } from "@/game/controller";
import { useGame } from "@/game/store";
import type { NetStatus } from "@/net/transport";
import { cn } from "@/lib/utils";

export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-sm font-medium text-muted-foreground", className)}>{children}</div>;
}

export function NetBadge({ net }: { net: NetStatus }) {
  if (net === "online" || net === "idle") return null;
  return (
    <span className="chip border-gold/40 text-gold">
      {net === "offline" ? <WifiOff className="h-3.5 w-3.5" /> : <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
      {net === "offline" ? "אין חיבור" : "מתחבר…"}
    </span>
  );
}

export function LeaveButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const role = useGame((s) => s.role);
  const phase = useGame((s) => s.match?.phase);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="יציאה מהחדר"
        title="יציאה"
        onClick={() => setOpen(true)}
        className={className}
      >
        <LogOut className="-scale-x-100" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>לצאת מהחדר?</DialogTitle>
            <DialogDescription>
              {role === "host"
                ? "החדר ייסגר גם אצל שאר השחקנים."
                : "אפשר לחזור עם אותו קוד כל עוד החדר פתוח."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {role === "host" && phase && phase !== "lobby" && (
              <Button
                variant="secondary"
                onClick={() => {
                  hostBackToLobby();
                  setOpen(false);
                }}
              >
                חזרה ללובי, בלי לסגור את החדר
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => {
                setOpen(false);
                leaveRoom();
              }}
            >
              יציאה
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="glass w-full max-w-md animate-rise-in rounded-[2rem] p-8 text-center">{children}</div>
    </div>
  );
}

export function ConnectingScreen() {
  const room = useGame((s) => s.room);
  return (
    <CenteredScreen>
      <LogoHeart className="mx-auto h-28 w-28" />
      <h2 className="mt-5 font-display text-2xl font-bold">מתחברים לחדר{room ? ` ${room}` : ""}…</h2>
      <p className="mt-2 text-sm text-muted-foreground">עוד שנייה ואתם בפנים.</p>
      <Button variant="ghost" className="mt-6" onClick={() => leaveRoom()}>
        ביטול
      </Button>
    </CenteredScreen>
  );
}
