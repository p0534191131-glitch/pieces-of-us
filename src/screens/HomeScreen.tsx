import { useRef, useState, type CSSProperties } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoHeart } from "@/components/LogoHeart";
import { SoundToggles } from "@/components/SoundToggles";
import { AVATARS, COLOR_NAME, COLOR_ORDER, COLOR_VAR } from "@/game/constants";
import { createRoom, joinRoom, openSolo, updateProfile } from "@/game/controller";
import { useGame } from "@/game/store";
import { isHomeNetwork, transportKind } from "@/net/transport";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./shared";

const STEPS = [
  { emoji: "💞", title: "פותחים חדר", text: "מחשב אחד פותח חדר ומקבל קוד של 4 ספרות." },
  { emoji: "💻", title: "מצטרפים משאר המחשבים", text: "באותה רשת WiFi פותחים את הכתובת שבחדר ומקלידים את הקוד. עד 6 שחקנים." },
  { emoji: "🧩", title: "מירוץ!", text: "אותה תמונה, אותו ערבוב. 9 חלקים, אחר כך 18, 36, 72… מי שמרכיב ראשון — לוקח את השלב." },
];

export default function HomeScreen() {
  const profile = useGame((s) => s.profile);
  const busy = useGame((s) => s.busy);
  const joinError = useGame((s) => s.joinError);
  const serverChecked = useGame((s) => s.serverChecked);
  const serverInfo = useGame((s) => s.serverInfo);
  const nameRef = useRef<HTMLInputElement>(null);
  const [nameError, setNameError] = useState(false);
  const [invitedCode] = useState(() => new URLSearchParams(location.search).get("room")?.replace(/\D/g, "").slice(0, 4) ?? "");
  const [code, setCode] = useState(invitedCode);

  const localServerMissing = transportKind() === "local-server" && serverChecked && !serverInfo;
  /** רץ מהמחשב הביתי, או מאתר בענן? ההודעה כשאין שרת שונה בין השניים */
  const onHomeNetwork = isHomeNetwork();

  const requireName = () => {
    if (profile.name.trim()) return true;
    setNameError(true);
    nameRef.current?.focus();
    sound.play("locked");
    return false;
  };

  const onCreate = () => {
    if (requireName()) void createRoom();
  };

  const onJoin = () => {
    if (!requireName()) return;
    if (code.length !== 4) return;
    void joinRoom(code);
  };

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-4 pb-10 pt-5 sm:px-6"
      style={{ "--pc": COLOR_VAR[profile.color] } as CSSProperties}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoHeart animated={false} className="h-8 w-8" />
          <span className="font-display text-lg font-bold">חלקים מאיתנו</span>
        </div>
        <SoundToggles />
      </header>

      <section className="grid flex-1 grid-cols-[minmax(0,1fr)] items-center gap-10 py-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="text-center lg:text-start">
          <LogoHeart className="mx-auto h-40 w-40 sm:h-52 sm:w-52 lg:mx-0" />
          <h1 className="mt-6 font-display text-[clamp(2.7rem,7vw,5.2rem)] font-black leading-[1.02] tracking-tight">
            <span className="text-love">חלקים מאיתנו</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[44ch] text-[clamp(1rem,1.6vw,1.2rem)] leading-relaxed text-muted-foreground lg:mx-0">
            מירוץ פאזל בזמן אמת — לשניים או לחבורה של עד שישה. התמונות שלכם, וכל שלב מכפיל את מספר החלקים. מי שמרכיב/ה ראשון/ה — מנצח/ת.
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
            {["9 ← 18 ← 36 ← 72 ← 144 חלקים", "עד 6 שחקנים 👥", "כוחות שובבים 😈", "כרטיסי אהבה 💌", "פתקים סודיים 🤫"].map((t) => (
              <li key={t} className="chip text-sm">
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass mx-auto w-full max-w-md animate-rise-in rounded-[2rem] p-6 sm:p-8">
          {invitedCode && (
            <div className="mb-5 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-center text-sm">
              💌 הוזמנתם לחדר <b className="isolate-ltr tracking-widest">{invitedCode}</b> — רק שם, ומצטרפים
            </div>
          )}

          <h2 className="font-display text-2xl font-bold">מי משחק/ת?</h2>

          <label className="mt-4 block" htmlFor="player-name">
            <FieldLabel>השם שיופיע לשאר השחקנים</FieldLabel>
          </label>
          <Input
            id="player-name"
            ref={nameRef}
            value={profile.name}
            maxLength={16}
            autoComplete="nickname"
            placeholder="השם שלך"
            aria-invalid={nameError}
            onChange={(e) => {
              updateProfile({ name: e.target.value });
              setNameError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (invitedCode ? onJoin : onCreate)();
            }}
            className={cn("mt-1.5 text-lg font-semibold", nameError && "border-destructive ring-2 ring-destructive/30")}
          />

          <div className="mt-4">
            <FieldLabel>איך לפנות אליך?</FieldLabel>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  ["m", "אתה"],
                  ["f", "את"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={profile.gender === value}
                  onClick={() => updateProfile({ gender: profile.gender === value ? null : value })}
                  className={cn(
                    "h-11 rounded-2xl border text-base font-semibold transition",
                    profile.gender === value ? "border-pc bg-pc/15" : "border-foreground/10 hover:bg-foreground/5",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <FieldLabel>הדמות שלך</FieldLabel>
            <div className="mt-1.5 grid grid-cols-6 gap-1.5">
              {AVATARS.map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  aria-label={`דמות ${avatar}`}
                  aria-pressed={profile.avatar === avatar}
                  onClick={() => updateProfile({ avatar })}
                  className={cn(
                    "grid aspect-square place-items-center rounded-xl text-2xl transition",
                    profile.avatar === avatar ? "scale-105 bg-foreground/15 ring-2 ring-pc" : "hover:bg-foreground/10",
                  )}
                >
                  {avatar}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <FieldLabel>הצבע שלך</FieldLabel>
            <div className="flex gap-2.5">
              {COLOR_ORDER.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`צבע ${COLOR_NAME[color]}`}
                  aria-pressed={profile.color === color}
                  onClick={() => updateProfile({ color })}
                  className={cn(
                    "h-8 w-8 rounded-full transition",
                    profile.color === color
                      ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "opacity-70 hover:opacity-100",
                  )}
                  style={{ background: `hsl(${COLOR_VAR[color]})` }}
                />
              ))}
            </div>
          </div>

          <div className="my-6 h-px bg-foreground/10" />

          {!invitedCode && (
            <Button size="lg" className="w-full" onClick={onCreate} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              פותחים חדר חדש
            </Button>
          )}

          <div className={cn("flex items-center gap-2", !invitedCode && "mt-3")}>
            <Input
              inputMode="numeric"
              value={code}
              aria-label="קוד חדר בן 4 ספרות"
              placeholder="קוד חדר"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter") onJoin();
              }}
              className="isolate-ltr h-14 text-center text-2xl font-bold tracking-[0.45em] placeholder:text-base placeholder:tracking-normal"
            />
            <Button variant={invitedCode ? "default" : "gold"} size="lg" onClick={onJoin} disabled={busy || code.length !== 4}>
              {busy && invitedCode ? <LoaderCircle className="animate-spin" /> : null}
              מצטרפים
            </Button>
          </div>

          {joinError && (
            <p role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm leading-relaxed text-destructive">
              {joinError}
            </p>
          )}
          {localServerMissing && (
            <p className="mt-3 rounded-xl bg-gold/10 p-3 text-sm leading-relaxed text-gold">
              {onHomeNetwork ? (
                <>
                  שרת המשחק לא פועל. במחשב המארח מפעילים את <b>חלקים מאיתנו - הפעלה.cmd</b> (או{" "}
                  <code className="isolate-ltr">npm run play</code>).
                </>
              ) : (
                <>
                  המשחק עלה לאוויר, אבל החיבור בזמן אמת עוד לא הופעל. צריך להדליק <b>Lovable Cloud</b> ולפרסם מחדש — ואז אפשר לשחק
                  מכל מקום. בינתיים אפשר <b>אימון לבד</b>.
                </>
              )}
            </p>
          )}

          <button
            type="button"
            onClick={openSolo}
            className="mt-5 w-full text-center text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
          >
            או אימון לבד 🧩
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="איך זה עובד">
        {STEPS.map((step) => (
          <div key={step.title} className="glass-soft rounded-2xl p-4">
            <div className="text-2xl">{step.emoji}</div>
            <div className="mt-2 font-semibold">{step.title}</div>
            <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
