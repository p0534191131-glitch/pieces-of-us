import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Lock, Sparkles, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/CopyButton";
import { LogoHeart } from "@/components/LogoHeart";
import { PhotoPicker, UploadButton } from "@/components/PhotoPicker";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { QrCode } from "@/components/QrCode";
import { SoundToggles } from "@/components/SoundToggles";
import { ASSISTS, COLOR_VAR, MAX_PLAYERS, MIN_PLAYERS, PLAN_ORDER, PLANS, planGrids, POWERS, WISHES } from "@/game/constants";
import { hostRemovePlayer, hostStart, hostUpdateSettings, inviteUrl, libraryThumb, patchMe, sendNote } from "@/game/controller";
import { useGame } from "@/game/store";
import { say } from "@/game/text";
import { pieces, type AssistLevel, type Grid, type MatchSettings, type MatchState, type PlayerState } from "@/game/types";
import { transportKind } from "@/net/transport";
import { sound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { ConnectingScreen, FieldLabel, LeaveButton, NetBadge } from "./shared";

export default function LobbyScreen() {
  const match = useGame((s) => s.match);
  const pid = useGame((s) => s.pid);
  const role = useGame((s) => s.role);
  const room = useGame((s) => s.room);
  const net = useGame((s) => s.net);
  const [pickerLevel, setPickerLevel] = useState<number | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const me = match?.players.find((p) => p.pid === pid) ?? null;
  if (!match || !room || !me) return <ConnectingScreen />;

  const isHost = role === "host";
  const others = match.players.filter((p) => p.pid !== pid);
  const seatsLeft = Math.max(0, match.settings.maxPlayers - match.players.length);
  const grids = planGrids(match.settings.plan);

  const onStart = () => {
    const result = hostStart();
    if (result === "no-photos") setStartError("אין מספיק תמונות — הוסיפו תמונות לתיקייה או העלו מהמחשב.");
    else if (result === "not-ready") setStartError("עוד לא כולם מוכנים.");
    else setStartError(null);
  };

  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5 sm:px-6"
      style={{ "--pc": COLOR_VAR[me.color], "--po": others[0] ? COLOR_VAR[others[0].color] : COLOR_VAR.gold } as CSSProperties}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LogoHeart animated={false} className="h-10 w-10" />
          <div className="leading-tight">
            <div className="text-xs text-muted-foreground">החדר שלכם</div>
            <div className="isolate-ltr font-display text-2xl font-black tracking-[0.2em]">{room}</div>
          </div>
          <NetBadge net={net} />
        </div>
        <div className="flex items-center">
          <SoundToggles />
          <LeaveButton />
        </div>
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <PlayersCard match={match} pid={pid} isHost={isHost} />
          {isHost && seatsLeft > 0 && <InviteCard room={room} seatsLeft={seatsLeft} />}
          <MySetupCard me={me} others={others} />
        </div>
        <SettingsCard match={match} editable={isHost} onPickLevel={setPickerLevel} />
      </div>

      <LobbyCta match={match} me={me} isHost={isHost} onStart={onStart} error={startError} />

      {isHost && (
        <PhotoPicker
          open={pickerLevel !== null}
          onOpenChange={(open) => !open && setPickerLevel(null)}
          title={
            pickerLevel !== null
              ? `תמונה לשלב ${pickerLevel + 1} · ${grids[pickerLevel] ? pieces(grids[pickerLevel]) : 9} חלקים`
              : "בחירת תמונה"
          }
          selectedId={pickerLevel !== null ? match.settings.manual[pickerLevel] : null}
          onSelect={(id) => {
            if (pickerLevel === null) return;
            const manual = [...match.settings.manual];
            manual[pickerLevel] = id;
            hostUpdateSettings({ manual });
            setPickerLevel(null);
            sound.play("tap");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PlayersCard({ match, pid, isHost }: { match: MatchState; pid: string; isHost: boolean }) {
  const max = match.settings.maxPlayers;
  const empty = Math.max(0, max - match.players.length);
  const live = match.players.filter((p) => p.connected);
  const ready = live.filter((p) => p.slot === 0 || p.ready).length;
  const duel = match.players.length === 2;
  const allReady = ready === live.length && live.length >= MIN_PLAYERS;
  return (
    <section className="glass rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">מי בחדר</h2>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip">
            {live.length}/{max} בחדר
          </span>
          <span className={cn("chip", allReady && "border-success/40 text-success")}>
            {allReady ? (duel ? "💞 שניכם מוכנים" : "✓ כולם מוכנים") : `${ready} מוכנים`}
          </span>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {match.players.map((player) => (
          <Seat
            key={player.pid}
            player={player}
            isMe={player.pid === pid}
            canRemove={isHost && player.slot !== 0 && !player.connected}
          />
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <EmptySeat key={`empty-${i}`} />
        ))}
      </div>
    </section>
  );
}

function Seat({ player, isMe, canRemove }: { player: PlayerState; isMe: boolean; canRemove: boolean }) {
  const isHost = player.slot === 0;
  const ready = isHost || player.ready;
  const g = player.gender;
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <PlayerAvatar player={player} size="lg" showStatus />
      <div className="mt-2 max-w-full truncate font-display text-lg font-bold">
        {player.name}
        {isMe && <span className="font-sans text-xs font-normal text-muted-foreground"> (אני)</span>}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {isHost ? say(g, "מארח", "מארחת", "מארח/ת") : say(g, "משתתף", "משתתפת", "משתתף/ת")}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1">
        {!isHost && (
          <span className={cn("chip text-[11px]", ready ? "border-success/40 text-success" : "text-muted-foreground")}>
            {ready ? `✓ ${say(g, "מוכן", "מוכנה", "מוכן/ה")}` : say(g, "מתארגן…", "מתארגנת…", "מתארגן/ת…")}
          </span>
        )}
        <span className="chip text-[11px]" title={`רמת עזרה: ${ASSISTS[player.assist].name}`}>
          {ASSISTS[player.assist].emoji}
        </span>
        {player.wish && <span className="chip text-[11px]">🎁</span>}
        {player.hasNote && <span className="chip text-[11px]">💌</span>}
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={() => hostRemovePlayer(player.slot)}
          className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          <UserMinus className="h-3 w-3" /> לפנות את המקום
        </button>
      )}
    </div>
  );
}

function EmptySeat() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-foreground/20">
        <span className="absolute inset-0 animate-ring-out rounded-full border-2 border-primary/40" />
        <span className="text-2xl opacity-50">🤍</span>
      </div>
      <div className="mt-2 font-display text-base text-muted-foreground">מקום פנוי</div>
      <div className="text-[11px] text-muted-foreground">שלחו את הקוד</div>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/20 text-sm font-bold text-primary">{n}</span>
  );
}

function InviteCard({ room, seatsLeft }: { room: string; seatsLeft: number }) {
  const serverInfo = useGame((s) => s.serverInfo);
  const url = inviteUrl(room);
  const origin = url.replace(/\/\?room=\d+$/, "");
  const local = transportKind() === "local-server";
  return (
    <section className="glass animate-rise-in rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">איך מצטרפים ממחשב נוסף?</h2>
        <span className="chip">{seatsLeft === 1 ? "מקום אחד פנוי" : `${seatsLeft} מקומות פנויים`}</span>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <StepNumber n={1} />
            <div className="min-w-0 flex-1">
              <div>{local ? "באותה רשת WiFi, פותחים בדפדפן את הכתובת:" : "פותחים בדפדפן את הכתובת:"}</div>
              <div className="mt-2 flex items-center gap-2">
                <code className="isolate-ltr min-w-0 flex-1 truncate rounded-xl bg-foreground/[0.07] px-3 py-2 text-base font-semibold">
                  {origin}
                </code>
                <CopyButton value={url} />
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <StepNumber n={2} />
            <div>
              <div>ומקלידים את קוד החדר:</div>
              <div className="isolate-ltr mt-1 font-display text-4xl font-black tracking-[0.25em]">
                <span className="text-love">{room}</span>
              </div>
            </div>
          </li>
        </ol>
        <div className="flex flex-col items-center gap-2">
          <QrCode value={url} className="h-32 w-32 p-1" />
          <span className="text-xs text-muted-foreground">או סריקה מטאבלט</span>
        </div>
      </div>
      {local && serverInfo && !serverInfo.lan.length && (
        <p className="mt-4 rounded-xl bg-gold/10 p-3 text-xs text-gold">לא זיהינו רשת. ודאו שכל המחשבים מחוברים לאותו WiFi.</p>
      )}
      {local && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          מחשב נוסף לא מצליח להתחבר? אם Windows שאל על גישה לרשת כשהמשחק עלה, צריך לבחור ״אפשר״ לרשתות פרטיות.
        </p>
      )}
    </section>
  );
}

