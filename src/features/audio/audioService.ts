import type { Lang } from "../../app/types";
import { lexiconText } from "./lexicon";

export interface AudioSettings {
  sfx: boolean;
  narration: boolean;
  music: boolean;
  volume: number; // 0..1
}
export type Effect = "click" | "correct" | "try-again" | "reward" | "weave" | "welcome";

interface Manifest {
  effects: Record<string, string>;
  music: Record<string, string>;
  speech: Record<string, string>;
}

const STORE = "nasj.audio";
const DEFAULTS: AudioSettings = { sfx: true, narration: true, music: false, volume: 0.8 };
const BASE = `${import.meta.env.BASE_URL}audio/`;

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

/**
 * Reusable audio service. Three independent channels so nothing overlaps unexpectedly:
 *  - effects   (one clip at a time)
 *  - narration (one voice at a time; a new line replaces the previous one)
 *  - music     (a quiet loop)
 * Audio is never required to finish an activity: every failure path is silent and the UI always
 * shows the text/visual alternative.
 */
class AudioService {
  private settings: AudioSettings = load();
  private listeners = new Set<() => void>();
  private manifest: Manifest = { effects: {}, music: {}, speech: {} };
  private manifestReady: Promise<void>;
  private effectEls = new Map<string, HTMLAudioElement>();
  private currentEffect: HTMLAudioElement | null = null;
  private narrationEl: HTMLAudioElement | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private unlocked = false;
  private last: { key?: string; text: string; lang: Lang } | null = null;

  constructor() {
    this.manifestReady = fetch(`${BASE}manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m: Manifest) => {
        this.manifest = { effects: m.effects ?? {}, music: m.music ?? {}, speech: m.speech ?? {} };
      })
      .catch(() => undefined); // no manifest => silent effects + device voice only
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          this.musicEl?.pause();
          this.stopSpeech();
        } else this.startMusic();
      });
    }
  }

  // ---- settings (observable) ----
  getSettings = () => this.settings;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  update(patch: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(STORE, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
    if (this.musicEl) this.musicEl.volume = this.settings.volume * 0.35;
    if (!this.settings.music) this.musicEl?.pause();
    else this.startMusic();
    if (!this.settings.narration) this.stopSpeech();
    this.listeners.forEach((l) => l());
  }

  /** Browsers only allow sound after a user gesture; call from the first tap. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.startMusic();
  }

  // ---- effects ----
  async effect(name: Effect) {
    if (!this.settings.sfx) return;
    await this.manifestReady;
    const file = this.manifest.effects[name];
    if (!file) return;
    let el = this.effectEls.get(name);
    if (!el) {
      el = new Audio(BASE + file);
      el.preload = "auto";
      this.effectEls.set(name, el);
    }
    if (this.currentEffect && this.currentEffect !== el) this.currentEffect.pause();
    this.currentEffect = el;
    el.volume = this.settings.volume;
    el.currentTime = 0;
    el.play().catch(() => undefined);
  }

  // ---- narration / pronunciation ----
  /**
   * Speaks a line. `key` identifies a recorded file in the manifest (e.g. "ar/words/qamar");
   * when none exists, the device's speech synthesis says `text` instead.
   * `manual: true` is used by an explicit "listen" button and ignores the auto-narration toggle.
   */
  async speak(key: string | undefined, text: string, lang: Lang, opts: { manual?: boolean } = {}) {
    if (!opts.manual && !this.settings.narration) return;
    this.stopSpeech();
    const lex = lexiconText(key);
    const line = { key, text: lex?.text ?? text, lang: lex?.lang ?? lang };
    this.last = line;
    await this.manifestReady;
    const file = key ? this.manifest.speech[key] : undefined;
    if (file) {
      const el = new Audio(BASE + file);
      el.volume = this.settings.volume;
      this.narrationEl = el;
      el.addEventListener("error", () => this.tts(line.text, line.lang), { once: true });
      el.play().catch(() => this.tts(line.text, line.lang));
      return;
    }
    this.tts(line.text, line.lang);
  }
  replay() {
    if (this.last) void this.speak(this.last.key, this.last.text, this.last.lang, { manual: true });
  }
  stopSpeech() {
    this.narrationEl?.pause();
    this.narrationEl = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  /** True when the device can say text in this language (Arabic voices are often missing on desktops). */
  voiceAvailable(lang: Lang): boolean {
    if (typeof speechSynthesis === "undefined") return false;
    return speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang));
  }

  private tts(text: string, lang: Lang) {
    if (typeof speechSynthesis === "undefined" || !text.trim()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "ar" ? "ar-SA" : "fr-FR";
    u.rate = 0.85;
    u.pitch = 1.1;
    u.volume = this.settings.volume;
    const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ---- background music ----
  async startMusic() {
    if (!this.unlocked || !this.settings.music || (typeof document !== "undefined" && document.hidden)) return;
    await this.manifestReady;
    const file = this.manifest.music.ambient;
    if (!file) return;
    if (!this.musicEl) {
      this.musicEl = new Audio(BASE + file);
      this.musicEl.loop = true;
    }
    this.musicEl.volume = this.settings.volume * 0.35;
    this.musicEl.play().catch(() => undefined);
  }
}

export const audio = new AudioService();
