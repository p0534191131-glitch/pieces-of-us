#!/usr/bin/env node
/**
 * חלקים מאיתנו — שרת המשחק המקומי
 *
 *  - מגיש את המשחק (אחרי build) לכל המחשבים ברשת הביתית
 *  - מגיש את התמונות מתיקיית photos (ברירת מחדל: ../photos, או PHOTOS_DIR)
 *  - מנהל חדרים בזמן אמת ב-WebSocket ומעביר הודעות בין השחקנים (עד 6 בחדר)
 *
 *  הפעלה:  npm run play   → בונה, מפעיל ופותח דפדפן
 *          npm start      → מפעיל בלבד (אחרי build)
 *          npm run dev    → מצב פיתוח (Vite על 5173 + השרת הזה)
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const ARGS = new Set(process.argv.slice(2));
const DEV = ARGS.has("--dev");
const PORT = Number(process.env.PORT) || 5200;
const APP_PORT = DEV ? 5173 : PORT;
const PHOTOS_DIR = resolvePhotosDir();
const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i;
const ROOM_TTL_MS = 45 * 60 * 1000;
/** כמה מחשבים יכולים להיות בחדר אחד (כולל המארח/ת) */
const MAX_MEMBERS = 6;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function resolvePhotosDir() {
  const candidates = [process.env.PHOTOS_DIR, path.resolve(ROOT, "..", "photos"), path.join(ROOT, "photos")].filter(Boolean);
  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) return path.resolve(dir);
    } catch {
      /* next candidate */
    }
  }
  return path.resolve(ROOT, "..", "photos");
}

/** כתובות ה-IP ברשת הביתית — מתאמים וירטואליים (WSL, VMware וכו') בסוף הרשימה */
function lanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family !== "IPv4" || addr.internal || addr.address.startsWith("169.254.")) continue;
      found.push({ name, address: addr.address });
    }
  }
  const isVirtual = (n) => /vethernet|vmware|virtualbox|hyper-v|wsl|docker|loopback|tailscale|zerotier|vpn/i.test(n);
  const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : 3);
  return found
    .sort((a, b) => Number(isVirtual(a.name)) - Number(isVirtual(b.name)) || rank(a.address) - rank(b.address))
    .map((a) => a.address);
}

async function listPhotos() {
  let files = [];
  try {
    files = await fsp.readdir(PHOTOS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => IMAGE_RE.test(f))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const match = file.match(/^(us|sweet)-([a-z0-9]+)-(\d+)\./i);
      return {
        id: `folder:${file}`,
        group: match ? match[1].toLowerCase() : "other",
        session: match ? match[2].toLowerCase() : null,
        label: file.replace(/\.[^.]+$/, ""),
        url: `/photos/${encodeURIComponent(file)}`,
      };
    });
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

function sendJson(res, value) {
  const body = JSON.stringify(value);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function safeJoin(base, relative) {
  const target = path.resolve(base, "." + path.sep + relative);
  return target === base || target.startsWith(base + path.sep) ? target : null;
}

async function serveFile(req, res, filePath, cacheControl) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Cache-Control": cacheControl });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(filePath)
    .on("error", () => res.destroy())
    .pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
    } catch {
      return sendText(res, 400, "Bad request");
    }

    if (pathname === "/api/health") return sendJson(res, { ok: true });

    if (pathname === "/api/info") {
      return sendJson(res, {
        app: "pieces-of-us",
        port: APP_PORT,
        dev: DEV,
        lan: lanAddresses().map((ip) => `http://${ip}:${APP_PORT}`),
        photosDir: PHOTOS_DIR,
      });
    }

    if (pathname === "/api/photos") return sendJson(res, { photos: await listPhotos() });

    if (pathname.startsWith("/photos/")) {
      const name = path.basename(pathname.slice("/photos/".length));
      const file = IMAGE_RE.test(name) ? safeJoin(PHOTOS_DIR, name) : null;
      if (file && (await serveFile(req, res, file, "no-cache"))) return;
      return sendText(res, 404, "Not found");
    }

    if (DEV) return sendText(res, 404, `Development mode: open http://localhost:${APP_PORT}`);

    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = safeJoin(DIST, relative);
    const cache = relative.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    if (file && (await serveFile(req, res, file, cache))) return;

    if (!path.extname(pathname)) {
      if (await serveFile(req, res, path.join(DIST, "index.html"), "no-cache")) return;
      return sendText(res, 503, "The game is not built yet. Run: npm run build   |   המשחק עוד לא נבנה — הריצו npm run build");
    }
    sendText(res, 404, "Not found");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendText(res, 500, "Server error");
    else res.destroy();
  }
});

/* ------------------------------------------------------------------ */
/* חדרים בזמן אמת                                                      */
/* ------------------------------------------------------------------ */

/** @type {Map<string, { code: string, hostPid: string, members: Map<string, { ws: import("ws").WebSocket, role: "host" | "guest", name: string, online: boolean }>, emptySince: number | null }>} */
const rooms = new Map();

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  let pathname = "";
  try {
    pathname = new URL(req.url ?? "/", "http://local").pathname;
  } catch {
    /* ignore */
  }
  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

function membersOf(room) {
  return [...room.members.entries()]
    .filter(([, m]) => m.online)
    .map(([pid, m]) => ({ pid, role: m.role, name: m.name }));
}

