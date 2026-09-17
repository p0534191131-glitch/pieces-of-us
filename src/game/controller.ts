import { createTransport, isHomeNetwork, JoinFailure, transportKind, type Member, type NetStatus, type Transport } from "@/net/transport";
import { MatchEngine, sanitizeProfile, SNAPSHOT_VERSION, type EngineHooks, type EngineSnapshot, type StartResult } from "./engine";
import { fetchFolderPhotos, fetchPremiumPhotos, forgetUpload, importUploads, loadStoredUploads, planPhotos } from "./photos";
import { getGame, PROFILE_KEY, setGame, type ToastItem } from "./store";
import { say } from "./text";
import type {
  AssetMsg,
  MatchSettings,
  MatchState,
  NetMessage,
  PeerMsg,
  PhotoMeta,
  PlayerPatch,
  PowerKind,
  Profile,
  ToHostMsg,
} from "./types";
import { base64ToBlob, blobToBase64, chunkString, detailScore, loadImage } from "@/lib/image";
import { roomCode, uid } from "@/lib/random";
import { sound } from "@/lib/sound";
import { readJSON, removeKey, writeJSON } from "@/lib/storage";

/**
 * הדבק בין הרשת, מנוע המשחק וה-UI.
 * המארח/ת מריץ/ה את המנוע; שאר השחקנים מקבלים את המצב ומשקפים אותו.
 */

const SESSION_KEY = "pou:session";
const ENGINE_KEY = "pou:engine";
const DETAIL_KEY = "pou:detail";
const ASSET_CHUNK = 48_000;

let transport: Transport | null = null;
let engine: MatchEngine | null = null;
let hostWasOnline = false;
let loadedMatchId: string | null = null;
let loadingMatchId: string | null = null;
let pendingLoad: Promise<boolean> | null = null;
let libraryPromise: Promise<void> | null = null;
let initialized = false;

const uploadBlobs = new Map<string, Blob>();
const objectUrls = new Map<string, string>();
const incoming = new Map<string, { parts: string[]; received: number; mime: string }>();
const waiters = new Map<string, Array<(url: string) => void>>();

/* ------------------------------------------------------------------ */
/* עזרי UI                                                              */
/* ------------------------------------------------------------------ */