function MySetupCard({ me, others }: { me: PlayerState; others: PlayerState[] }) {
  const [customWish, setCustomWish] = useState(() => (me.wish && !WISHES.includes(me.wish) ? me.wish : ""));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const noteTimer = useRef(0);
  const wishTimer = useRef(0);
  const duel = others.length === 1;
  const noteTarget = duel ? others[0].name : "כולם";

  useEffect(
    () => () => {
      window.clearTimeout(noteTimer.current);
      window.clearTimeout(wishTimer.current);
    },
    [],
  );

  const onNote = (text: string) => {
    setNote(text);
    setSaving(true);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => {
      sendNote(text);
      setSaving(false);
    }, 500);
  };

  const onCustomWish = (text: string) => {
    setCustomWish(text);
    window.clearTimeout(wishTimer.current);
    wishTimer.current = window.setTimeout(() => patchMe({ wish: text.trim() }), 400);
  };

  return (
    <section className="glass rounded-[1.75rem] p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">ההגדרות שלי</h2>

      <div className="mt-4">
        <FieldLabel>רמת עזרה</FieldLabel>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([0, 1, 2] as AssistLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={me.assist === level}
              onClick={() => {
                patchMe({ assist: level });
                sound.play("tap");
              }}
              className={cn(
                "rounded-2xl border p-3 text-center transition",
                me.assist === level
                  ? "border-pc bg-pc/15 shadow-[0_0_24px_-8px_hsl(var(--pc)/0.8)]"
                  : "border-foreground/10 hover:bg-foreground/5",
              )}
            >
              <div className="text-2xl">{ASSISTS[level].emoji}</div>
              <div className="mt-1 text-sm font-semibold">{ASSISTS[level].name}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {ASSISTS[me.assist].desc}. כל אחד בוחר לעצמו — ככה גם כשאחד מהיר יותר, המירוץ נשאר צמוד.
        </p>
      </div>

      <div className="mt-6">
        <FieldLabel>🎁 מה אני {say(me.gender, "מקבל", "מקבלת", "מקבל/ת")} אם {say(me.gender, "אנצח", "אנצח")}?</FieldLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {WISHES.map((wish) => (
            <button
              key={wish}
              type="button"
              aria-pressed={me.wish === wish}
              onClick={() => {
                setCustomWish("");
                patchMe({ wish: me.wish === wish ? "" : wish });
                sound.play("tap");
              }}
              className={cn(
                "chip text-sm transition",
                me.wish === wish ? "border-gold/60 bg-gold/15 text-foreground" : "hover:bg-foreground/10",
              )}
            >
              {wish}
            </button>
          ))}
        </div>
        <Input
          className="mt-2"
          value={customWish}
          maxLength={80}
          placeholder="או לכתוב משאלה משלי…"
          onChange={(e) => onCustomWish(e.target.value)}
        />
      </div>

      <div className="mt-6">
        <FieldLabel>💌 פתק סודי ל{noteTarget}</FieldLabel>
        <Textarea
          className="mt-2"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder={
            duel
              ? `משהו שרציתי להגיד… ${noteTarget} ${say(others[0].gender, "יקרא", "תקרא", "יקרא/תקרא")} את זה רק בסוף המשחק`
              : "משהו שרציתי להגיד… ייחשף רק בסוף המשחק"
          }
        />
        <div className="mt-1 text-xs text-muted-foreground">
          {saving ? "שומר…" : me.hasNote ? "✓ נשמר — ייחשף בסוף המשחק" : "ייחשף רק בסוף המשחק"}
        </div>
      </div>
    </section>
  );
}

