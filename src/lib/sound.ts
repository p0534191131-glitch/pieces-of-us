import { readJSON, writeJSON } from "./storage";

/**
 * כל הצלילים והמוזיקה מסונתזים בזמן אמת ב-Web Audio — אין קבצי שמע, אין זכויות יוצרים, עובד גם בלי אינטרנט.
 */

export type Sfx =
  | "tap"
  | "pick"
  | "drop"
  | "swap"
  | "place"
  | "double"
  | "locked"
  | "combo"
  | "power-ready"
  | "power-send"
  | "power-hit"
  | "freeze"
  | "peek"
  | "magnet"
  | "heartbeat"
  | "go"
  | "shatter"
  | "finish"
  | "win"
  | "lose"
  | "victory"
  | "emote"
  | "join"
  | "ready"
  | "record"
  | "milestone";

export interface SoundPrefs {
  sfx: boolean;
  music: boolean;
}

const PREFS_KEY = "pou:sound";

/** פנטטוני דו מז'ור, מ-C5 ומעלה — כל חלק שננעל מטפס צליל */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];

/** Cmaj7 → Am7 → Fmaj7 → G — מהלך רך ורומנטי */
const CHORDS = [
  [130.81, 196.0, 246.94, 329.63],
  [110.0, 164.81, 196.0, 261.63],
  [87.31, 130.81, 174.61, 220.0],
  [98.0, 146.83, 196.0, 246.94],
];
const MELODY = [
  [523.25, 659.25, 783.99, 987.77, 1046.5],
  [440.0, 523.25, 659.25, 783.99, 880.0],
  [349.23, 440.0, 523.25, 659.25, 698.46],
  [392.0, 493.88, 587.33, 783.99, 880.0],
];

interface ToneOpts {
  f: number;
  type?: OscillatorType;
  t?: number;
  dur: number;
  vol: number;
  attack?: number;
  to?: number;
  pan?: number;
  verb?: number;
  music?: boolean;
}