export function toast(text: string, tone: ToastItem["tone"] = "info", ms = 3200) {
  const id = uid(6);
  setGame((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  window.setTimeout(() => setGame((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

function pushEmote(emoji: string, mine: boolean, who: string) {
  const id = uid(6);
  setGame((s) => ({ emotes: [...s.emotes.slice(-14), { id, emoji, mine, who }] }));
  window.setTimeout(() => setGame((s) => ({ emotes: s.emotes.filter((e) => e.id !== id) })), 3200);
}

export function consumePower(id: string) {
  setGame((s) => ({ powerInbox: s.powerInbox.filter((p) => p.id !== id) }));
}

function nameOf(pid: string): string {
  const { match, members } = getGame();
  return match?.players.find((p) => p.pid === pid)?.name ?? members.find((m) => m.pid === pid)?.name ?? "שחקן/ית";
}

function errorText(err: unknown): string {
  const code = err instanceof JoinFailure ? err.code : "server-unreachable";
  switch (code) {
    case "room-not-found":
      return "לא מצאנו חדר עם הקוד הזה. בדקו את הספרות, ושהחדר עדיין פתוח במחשב השני.";
    case "room-full":
      return "החדר הזה כבר מלא.";
    case "room-taken":
      return "הקוד הזה תפוס כרגע. נסו שוב.";
    case "bad-request":
      return "קוד חדר הוא 4 ספרות.";
    default:
      if (transportKind() !== "local-server") return "אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.";
      return isHomeNetwork()
        ? "אין חיבור לשרת המשחק. ודאו שהוא פועל במחשב המארח (npm run play) ושהמחשבים באותה רשת."
        : "המשחק עוד לא חובר לשרת בזמן אמת, אז אי אפשר לפתוח חדר. צריך להדליק Lovable Cloud ולפרסם מחדש — בינתיים אפשר לשחק ב״אימון לבד״.";
  }
}

/* ------------------------------------------------------------------ */
/* אתחול                                                               */
/* ------------------------------------------------------------------ */

export function initApp() {
  if (initialized) return;
  initialized = true;
  void loadServerInfo();
  const session = readJSON<{ room: string; role: "host" | "guest" } | null>(SESSION_KEY, null, "session");
  if (session && /^\d{4}$/.test(session.room)) {
    if (session.role === "host") void createRoom(session.room);
    else void joinRoom(session.room);
  }
}

export async function loadServerInfo() {
  if (transportKind() !== "local-server") {
    setGame({ serverChecked: true });
    return;
  }
  try {
    const res = await fetch("/api/info", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const info = (await res.json()) as { lan?: string[]; port?: number; dev?: boolean };
    setGame({
      serverInfo: { lan: info.lan ?? [], port: info.port ?? Number(location.port || 80), dev: !!info.dev },
      serverChecked: true,
    });
  } catch {
    setGame({ serverInfo: null, serverChecked: true });
  }
}

/** הקישור שפותחים בשאר המחשבים */
export function inviteUrl(code: string): string {
  const { serverInfo } = getGame();
  const onThisMachine = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const base =
    transportKind() === "local-server" && onThisMachine && serverInfo?.lan[0] ? serverInfo.lan[0] : location.origin;
  return `${base}/?room=${code}`;
}

export function updateProfile(patch: Partial<Profile>) {
  const profile = { ...getGame().profile, ...patch };
  setGame({ profile });
  writeJSON(PROFILE_KEY, profile);
}

export function openSolo() {
  void loadLibrary();
  setGame({ screen: "solo" });
}

export function goHome() {
  if (getGame().room) leaveRoom();
  else setGame({ screen: "home" });
}

/* ------------------------------------------------------------------ */
/* חדרים                                                               */
/* ------------------------------------------------------------------ */

const engineHooks: EngineHooks = {
  emit: (state) => onEngineEmit(state),
  persist: () => persistEngine(),
  planPhotos: (grids, settings, used) => planPhotos(getGame().library, grids, settings, used),
  prepare: (photos, matchId) => {
    void hostPrepare(photos, matchId);
  },
};

async function ensureTransport(): Promise<Transport> {
  if (transport) return transport;
  const t = await createTransport();
  transport = t;
  t.on("message", onMessage);
  t.on("presence", onPresence);
  t.on("status", onStatus);
  t.on("closed", () => {
    if (getGame().role === "guest") leaveRoom("המארח/ת סגר/ה את החדר.");
  });
  t.on("replaced", () => leaveRoom("המשחק נפתח בלשונית אחרת — ממשיכים שם."));
  return t;
}

export async function createRoom(preferredCode?: string) {
  if (getGame().busy) return;
  const { pid } = getGame();
  const profile = sanitizeProfile(getGame().profile);
  setGame({ busy: true, joinError: null });
  let t: Transport;
  try {
    t = await ensureTransport();
  } catch (err) {
    setGame({ busy: false, joinError: errorText(err) });
    return;
  }

  let code = preferredCode ?? roomCode();
  let joined = false;
  for (let attempt = 0; attempt < 8 && !joined; attempt++) {
    try {
      await t.join({ room: code, pid, role: "host", name: profile.name });
      joined = true;
    } catch (err) {
      if (err instanceof JoinFailure && err.code === "room-taken") {
        code = roomCode();
        continue;
      }
      removeKey(SESSION_KEY, "session");
      setGame({ busy: false, joinError: errorText(err) });
      return;
    }
  }
  if (!joined) {
    setGame({ busy: false, joinError: errorText(new JoinFailure("room-taken")) });
    return;
  }

  await loadLibrary();
  const snapshot = readJSON<EngineSnapshot | null>(ENGINE_KEY, null, "session");
  const restore =
    !!snapshot && snapshot.version === SNAPSHOT_VERSION && snapshot.state.room === code && snapshot.state.players[0]?.pid === pid;
  engine?.dispose();
  engine = new MatchEngine(engineHooks, restore && snapshot ? { snapshot } : { room: code, hostPid: pid, profile });
  hostWasOnline = true;
  writeJSON(SESSION_KEY, { room: code, role: "host" }, "session");
  setGame({ room: code, role: "host", screen: "room", busy: false });
  window.history.replaceState(null, "", location.pathname);

  if (restore) {
    const st = engine.state;
    if (st.phase !== "lobby" && st.phase !== "preparing" && st.photos.length) void ensureAssets(st.photos, st.matchId);
    engine.resume();
  } else {
    onEngineEmit(engine.state);
  }
  engine.setOnline(new Set(getGame().members.map((m) => m.pid)));
}

export async function joinRoom(code: string) {
  if (getGame().busy) return;
  const { pid } = getGame();
  const profile = sanitizeProfile(getGame().profile);
  setGame({ busy: true, joinError: null });
  try {
    const t = await ensureTransport();
    await t.join({ room: code, pid, role: "guest", name: profile.name });
  } catch (err) {
    removeKey(SESSION_KEY, "session");
    setGame({ busy: false, joinError: errorText(err) });
    return;
  }
  writeJSON(SESSION_KEY, { room: code, role: "guest" }, "session");
  setGame({ room: code, role: "guest", screen: "room", busy: false });
  window.history.replaceState(null, "", location.pathname);
  hostWasOnline = getGame().members.some((m) => m.role === "host");
  sendHello();
}

export function leaveRoom(reason?: string) {
  transport?.leave();
  engine?.dispose();
  engine = null;
  removeKey(SESSION_KEY, "session");
  removeKey(ENGINE_KEY, "session");
  loadedMatchId = null;
  loadingMatchId = null;
  pendingLoad = null;
  hostWasOnline = false;
  sound.setTension(0);
  setGame({
    room: null,
    role: null,
    match: null,
    members: [],
    opponents: {},
    emotes: [],
    powerInbox: [],
    screen: "home",
    net: "idle",
    busy: false,
    assetsLoading: null,
    joinError: reason ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* פעולות                                                              */
/* ------------------------------------------------------------------ */

export function hostUpdateSettings(patch: Partial<MatchSettings>) {
  engine?.updateSettings(patch);
}

export function hostStart(): StartResult {
  return engine ? engine.startMatch() : "not-ready";
}

export function hostForceNext() {
  engine?.forceNext();
}

export function hostBackToLobby() {
  engine?.backToLobby();
}

export function hostRemovePlayer(slot: number) {
  engine?.removePlayer(slot);
}

export function sendToHost(msg: ToHostMsg) {
  const { role, pid } = getGame();
  if (role === "host") engine?.receive(pid, msg);
  else transport?.send(msg);
}

export function patchMe(patch: PlayerPatch) {
  sendToHost({ k: "player", patch });
}

export function sendNote(text: string) {
  sendToHost({ k: "note", text });
}

export function sendNext(roundId: string) {
  sendToHost({ k: "next", roundId });
}

export function sendFinish(roundId: string, result: { timeMs: number; moves: number; bestCombo: number; powersUsed: number }) {
  sendToHost({ k: "finish", roundId, ...result });
}

export function sendPeer(msg: PeerMsg, to?: string) {
  const { role, pid } = getGame();
  transport?.send(msg, to);
  if (role === "host") engine?.receivePeer(pid, msg);
}

export function sendEmote(emoji: string) {
  sendPeer({ k: "emote", emoji, nonce: uid(6) });
  pushEmote(emoji, true, getGame().profile.name);
  sound.play("emote");
}

/** כוח התקפה נשלח לשחקן/ית אחד/ת; כוח אישי מודיע לכולם */
export function sendPower(roundId: string, power: PowerKind, target: string | null) {
  sendPeer({ k: "power", roundId, power, target, nonce: uid(6) });
}

/* ------------------------------------------------------------------ */
/* הודעות נכנסות                                                       */
/* ------------------------------------------------------------------ */

function onMessage(from: string, msg: NetMessage) {
  const { role } = getGame();
  switch (msg.k) {
    case "progress":
      setGame((s) => ({
        opponents: {
          ...s.opponents,
          [from]: {
            roundId: msg.roundId,
            correct: msg.correct,
            total: msg.total,
            moves: msg.moves,
            combo: msg.combo,
            bestCombo: msg.bestCombo,
            board: msg.board,
            at: Date.now(),
          },
        },
      }));
      if (role === "host") engine?.receivePeer(from, msg);
      return;
    case "power":
      if (role === "host") engine?.receivePeer(from, msg);
      setGame((s) => ({
        powerInbox: [...s.powerInbox, { id: msg.nonce, roundId: msg.roundId, kind: msg.power, from, target: msg.target }],
      }));
      return;
    case "emote":
      pushEmote(msg.emoji, false, nameOf(from));
      sound.play("emote");
      return;
    case "state":
      if (role === "guest") onGuestState(msg.state);
      return;
    case "asset":
      if (role === "guest") onAsset(msg);
      return;
    case "denied":
      if (role === "guest") leaveRoom("החדר הזה מלא — אין מקום פנוי כרגע.");
      return;
    default:
      if (role === "host" && engine) {
        const result = engine.receive(from, msg);
        if (result === "denied") transport?.send({ k: "denied", reason: "full" }, from);
      }
  }
}

function onPresence(members: Member[]) {
  const { role } = getGame();
  setGame({ members });
  if (role === "host" && engine) engine.setOnline(new Set(members.map((m) => m.pid)));
  if (role === "guest") {
    const hostOnline = members.some((m) => m.role === "host");
    if (hostOnline && !hostWasOnline) sendHello();
    hostWasOnline = hostOnline;
  }
}

function onStatus(status: NetStatus) {
  const previous = getGame().net;
  setGame({ net: status });
  if (status === "online" && previous === "reconnecting") {
    const { role } = getGame();
    if (role === "host" && engine) transport?.send({ k: "state", state: engine.state });
    if (role === "guest") sendHello();
  }
}

function sendHello() {
  if (getGame().role !== "guest") return;
  transport?.send({ k: "hello", profile: sanitizeProfile(getGame().profile), assetsFor: loadedMatchId });
}

function onEngineEmit(state: MatchState) {
  const previous = getGame().match;
  setGame({ match: state });
  transport?.send({ k: "state", state });
  persistEngine();
  afterStateChange(previous, state);
}

function persistEngine() {
  if (engine) writeJSON(ENGINE_KEY, engine.snapshot(), "session");
}

function onGuestState(state: MatchState) {
  const previous = getGame().match;
  setGame({ match: state });
  afterStateChange(previous, state);

  const me = state.players.find((p) => p.pid === getGame().pid);
  if (!me) {
    sendHello();
    return;
  }
  if (state.phase === "lobby" || !state.photos.length) return;
  if (loadedMatchId === state.matchId) {
    if (!me.assetsReady) transport?.send({ k: "assets-ready", matchId: state.matchId });
    return;
  }
  void ensureAssets(state.photos, state.matchId).then((ok) => {
    if (ok && getGame().match?.matchId === state.matchId) transport?.send({ k: "assets-ready", matchId: state.matchId });
    if (!ok) toast("חלק מהתמונות לא הגיעו. אם זה נמשך — חזרו ללובי והתחילו מחדש.", "warn", 6000);
  });
}

/** תגובות משותפות לשינויי מצב — צלילים והודעות */
function afterStateChange(previous: MatchState | null, next: MatchState) {
  const { pid } = getGame();
  if (previous?.round?.id !== next.round?.id) setGame({ opponents: {}, powerInbox: [] });

  const me = next.players.find((p) => p.pid === pid);
  if (previous && previous.phase !== next.phase) {
    if (next.phase === "roundEnd" && me) {
      const result = next.results[next.results.length - 1];
      if (result) sound.play(result.winner === me.slot ? "win" : "lose");
    }
    if (next.phase === "matchEnd") sound.play("victory");
  }

  if (previous && me) {
    for (const after of next.players) {
      if (after.pid === pid) continue;
      const before = previous.players.find((p) => p.pid === after.pid);
      if (after.connected && (!before || !before.connected)) {
        toast(`${after.avatar} ${after.name} ${say(after.gender, "נכנס", "נכנסה")} לחדר`, "love");
        sound.play("join");
      } else if (before?.connected && !after.connected) {
        toast(
          `${after.name} ${say(after.gender, "התנתק", "התנתקה")} — מחכים ${say(after.gender, "שיחזור", "שתחזור", "שיחזרו")}…`,
          "warn",
          5000,
        );
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* תמונות למשחק                                                        */
/* ------------------------------------------------------------------ */

async function hostPrepare(photos: PhotoMeta[], matchId: string) {
  const others = (engine?.state.players.length ?? 1) > 1;
  const unique = dedupe(photos);
  if (others) {
    // שידור אחד לכל מי שבחדר — תמונות שהועלו מהמחשב לא עוברות דרך שום שרת חיצוני
    for (const photo of unique) {
      if (photo.url) continue;
      const blob = uploadBlobs.get(photo.id);
      if (!blob) continue;
      const parts = chunkString(await blobToBase64(blob), ASSET_CHUNK);
      parts.forEach((data, part) =>
        transport?.send({ k: "asset", matchId, photoId: photo.id, mime: blob.type || "image/jpeg", part, parts: parts.length, data }),
      );
    }
  }
  const ok = await ensureAssets(unique, matchId);
  if (ok && engine && engine.state.matchId === matchId) engine.receive(getGame().pid, { k: "assets-ready", matchId });
  if (!ok) toast("חלק מהתמונות לא נטענו. חזרו ללובי ונסו שוב.", "warn", 6000);
}

function dedupe(photos: PhotoMeta[]): PhotoMeta[] {
  const seen = new Set<string>();
  return photos.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

async function ensureAssets(photos: PhotoMeta[], matchId: string): Promise<boolean> {
  if (loadedMatchId === matchId) return true;
  if (loadingMatchId === matchId && pendingLoad) return pendingLoad;
  loadingMatchId = matchId;
  const unique = dedupe(photos);
  let done = 0;
  setGame({ assetsLoading: { done, total: unique.length } });
  const job = (async () => {
    const results = await Promise.all(
      unique.map(async (photo) => {
        try {
          const url = await resolveAssetUrl(photo);
          await loadImage(url);
          setGame((s) => ({ assets: { ...s.assets, [photo.id]: url } }));
          return true;
        } catch {
          return false;
        } finally {
          done++;
          if (loadingMatchId === matchId) setGame({ assetsLoading: { done, total: unique.length } });
        }
      }),
    );
    const ok = results.every(Boolean);
    if (loadingMatchId === matchId) {
      loadingMatchId = null;
      pendingLoad = null;
      setGame({ assetsLoading: null });
      if (ok) loadedMatchId = matchId;
    }
    return ok;
  })();
  pendingLoad = job;
  return job;
}

async function resolveAssetUrl(photo: PhotoMeta): Promise<string> {
  if (photo.url) return photo.url;
  const existing = objectUrls.get(photo.id);
  if (existing) return existing;
  const blob = uploadBlobs.get(photo.id);
  if (blob) {
    const url = URL.createObjectURL(blob);
    objectUrls.set(photo.id, url);
    return url;
  }
  return new Promise<string>((resolve, reject) => {
    const list = waiters.get(photo.id) ?? [];
    list.push(resolve);
    waiters.set(photo.id, list);
    window.setTimeout(() => reject(new Error("asset timeout")), 45_000);
  });
}

function onAsset(msg: AssetMsg) {
  const ready = objectUrls.get(msg.photoId);
  if (ready) {
    flushWaiters(msg.photoId, ready);
    return;
  }
  if (msg.part < 0 || msg.part >= msg.parts) return;
  let entry = incoming.get(msg.photoId);
  if (!entry || entry.parts.length !== msg.parts) {
    entry = { parts: Array.from({ length: msg.parts }, () => ""), received: 0, mime: msg.mime };
    incoming.set(msg.photoId, entry);
  }
  if (!entry.parts[msg.part]) {
    entry.parts[msg.part] = msg.data;
    entry.received++;
  }
  if (entry.received < msg.parts) return;
  incoming.delete(msg.photoId);
  const url = URL.createObjectURL(base64ToBlob(entry.parts.join(""), entry.mime));
  objectUrls.set(msg.photoId, url);
  flushWaiters(msg.photoId, url);
}

function flushWaiters(photoId: string, url: string) {
  waiters.get(photoId)?.forEach((resolve) => resolve(url));
  waiters.delete(photoId);
}

/* ------------------------------------------------------------------ */
/* ספריית התמונות                                                      */
/* ------------------------------------------------------------------ */

export function loadLibrary(force = false): Promise<void> {
  if (libraryPromise && !force) return libraryPromise;
  libraryPromise = (async () => {
    const [folder, premium, uploads] = await Promise.all([fetchFolderPhotos(), fetchPremiumPhotos(), loadStoredUploads()]);
    uploads.forEach((u) => uploadBlobs.set(u.meta.id, u.blob));
    const cache = readJSON<Record<string, number>>(DETAIL_KEY, {});
    const library = [...folder, ...uploads.map((u) => u.meta), ...premium].map((p) =>
      cache[p.id] !== undefined ? { ...p, detail: cache[p.id] } : p,
    );
    setGame({ library, libraryReady: true });
    void scoreLibrary();
  })();
  return libraryPromise;
}

async function scoreLibrary() {
  const cache = readJSON<Record<string, number>>(DETAIL_KEY, {});
  let changed = false;
  for (const photo of getGame().library) {
    if (photo.detail !== undefined) continue;
    // התמונות של השלב קודמות לדירוג הפרטים — אחרת ההכנה למשחק מחכה בתור מאחורי כל הספרייה
    while (getGame().assetsLoading) await new Promise((resolve) => window.setTimeout(resolve, 250));
    const url = libraryThumb(photo);
    if (!url) continue;
    try {
      const score = detailScore(await loadImage(url));
      cache[photo.id] = score;
      changed = true;
      setGame((s) => ({ library: s.library.map((p) => (p.id === photo.id ? { ...p, detail: score } : p)) }));
    } catch {
      /* תמונה שלא נטענה — מדלגים */
    }
  }
  if (changed) writeJSON(DETAIL_KEY, cache);
}

export function libraryThumb(photo: PhotoMeta): string | null {
  if (photo.url) return photo.url;
  const existing = objectUrls.get(photo.id);
  if (existing) return existing;
  const blob = uploadBlobs.get(photo.id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(photo.id, url);
  return url;
}

export async function addPhotos(files: File[]) {
  const { added, failed } = await importUploads(files);
  added.forEach((u) => uploadBlobs.set(u.meta.id, u.blob));
  if (added.length) {
    setGame((s) => ({
      library: [
        ...s.library.filter((p) => p.source !== "premium"),
        ...added.map((u) => u.meta),
        ...s.library.filter((p) => p.source === "premium"),
      ],
    }));
    toast(added.length === 1 ? "נוספה תמונה אחת 💞" : `נוספו ${added.length} תמונות 💞`, "love");
    void scoreLibrary();
  }
  if (failed) toast(`${failed} קבצים לא נתמכים (למשל HEIC מאייפון) — נסו JPG או PNG`, "warn", 5000);
}

export async function removeUploadedPhoto(id: string) {
  if (!id.startsWith("upload:")) return;
  await forgetUpload(id);
  uploadBlobs.delete(id);
  setGame((s) => ({ library: s.library.filter((p) => p.id !== id) }));
}
