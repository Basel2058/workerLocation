// Small sound effects made with the Web Audio API (no audio files), plus a vibration on phones.

let ctx: AudioContext | null = null;
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

function tone(freq: number, start: number, length: number, type: OscillatorType = 'sine', volume = 0.12) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
  } catch {
    // No audio on this device.
  }
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}

export const sound = {
  tap: () => tone(1400, 0, 0.05, 'sine', 0.06),
  success: () => {
    tone(660, 0, 0.14);
    tone(990, 0.11, 0.24);
  },
  error: () => {
    tone(196, 0, 0.18, 'square', 0.07);
    tone(147, 0.16, 0.3, 'square', 0.07);
    vibrate([120, 60, 120]);
  },
  alert: () => {
    tone(880, 0, 0.12, 'triangle');
    tone(880, 0.18, 0.12, 'triangle');
    vibrate(80);
  },
  ring: () => {
    tone(440, 0, 0.35, 'sine', 0.07);
    tone(480, 0, 0.35, 'sine', 0.07);
  },
  coin: () => {
    tone(988, 0, 0.08, 'square', 0.04);
    tone(1319, 0.08, 0.25, 'square', 0.04);
  },
};
