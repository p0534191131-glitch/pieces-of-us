import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { Emitter } from "@/lib/emitter";
import type { NetMessage, Role } from "@/game/types";
import { JoinFailure, type JoinOptions, type Member, type Transport, type TransportEvents } from "./transport";

/**
 * מימוש לזמן-אמת של Supabase (Lovable Cloud).
 * נטען רק כשמוגדרים VITE_SUPABASE_URL + מפתח ציבורי. לא דורש טבלאות — רק Broadcast ו-Presence של ערוץ.
 * שימו לב: לא נבדק מול פרויקט Supabase אמיתי בגרסה המקומית — לבדוק אחרי החיבור ל-Lovable Cloud.
 */

interface PresenceMeta {
  pid: string;
  role: Role;
  name: string;
}

interface Envelope {
  from: string;
  to?: string;
  data: NetMessage;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** כמה מחשבים בחדר אחד (כולל המארח/ת) — כמו בשרת המקומי */
const MAX_MEMBERS = 6;

export class SupabaseTransport implements Transport {
  readonly kind = "supabase" as const;
  private events = new Emitter<TransportEvents>();
  private client: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private opts: JoinOptions | null = null;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, { realtime: { params: { eventsPerSecond: 40 } } });
  }

  on<E extends keyof TransportEvents>(event: E, handler: TransportEvents[E]) {
    return this.events.on(event, handler);
  }

  async join(opts: JoinOptions): Promise<void> {
    this.leave();
    this.opts = opts;
    this.events.emit("status", "connecting");

    const channel = this.client.channel(`pieces-of-us:${opts.room}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: opts.pid } },
    });
    this.channel = channel;

    let synced = false;
    channel.on("broadcast", { event: "msg" }, ({ payload }) => {
      const envelope = payload as Envelope | undefined;
      if (!envelope || envelope.from === opts.pid) return;
      if (envelope.to && envelope.to !== opts.pid) return;
      this.events.emit("message", envelope.from, envelope.data);
    });
    channel.on("broadcast", { event: "closed" }, () => this.events.emit("closed"));
    channel.on("presence", { event: "sync" }, () => {
      synced = true;
      this.events.emit("presence", this.members());
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.events.emit("status", "online");
          if (!settled) {
            settled = true;
            resolve();
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (!settled) {
            settled = true;
            reject(new JoinFailure("server-unreachable"));
          } else {
            this.events.emit("status", "reconnecting");
          }
        } else if (status === "CLOSED") {
          this.events.emit("status", "offline");
        }
      });
    });

    // מחכים לתמונת הנוכחות הראשונה כדי לבדוק שהחדר קיים ושיש בו מקום
    for (let i = 0; i < 20 && !synced; i++) await wait(100);
    const others = this.members().filter((m) => m.pid !== opts.pid);
    const failure =
      opts.role === "host" && others.some((m) => m.role === "host")
        ? "room-taken"
        : opts.role === "guest" && !others.some((m) => m.role === "host")
          ? "room-not-found"
          : opts.role === "guest" && others.length >= MAX_MEMBERS
            ? "room-full"
            : null;
    if (failure) {
      await this.client.removeChannel(channel);
      this.channel = null;
      throw new JoinFailure(failure);
    }
    await channel.track({ pid: opts.pid, role: opts.role, name: opts.name } satisfies PresenceMeta);
  }

  send(msg: NetMessage, to?: string) {
    if (!this.channel || !this.opts) return;
    const payload: Envelope = { from: this.opts.pid, to, data: msg };
    void this.channel.send({ type: "broadcast", event: "msg", payload });
  }

  leave() {
    const channel = this.channel;
    if (!channel) return;
    if (this.opts?.role === "host") void channel.send({ type: "broadcast", event: "closed", payload: {} });
    void channel.untrack();
    void this.client.removeChannel(channel);
    this.channel = null;
  }

  private members(): Member[] {
    const state = this.channel?.presenceState<PresenceMeta>() ?? {};
    const list: Member[] = [];
    for (const metas of Object.values(state)) {
      const meta = metas[0];
      if (meta) list.push({ pid: meta.pid, role: meta.role, name: meta.name });
    }
    return list;
  }
}