function SettingsCard({
  match,
  editable,
  onPickLevel,
}: {
  match: MatchState;
  editable: boolean;
  onPickLevel: (level: number) => void;
}) {
  const library = useGame((s) => s.library);
  const settings = match.settings;
  const grids = planGrids(settings.plan);
  const folderCount = library.filter((p) => p.source === "folder").length;
  const uploadCount = library.filter((p) => p.source === "upload").length;
  const premiumCount = library.filter((p) => p.source === "premium").length;

  const update = (patch: Partial<MatchSettings>) => {
    if (!editable) return;
    hostUpdateSettings(patch);
    sound.play("tap");
  };

  return (
    <section className="glass h-fit rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">המשחק</h2>
        {!editable && (
          <span className="chip">
            <Lock className="h-3 w-3" /> המארח/ת קובע/ת
          </span>
        )}
      </div>

      <div className="mt-4">
        <FieldLabel>כמה שחקנים</FieldLabel>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => {
            const active = settings.maxPlayers === n;
            const tooSmall = n < match.players.length;
            return (
              <button
                key={n}
                type="button"
                disabled={!editable || tooSmall}
                aria-pressed={active}
                onClick={() => update({ maxPlayers: n })}
                title={tooSmall ? "כבר יש יותר שחקנים בחדר" : `עד ${n} שחקנים`}
                className={cn(
                  "tabular h-11 rounded-2xl border text-base font-bold transition disabled:cursor-default",
                  active ? "border-pc bg-pc/15" : "border-foreground/10 enabled:hover:bg-foreground/5",
                  tooSmall && !active && "opacity-30",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          כל מחשב שמצטרף עם הקוד תופס מקום פנוי. בכל שלב — מי שמסיים/ה ראשון/ה לוקח/ת את הנקודה.
        </p>
      </div>

      <div className="mt-6">
        <FieldLabel>מסלול · כל שלב מכפיל את מספר החלקים</FieldLabel>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id];
            const active = settings.plan === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!editable}
                aria-pressed={active}
                onClick={() => update({ plan: id })}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 text-start transition disabled:cursor-default",
                  active
                    ? "border-primary/60 bg-primary/15 shadow-[0_0_30px_-10px_hsl(var(--primary)/0.8)]"
                    : "border-foreground/10 enabled:hover:bg-foreground/5",
                  !editable && !active && "opacity-60",
                )}
              >
                <span className="text-2xl leading-none">{p.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {p.name}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {p.levels} שלבים · {p.minutes}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">{p.blurb}</span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {planGrids(id).map((g, i) => (
                    <span key={i} className="tabular rounded-md bg-foreground/[0.07] px-1.5 py-0.5 text-[11px]">
                      {pieces(g)}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <FieldLabel>תמונות</FieldLabel>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["surprise", "🎁 הפתעה"],
              ["manual", "🖼️ בחירה לכל שלב"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              disabled={!editable}
              aria-pressed={settings.photoMode === mode}
              onClick={() => update({ photoMode: mode })}
              className={cn(
                "h-11 rounded-2xl border text-sm font-semibold transition disabled:cursor-default",
                settings.photoMode === mode ? "border-pc bg-pc/15" : "border-foreground/10 enabled:hover:bg-foreground/5",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {settings.photoMode === "surprise" ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            כל שלב מקבל תמונה שאף אחד לא ראה מראש. התמונות העשירות בפרטים הולכות ללוחות הגדולים.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {grids.map((grid, i) => (
              <LevelSlot
                key={i}
                index={i}
                grid={grid}
                photoId={settings.manual[i] ?? null}
                editable={editable}
                onClick={() => onPickLevel(i)}
              />
            ))}
          </div>
        )}
        {editable && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="chip">📁 {folderCount} מהתיקייה</span>
            {uploadCount > 0 && <span className="chip">⬆️ {uploadCount} הועלו</span>}
            {premiumCount > 0 && <span className="chip">💎 {premiumCount} פרימיום</span>}
            <UploadButton className="ms-auto" />
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {(editable ? premiumCount > 0 : settings.premiumFinale) && (
          <ToggleRow
            title="💎 גמר פרימיום"
            desc="השלב האחרון נבנה מתמונת פרימיום מיוחדת"
            checked={settings.premiumFinale}
            disabled={!editable}
            onChange={(v) => update({ premiumFinale: v })}
          />
        )}
        <ToggleRow
          title="😈 מצב שובבות"
          desc="כל כמה חלקים שננעלים מקבלים כוח — חלקם פוגעים בלוח של מי שמוביל/ה"
          checked={settings.mischief}
          disabled={!editable}
          onChange={(v) => update({ mischief: v })}
        />
        {settings.mischief && (
          <div className="flex flex-wrap gap-1.5">
            {Object.values(POWERS).map((power) => (
              <span key={power.name} className="chip" title={power.desc}>
                {power.emoji} {power.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LevelSlot({
  index,
  grid,
  photoId,
  editable,
  onClick,
}: {
  index: number;
  grid: Grid;
  photoId: string | null;
  editable: boolean;
  onClick: () => void;
}) {
  const library = useGame((s) => s.library);
  const photo = photoId ? library.find((p) => p.id === photoId) : undefined;
  const src = editable && photo ? libraryThumb(photo) : null;
  return (
    <button
      type="button"
      disabled={!editable}
      onClick={onClick}
      className="group relative aspect-square overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.04] transition enabled:hover:border-primary/50 disabled:cursor-default"
      title={`שלב ${index + 1}`}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
      ) : (
        <span className="grid h-full place-items-center text-2xl">{photo ? "🖼️" : "🎁"}</span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent px-1 pb-1 pt-4 text-[11px] font-semibold">
        {pieces(grid)}
      </span>
    </button>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: ReactNode;
  desc: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-foreground/10 p-3">
      <label htmlFor={id} className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="text-xs leading-relaxed text-muted-foreground">{desc}</div>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function LobbyCta({
  match,
  me,
  isHost,
  onStart,
  error,
}: {
  match: MatchState;
  me: PlayerState;
  isHost: boolean;
  onStart: () => void;
  error: string | null;
}) {
  const host = match.players[0];
  const live = match.players.filter((p) => p.connected);
  const waiting = live.filter((p) => p.slot !== 0 && !p.ready);
  let hint: string;
  let canStart = false;
  if (live.length < MIN_PLAYERS) {
    hint = "ממתינים שמישהו יצטרף לחדר";
  } else if (waiting.length === 1) {
    hint = `ממתינים ש${waiting[0].name} ${say(waiting[0].gender, "יאשר", "תאשר", "יאשר/תאשר")} מוכנות`;
  } else if (waiting.length > 1) {
    hint = `${waiting.length} שחקנים עוד לא אישרו מוכנות`;
  } else {
    canStart = true;
    hint = live.length === 2 ? "כולם מוכנים! אפשר להתחיל 🚀" : `${live.length} שחקנים מוכנים! אפשר להתחיל 🚀`;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 text-sm text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : isHost ? (
            hint
          ) : (
            `${host.name} ${say(host.gender, "יתחיל", "תתחיל", "יתחיל/תתחיל")} את המשחק כשכולם מוכנים`
          )}
        </div>
        {isHost ? (
          <Button size="lg" disabled={!canStart} onClick={onStart} className="min-w-[12rem]">
            <Sparkles /> מתחילים!
          </Button>
        ) : (
          <Button
            size="lg"
            variant={me.ready ? "secondary" : "gold"}
            className="min-w-[12rem]"
            onClick={() => {
              patchMe({ ready: !me.ready });
              sound.play("ready");
            }}
          >
            {me.ready ? (
              <>
                <Check /> {say(me.gender, "מוכן", "מוכנה", "מוכן/ה")} · ביטול
              </>
            ) : (
              `${say(me.gender, "אני מוכן", "אני מוכנה", "אני מוכן/ה")} ✓`
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
