// Quiet, premium sound design made with the Web Audio API (no audio files): soft clicks, bell-like tones with a
// light reverb, an OnSite signature, and a rising tone before every reveal. Plus a vibration on Android phones.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem('onsite-demo.muted') === '1';
} catch {
  // Storage blocked: sound stays on.
}

export const isMuted = () => muted;
export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem('onsite-demo.muted', value ? '1' : '0');
  } catch {
    // Not saved; fine for this visit.
  }
}

/** A short room reverb made from decaying noise: it makes plain tones sound warm instead of electronic. */
function makeReverb(c: AudioContext) {
  const len = Math.floor(c.sampleRate * 1.6);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const node = c.createConvolver();
  node.buffer = buf;
  return node;
}

function audio() {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
      reverb = makeReverb(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      reverb.connect(wet).connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOptions {
  type?: OscillatorType;
  volume?: number;
  attack?: number;
  /** Frequency at the end of the note (a glide). */
  to?: number;
  /** Send to the reverb. */
  wet?: boolean;
  /** Low-pass filter cutoff, for softer tones. */
  cutoff?: number;
}

function tone(freq: number, start: number, length: number, o: ToneOptions = {}) {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + length);
  const vol = o.volume ?? 0.12;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.008));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  let out: AudioNode = osc.connect(gain);
  if (o.cutoff) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.cutoff;
    out = out.connect(f);
  }
  out.connect(master);
  if (o.wet !== false && reverb) out.connect(reverb);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** Filtered noise: clicks, whooshes and the rising tension before a reveal. */
function noise(start: number, length: number, from: number, to: number, volume: number, q = 1.2) {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + length);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + length * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(f).connect(gain).connect(master);
  src.start(t);
  src.stop(t + length + 0.05);
}

/** A soft bell: a pure tone with a quiet overtone, rung through the reverb. */
function bell(freq: number, start: number, length = 0.9, volume = 0.09) {
  tone(freq, start, length, { volume, attack: 0.004 });
  tone(freq * 2.01, start, length * 0.5, { volume: volume * 0.25, attack: 0.004 });
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (iPhone browsers).
  }
}

export const sound = {
  /** Touch feedback: a short, soft click. */
  tap: () => {
    tone(2200, 0, 0.03, { volume: 0.035, wet: false, cutoff: 3500 });
    vibrate(8);
  },
  /** Moving to the next screen: a quiet air movement. */
  whoosh: () => noise(0, 0.32, 600, 2400, 0.05, 0.8),
  /** The OnSite signature: three rising bell notes. */
  logo: () => {
    bell(659.25, 0, 1.4, 0.08);
    bell(830.61, 0.12, 1.4, 0.07);
    bell(987.77, 0.24, 1.8, 0.08);
    tone(164.81, 0, 1.6, { volume: 0.05, cutoff: 600 });
  },
  /** Tension before a result. */
  riser: (length = 0.9) => {
    noise(0, length, 300, 3200, 0.05, 2);
    tone(220, 0, length, { volume: 0.03, to: 440, cutoff: 1200, wet: false });
  },
  /** Something good happened: two warm bell notes. */
  success: () => {
    bell(783.99, 0, 0.9, 0.09);
    bell(1174.66, 0.1, 1.2, 0.08);
    vibrate(20);
  },
  /** Refused: a low, muted double knock. */
  error: () => {
    tone(150, 0, 0.22, { volume: 0.16, to: 90, cutoff: 700 });
    tone(150, 0.16, 0.3, { volume: 0.14, to: 80, cutoff: 700 });
    vibrate([40, 60, 40]);
  },
  /** A notification for the manager. */
  alert: () => {
    bell(1318.51, 0, 0.5, 0.06);
    bell(1318.51, 0.16, 0.7, 0.06);
    vibrate(30);
  },
  /** One "tick" of the money counter. */
  tick: () => tone(3200, 0, 0.012, { volume: 0.025, wet: false, cutoff: 6000 }),
  /** The counter lands on the number: a deep, short impact. */
  impact: () => {
    tone(110, 0, 0.6, { volume: 0.2, to: 45, cutoff: 400 });
    noise(0, 0.25, 2000, 200, 0.04);
    bell(523.25, 0.02, 1.6, 0.05);
  },
  /** A phone ringing on the other side (pleasant, not the real ringtone). */
  ring: () => {
    tone(440, 0, 0.4, { volume: 0.045, cutoff: 1400 });
    tone(480, 0, 0.4, { volume: 0.045, cutoff: 1400 });
  },
  /** A worker arrives at the workplace on the opening map. */
  pop: () => tone(1046.5, 0, 0.18, { volume: 0.03, attack: 0.003 }),
  /** The one who didn't come. */
  low: () => tone(196, 0, 0.6, { volume: 0.06, to: 160, cutoff: 600 }),
};