function sendFrame(ws, frame) {
  if (ws.readyState === ws.OPEN) ws.send(typeof frame === "string" ? frame : JSON.stringify(frame));
}

function broadcastPresence(room) {
  const frame = JSON.stringify({ t: "presence", members: membersOf(room) });
  for (const m of room.members.values()) if (m.online) sendFrame(m.ws, frame);
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  /** @type {ReturnType<typeof rooms.get> | null} */
  let room = null;
  let pid = null;

  const fail = (code) => sendFrame(ws, { t: "error", code });

  function join(msg) {
    const { room: code, pid: id, role, name } = msg;
    if (typeof code !== "string" || !/^\d{4}$/.test(code) || typeof id !== "string" || !id || id.length > 64) {
      return fail("bad-request");
    }
    if (role !== "host" && role !== "guest") return fail("bad-request");

    let r = rooms.get(code);
    if (role === "host") {
      if (!r) {
        r = { code, hostPid: id, members: new Map(), emptySince: null };
        rooms.set(code, r);
      } else if (r.hostPid !== id) {
        return fail("room-taken");
      }
    } else {
      if (!r) return fail("room-not-found");
      const othersOnline = [...r.members.entries()].filter(([mPid, m]) => mPid !== id && m.online).length;
      if (othersOnline >= MAX_MEMBERS) return fail("room-full");
      // מקומות של מי שהתנתק ולא חזר משוחררים כשהחדר מתמלא
      if (r.members.size >= MAX_MEMBERS) {
        for (const [mPid, m] of r.members) if (m.role === "guest" && mPid !== id && !m.online) r.members.delete(mPid);
      }
    }

    const previous = r.members.get(id);
    if (previous && previous.ws !== ws) {
      try {
        previous.ws.close(4000, "replaced");
      } catch {
        /* ignore */
      }
    }
    r.members.set(id, { ws, role, name: String(name ?? "").slice(0, 24), online: true });
    r.emptySince = null;
    room = r;
    pid = id;
    sendFrame(ws, { t: "joined", room: code, pid: id, members: membersOf(r) });
    broadcastPresence(r);
  }

  function relay(msg) {
    const frame = JSON.stringify({ t: "msg", from: pid, data: msg.data });
    for (const [mPid, m] of room.members) {
      if (mPid === pid || !m.online) continue;
      if (msg.to && msg.to !== mPid) continue;
      sendFrame(m.ws, frame);
    }
  }

  function leave(explicit) {
    if (!room || !pid) return;
    const r = room;
    const member = r.members.get(pid);
    if (member && member.ws === ws) {
      if (explicit && member.role === "host") {
        rooms.delete(r.code);
        for (const [mPid, m] of r.members) if (mPid !== pid && m.online) sendFrame(m.ws, { t: "closed" });
      } else {
        if (explicit) r.members.delete(pid);
        else member.online = false;
        broadcastPresence(r);
        if (![...r.members.values()].some((m) => m.online)) r.emptySince = Date.now();
      }
    }
    if (explicit) {
      room = null;
      pid = null;
    }
  }

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "ping") return sendFrame(ws, '{"t":"pong"}');
    if (msg.t === "join") return join(msg);
    if (!room || !pid) return;
    if (msg.t === "send") return relay(msg);
    if (msg.t === "leave") return leave(true);
  });

  ws.on("close", () => leave(false));
  ws.on("error", () => leave(false));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
  const now = Date.now();
  for (const [code, r] of rooms) if (r.emptySince && now - r.emptySince > ROOM_TTL_MS) rooms.delete(code);
}, 15000);

/* ------------------------------------------------------------------ */
/* הפעלה                                                               */
/* ------------------------------------------------------------------ */

function openBrowser(url) {
  const command =
    process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, () => undefined);
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use — the game is probably already running.`);
    console.error(`  Open: http://localhost:${APP_PORT}\n`);
    if (ARGS.has("--open")) openBrowser(`http://localhost:${APP_PORT}`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", async () => {
  const lan = lanAddresses();
  const photos = await listPhotos();
  const line = "-".repeat(64);
  console.log(`\n  ${line}`);
  console.log("   Pieces of Us  |  חלקים מאיתנו");
  console.log(`  ${line}`);
  console.log(`   This computer        http://localhost:${APP_PORT}`);
  if (lan.length) {
    console.log(`   Other computers      http://${lan[0]}:${APP_PORT}`);
    for (const ip of lan.slice(1)) console.log(`                        http://${ip}:${APP_PORT}`);
  } else {
    console.log("   No network found — connect every computer to the same Wi-Fi.");
  }
  console.log(`   Photos               ${photos.length} in ${PHOTOS_DIR}`);
  if (DEV) console.log("   Mode                 development (UI served by Vite)");
  else if (!fs.existsSync(path.join(DIST, "index.html"))) console.log("   WARNING              game not built yet — run: npm run build");
  console.log(`  ${line}`);
  console.log("   If Windows asks about network access, choose Allow (private networks).");
  console.log("   Press Ctrl+C to stop.");
  console.log(`  ${line}\n`);
  if (ARGS.has("--open")) openBrowser(`http://localhost:${APP_PORT}`);
});

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.terminate();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 800).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