interface NoiseOpts {
  t?: number;
  dur: number;
  vol: number;
  type: BiquadFilterType;
  f: number;
  to?: number;
  q?: number;
  verb?: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private verbIn: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** מוזיקה כבויה כברירת מחדל — מדליקים בכפתור ♫ למי שרוצה */
  private prefs: SoundPrefs = readJSON<SoundPrefs>(PREFS_KEY, { sfx: true, music: false });
  private listeners = new Set<() => void>();
  private unlocked = false;
  private musicTimer = 0;
  private musicNext = 0;
  private musicStep = 0;
  private tension = 0;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.pauseMusic();
        else if (this.unlocked && this.prefs.music) this.resumeMusic();
      });
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SoundPrefs => this.prefs;

  setSfx(on: boolean) {
    this.prefs = { ...this.prefs, sfx: on };
    this.save();
    if (on) this.play("tap");
  }

  setMusic(on: boolean) {
    this.prefs = { ...this.prefs, music: on };
    this.save();
    if (on && this.unlocked) this.resumeMusic();
    if (!on) this.pauseMusic();
  }

  /** נקרא בלחיצה הראשונה של המשתמש — דפדפנים לא מאפשרים אודיו לפני אינטראקציה */
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (!this.unlocked) {
      this.unlocked = true;
      if (this.prefs.music && !document.hidden) this.resumeMusic();
    }
  }

  /** 0..1 — ככל שהמירוץ צמוד וקרוב לסוף, המוזיקה נעשית דחופה ונכנס דופק לב */
  setTension(value: number) {
    this.tension = Math.max(0, Math.min(1, value));
  }

  play(name: Sfx, level = 0) {
    if (!this.prefs.sfx) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const note = (i: number) => SCALE[Math.max(0, Math.min(SCALE.length - 1, i))];

    switch (name) {
      case "tap":
        this.tone({ f: 1250, dur: 0.05, vol: 0.045 });
        break;
      case "pick":
        this.tone({ f: 540, to: 760, dur: 0.09, vol: 0.07, type: "triangle" });
        break;
      case "drop":
        this.tone({ f: 520, to: 380, dur: 0.08, vol: 0.05, type: "triangle" });
        break;
      case "swap":
        this.hiss({ dur: 0.11, vol: 0.08, type: "bandpass", f: 2600, to: 900, q: 1.2 });
        this.tone({ f: 240, to: 180, dur: 0.08, vol: 0.06 });
        break;
      case "place":
        this.bell(note(level));
        break;
      case "double":
        this.bell(note(level));
        this.bell(note(level + 2), 0.08);
        break;
      case "locked":
        this.tone({ f: 170, to: 120, dur: 0.12, vol: 0.09, type: "triangle" });
        break;
      case "combo":
        [0, 2, 4].forEach((step, i) =>
          this.tone({ f: note(level + step), t: i * 0.055, dur: 0.32, vol: 0.07, type: "triangle", verb: 0.35 }),
        );
        break;
      case "power-ready":
        for (let i = 0; i < 6; i++) {
          this.tone({ f: note(4 + i), t: i * 0.035, dur: 0.35, vol: 0.045, verb: 0.6, pan: i % 2 ? 0.4 : -0.4 });
        }
        this.hiss({ dur: 0.4, vol: 0.03, type: "highpass", f: 5000, verb: 0.5 });
        break;
      case "power-send":
        this.hiss({ dur: 0.38, vol: 0.11, type: "bandpass", f: 500, to: 5000, q: 2 });
        this.tone({ f: 320, to: 1300, dur: 0.32, vol: 0.05, type: "triangle" });
        break;
      case "power-hit":
        this.tone({ f: 880, to: 170, dur: 0.45, vol: 0.08, type: "triangle", verb: 0.3 });
        this.hiss({ dur: 0.3, vol: 0.05, type: "lowpass", f: 1800, to: 300 });
        break;
      case "freeze":
        [2093, 2637, 3136, 4186].forEach((f, i) =>
          this.tone({ f, t: i * 0.03, dur: 0.8, vol: 0.028, verb: 0.9, pan: i % 2 ? 0.5 : -0.5 }),
        );
        break;
      case "peek":
        this.hiss({ dur: 0.45, vol: 0.05, type: "lowpass", f: 400, to: 4000 });
        this.bell(1568, 0.1, 0.07);
        break;
      case "magnet":
        this.tone({ f: 300, to: 900, dur: 0.22, vol: 0.05, type: "triangle" });
        this.bell(1318.5, 0.2, 0.1);
        break;
      case "heartbeat":
        this.tone({ f: 72, to: 48, dur: 0.18, vol: 0.55 });
        this.tone({ f: 150, to: 95, dur: 0.07, vol: 0.12, type: "triangle" });
        this.tone({ f: 64, to: 45, t: 0.2, dur: 0.2, vol: 0.38 });
        break;
      case "go":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone({ f, t: i * 0.012, dur: 0.7, vol: 0.06, type: "triangle", verb: 0.5 }),
        );
        this.hiss({ t: 0.02, dur: 0.35, vol: 0.045, type: "highpass", f: 6000, verb: 0.4 });
        break;
      case "shatter":
        this.hiss({ dur: 0.35, vol: 0.09, type: "highpass", f: 2500, to: 7000, verb: 0.3 });
        for (let i = 0; i < 6; i++) {
          this.tone({ f: 2000 + Math.random() * 3000, t: Math.random() * 0.25, dur: 0.06, vol: 0.022 });
        }
        break;
      case "finish":
        [2, 4, 6, 7, 9].forEach((step, i) => this.bell(note(step), i * 0.07, 0.09));
        break;
      case "win":
        [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98].forEach((f, i) =>
          this.tone({ f, t: i * 0.075, dur: 1.1, vol: 0.07, type: "triangle", verb: 0.55, pan: (i / 5) * 1.2 - 0.6 }),
        );
        break;
      case "lose":
        [659.25, 523.25, 440].forEach((f, i) => this.tone({ f, t: i * 0.17, dur: 0.6, vol: 0.06, verb: 0.5 }));
        break;
      case "victory": {
        const seq = [
          [523.25, 659.25, 783.99],
          [587.33, 698.46, 880],
          [659.25, 783.99, 987.77],
          [783.99, 987.77, 1174.66, 1567.98],
        ];
        seq.forEach((chord, i) =>
          chord.forEach((f) =>
            this.tone({ f, t: i * 0.16, dur: i === 3 ? 1.7 : 0.3, vol: 0.05, type: "triangle", verb: 0.6 }),
          ),
        );
        this.hiss({ t: 0.48, dur: 1.2, vol: 0.035, type: "highpass", f: 7000, verb: 0.6 });
        break;
      }
      case "emote":
        this.tone({ f: 620, to: 1250, dur: 0.14, vol: 0.07 });
        break;
      case "join":
        this.bell(783.99, 0, 0.1);
        this.bell(1046.5, 0.12, 0.1);
        break;
      case "ready":
        this.tone({ f: 1318.5, dur: 0.15, vol: 0.06, type: "triangle", verb: 0.3 });
        break;
      case "record":
        for (let i = 0; i < 7; i++) this.tone({ f: note(3 + i), t: i * 0.045, dur: 0.4, vol: 0.05, verb: 0.6 });
        break;
      case "milestone":
        this.bell(1046.5, 0, 0.04, 0.3);
        break;
    }
  }

  /* ------------------------------------------------------------------ */

  private save() {
    writeJSON(PREFS_KEY, this.prefs);
    this.listeners.forEach((l) => l());
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 14;
      comp.ratio.value = 3;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      comp.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);

      const sfx = ctx.createGain();
      sfx.gain.value = 0.9;
      sfx.connect(master);

      const music = ctx.createGain();
      music.gain.value = 0;
      music.connect(master);

      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(ctx, 2.6, 2.6);
      const verbIn = ctx.createGain();
      verbIn.gain.value = 0.8;
      verbIn.connect(verb);
      verb.connect(master);

      // המוזיקה נשלחת להדהוד אחרי סינון בס, כדי שדופק הלב לא יתערפל
      const musicHp = ctx.createBiquadFilter();
      musicHp.type = "highpass";
      musicHp.frequency.value = 280;
      const musicSend = ctx.createGain();
      musicSend.gain.value = 0.6;
      music.connect(musicHp);
      musicHp.connect(musicSend);
      musicSend.connect(verbIn);

      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.sfxBus = sfx;
      this.musicBus = music;
      this.verbIn = verbIn;
      this.noise = noise;
      return ctx;
    } catch {
      return null;
    }
  }

  private impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return buffer;
  }

  private tone(o: ToneOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.musicBus || !this.verbIn) return;
    const t0 = ctx.currentTime + (o.t ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur * 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t0 + (o.attack ?? 0.004));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(gain);
    let out: AudioNode = gain;
    if (o.pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = o.pan;
      gain.connect(panner);
      out = panner;
    }
    out.connect(o.music ? this.musicBus : this.sfxBus);
    if (o.verb) {
      const send = ctx.createGain();
      send.gain.value = o.verb;
      out.connect(send);
      send.connect(this.verbIn);
    }
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  private hiss(o: NoiseOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.sfxBus || !this.verbIn) return;
    const t0 = ctx.currentTime + (o.t ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.setValueAtTime(o.f, t0);
    filter.Q.value = o.q ?? 1;
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(o.vol, t0 + Math.min(0.02, o.dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    if (o.verb) {
      const send = ctx.createGain();
      send.gain.value = o.verb;
      gain.connect(send);
      send.connect(this.verbIn);
    }
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.05);
  }

  private bell(f: number, t = 0, vol = 0.14, verb = 0.45) {
    this.tone({ f, t, dur: 0.9, vol, verb });
    this.tone({ f: f * 2.01, t, dur: 0.5, vol: vol * 0.35, verb });
    this.tone({ f: f * 3.99, t, dur: 0.22, vol: vol * 0.12 });
  }

  private resumeMusic() {
    const ctx = this.ensure();
    if (!ctx || !this.musicBus || this.musicTimer) return;
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.42, ctx.currentTime, 1.2);
    this.musicNext = ctx.currentTime + 0.12;
    this.musicTimer = window.setInterval(() => this.schedule(), 80);
  }

  private pauseMusic() {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = 0;
    }
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    }
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const eighth = 60 / 74 / 2;
    while (this.musicNext < ctx.currentTime + 0.3) {
      const t = Math.max(0, this.musicNext - ctx.currentTime);
      const bar = Math.floor(this.musicStep / 8) % CHORDS.length;
      const pos = this.musicStep % 8;
      if (pos === 0) this.pad(CHORDS[bar], t, eighth * 8);

      const chance = pos % 2 === 0 ? 0.42 + this.tension * 0.3 : 0.16 + this.tension * 0.35;
      if (Math.random() < chance) {
        const notes = MELODY[bar];
        const f = notes[Math.floor(Math.random() * notes.length)] * (Math.random() < 0.22 ? 2 : 1);
        this.tone({ f, t, dur: 1.6, vol: 0.032 + Math.random() * 0.014, type: "triangle", music: true, pan: Math.random() * 1.2 - 0.6 });
        this.tone({ f: f * 2, t, dur: 0.5, vol: 0.007, music: true });
      }

      if (this.tension > 0.5) {
        const every = this.tension > 0.85 ? 2 : 4;
        if (pos % every === 0) {
          this.tone({ f: 66, to: 46, t, dur: 0.2, vol: 0.24 * this.tension, music: true });
          this.tone({ f: 60, to: 44, t: t + 0.19, dur: 0.2, vol: 0.15 * this.tension, music: true });
        }
      }

      this.musicNext += eighth;
      this.musicStep++;
    }
  }

  private pad(chord: number[], t: number, dur: number) {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const t0 = ctx.currentTime + t;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650 + this.tension * 1100;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.018, t0 + 1.4);
    gain.gain.setValueAtTime(0.018, t0 + dur);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur + 1.8);
    filter.connect(gain);
    gain.connect(this.musicBus);
    for (const f of chord) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t0);
        osc.stop(t0 + dur + 1.9);
      }
    }
  }
}

export const sound = new SoundEngine();
