import { Emitter } from "@/lib/emitter";
import type { NetMessage } from "@/game/types";
import { JoinFailure, type JoinError, type JoinOptions, type Member, type Transport, type TransportEvents } from "./transport";

type ServerFrame =
  | { t: "joined"; members: Member[] }
  | { t: "presence"; members: Member[] }
  | { t: "msg"; from: string; data: NetMessage }
  | { t: "error"; code: JoinError }
  | { t: "closed" }
  | { t: "pong" };

/** חיבור לשרת המקומי. מתחבר מחדש לבד אם הרשת נפלה לרגע, ושולח את מה שהצטבר בינתיים. */
export class WsTransport implements Transport {
  readonly kind = "local-server" as const;
  private events = new Emitter<TransportEvents>();
  private ws: WebSocket | null = null;
  private opts: JoinOptions | null = null;
  private joined = false;
  private everJoined = false;
  private stopped = true;
  private attempt = 0;
  private retryTimer = 0;
  private pingTimer = 0;
  private queue: string[] = [];
  private pending: { resolve: () => void; reject: (err: JoinFailure) => void } | null = null;

  on<E extends keyof TransportEvents>(event: E, handler: TransportEvents[E]) {
    return this.events.on(event, handler);
  }

  join(opts: JoinOptions): Promise<void> {
    this.leave();
    this.opts = opts;
    this.stopped = false;
    this.everJoined = false;
    this.attempt = 0;
    return new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.connect();
    });
  }

  send(msg: NetMessage, to?: string) {
    const frame = JSON.stringify({ t: "send", to, data: msg });
    if (this.ws && this.joined && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(frame);
      return;
    }
    // עדכוני התקדמות ואימוג'ים מתיישנים מהר — לא שומרים אותם בתור
    if (msg.k === "progress" || msg.k === "emote") return;
    this.queue.push(frame);
    if (this.queue.length > 400) this.queue.shift();
  }

  leave() {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    this.joined = false;
    this.queue = [];
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "leave" }));
        ws.close(1000, "leave");
      } catch {
        /* ignore */
      }
    }
    if (this.pending) {
      this.pending.reject(new JoinFailure("server-unreachable"));
      this.pending = null;
    }
  }

  private connect() {
    if (this.stopped || !this.opts) return;
    this.events.emit("status", this.everJoined ? "reconnecting" : "connecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}//${location.host}/ws`);
    } catch {
      this.fail("server-unreachable");
      return;
    }
    this.ws = ws;
    const openTimeout = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) ws.close();
    }, 7000);

    ws.onopen = () => {
      window.clearTimeout(openTimeout);
      ws.send(JSON.stringify({ t: "join", ...this.opts }));
    };

    ws.onmessage = (event) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(event.data)) as ServerFrame;
      } catch {
        return;
      }
      switch (frame.t) {
        case "joined":
          this.joined = true;
          this.everJoined = true;
          this.attempt = 0;
          this.flush();
          this.startPing();
          this.events.emit("status", "online");
          this.events.emit("presence", frame.members);
          if (this.pending) {
            this.pending.resolve();
            this.pending = null;
          }
          break;
        case "presence":
          this.events.emit("presence", frame.members);
          break;
        case "msg":
          this.events.emit("message", frame.from, frame.data);
          break;
        case "closed":
          this.events.emit("closed");
          break;
        case "error":
          if (this.pending) {
            this.stopped = true;
            const pending = this.pending;
            this.pending = null;
            ws.close();
            pending.reject(new JoinFailure(frame.code));
          } else {
            // בזמן חיבור מחדש (למשל אחרי שהשרת הופעל מחדש) — ננסה שוב עוד רגע
            ws.close();
          }
          break;
        case "pong":
          break;
      }
    };

    ws.onclose = (event) => {
      window.clearTimeout(openTimeout);
      window.clearInterval(this.pingTimer);
      if (this.ws === ws) this.ws = null;
      this.joined = false;
      if (this.stopped) return;
      if (event.code === 4000) {
        // אותו שחקן התחבר מלשונית אחרת. לא מתחברים מחדש — אחרת שתי הלשוניות "יחטפו" זו מזו בלי סוף
        this.stopped = true;
        this.events.emit("status", "offline");
        this.events.emit("replaced");
        return;
      }
      if (!this.everJoined && this.pending) {
        this.fail("server-unreachable");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private fail(code: JoinError) {
    this.stopped = true;
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      pending.reject(new JoinFailure(code));
    }
    this.events.emit("status", "offline");
  }

  private scheduleReconnect() {
    this.events.emit("status", "reconnecting");
    const delay = Math.min(6000, 350 * 2 ** this.attempt);
    this.attempt++;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  private flush() {
    const ws = this.ws;
    if (!ws) return;
    while (this.queue.length && ws.readyState === WebSocket.OPEN) {
      const frame = this.queue.shift();
      if (frame) ws.send(frame);
    }
  }

  private startPing() {
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('{"t":"ping"}');
    }, 15000);
  }
}
