// Typewriter key clicks and a soft bell, synthesised with Web Audio. No audio files, nothing fetched.
// Browsers keep audio locked until a user gesture, so the context is created only by `enable()`,
// which the caller runs from a click. Until then every method is a silent no-op.

export interface TypeAudio {
  /** call from a user gesture; creates and resumes the audio context */
  enable(): void;
  disable(): void;
  readonly on: boolean;
  key(kind: "char" | "space" | "line"): void;
  bell(): void;
}

const KEY_GAIN = 0.05;
const BELL_GAIN = 0.03;

export function typeAudio(rand: () => number = Math.random): TypeAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let on = false;

  const make = (): void => {
    if (ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    // 50 ms of white noise, reused for every click
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  };

  const click = (gain: number, pitch: number): void => {
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600 * pitch;
    band.Q.value = 0.9;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(band).connect(env).connect(master);
    src.start(t, rand() * 0.02);
    src.stop(t + 0.04);
    // a short low thump under the click, the type bar meeting the platen
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.value = 150 * pitch;
    og.gain.setValueAtTime(gain * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 0.05);
  };

  return {
    enable() {
      make();
      void ctx?.resume();
      on = ctx !== null;
      if (on) click(KEY_GAIN, 1); // one key so the toggle gives audible feedback
    },
    disable() { on = false; },
    get on() { return on; },
    key(kind) {
      if (!on) return;
      const pitch = 0.9 + rand() * 0.2;
      if (kind === "space") click(KEY_GAIN * 0.7, pitch * 0.8);
      else click(KEY_GAIN * (0.85 + rand() * 0.3), pitch);
    },
    bell() {
      if (!on || !ctx || !master) return;
      const t = ctx.currentTime;
      for (const [f, g] of [[2093, 1], [5600, 0.35]] as const) {
        const o = ctx.createOscillator();
        const e = ctx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(BELL_GAIN * g, t + 0.006);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(e).connect(master);
        o.start(t);
        o.stop(t + 1.2);
      }
    },
  };
}
