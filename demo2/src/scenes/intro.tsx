import { useEffect, useState } from 'react';
import { DICTS, LANGS, type Lang } from '../i18n';
import { useDemo } from '../context';
import { sound } from '../sound';
import { BigButton, Logo } from '../ui';

/** First screen: pick a language. Each button is written in its own language. */
export function LangScene({ onPick }: { onPick: (lang: Lang) => void }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-night px-6 text-center text-white">
      <Backdrop />
      <div className="relative flex flex-col items-center">
        <div className="relative animate-pop-in">
          <span className="absolute inset-0 animate-pulse-ring rounded-[28%] bg-mint/40" />
          <Logo size={96} />
        </div>
        <h1 className="mt-6 animate-fade-up text-5xl font-bold tracking-tight sm:text-6xl" style={{ animationDelay: '150ms' }}>
          OnSite
        </h1>
        <div className="mt-3 animate-fade-up space-y-1 text-[15px] text-white/70 sm:text-lg" style={{ animationDelay: '300ms' }}>
          {LANGS.map((l) => (
            <p key={l} dir={DICTS[l].dir} lang={l}>
              {DICTS[l].tagline}
            </p>
          ))}
        </div>
        <div className="mt-10 flex w-full max-w-sm animate-fade-up flex-col gap-3" style={{ animationDelay: '450ms' }}>
          {LANGS.map((l) => (
            <BigButton key={l} tone={l === 'ar' ? 'light' : 'ghost'} icon={false} onClick={() => onPick(l)} className="w-full text-lg">
              <span lang={l}>{DICTS[l].langName}</span>
            </BigButton>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Soft grid and glow behind the dark screens. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-brand/40 blur-[120px]" />
      <div className="absolute -bottom-48 left-1/4 size-[420px] rounded-full bg-emerald-500/15 blur-[100px]" />
    </div>
  );
}

function useTypewriter(text: string, startMs: number, perChar = 38) {
  const [n, setN] = useState(0);
  const chars = Array.from(text);
  useEffect(() => {
    setN(0);
    let i = 0;
    let timer = 0;
    const start = window.setTimeout(function tick() {
      i += 1;
      setN(i);
      if (i < chars.length) timer = window.setTimeout(tick, perChar);
    }, startMs);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
    };
  }, [text, startMs, perChar]);
  return { shown: chars.slice(0, n).join(''), done: n >= chars.length };
}

/** "7:00 in the morning. Do you know who actually arrived?" over a city where workers walk to work. */
export function HookScene({ onNext }: { onNext: () => void }) {
  const { d } = useDemo();
  const l1 = useTypewriter(d.hook.line1, 400, 55);
  const l2 = useTypewriter(d.hook.line2, 400 + Array.from(d.hook.line1).length * 55 + 500, 40);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!l2.done) return;
    const id = window.setTimeout(() => setReady(true), 1800);
    return () => window.clearTimeout(id);
  }, [l2.done]);
  return (
    <div className="relative flex h-full flex-col items-center overflow-hidden bg-night px-5 pt-[8vh] pb-8 text-center text-white">
      <Backdrop />
      <div className="relative w-full max-w-3xl">
        <p className="min-h-[1.3em] text-2xl font-semibold text-mint sm:text-3xl">
          {l1.shown}
          {!l1.done && <Caret />}
        </p>
        <h1 className="mt-3 min-h-[2.6em] text-3xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          {l2.shown}
          {l1.done && !l2.done && <Caret />}
        </h1>
      </div>
      <div className="relative mt-4 min-h-0 w-full max-w-3xl flex-1">{l1.done && <CityMap />}</div>
      <div className="relative h-14 shrink-0">{ready && <BigButton next onClick={onNext} className="animate-fade-up">{d.hook.cta}</BigButton>}</div>
    </div>
  );
}

function Caret() {
  return <span className="ms-0.5 inline-block h-[0.9em] w-[3px] animate-blink rounded bg-mint align-[-0.1em]" />;
}

const SITES = [
  { x: 110, y: 82 },
  { x: 300, y: 70 },
  { x: 230, y: 180 },
];

// Workers: where they start, which site they walk to, when they leave.
const WALKERS = [
  { from: [0, 40], site: 0, dx: -10, dy: 6, at: 0.3 },
  { from: [400, 20], site: 1, dx: 8, dy: -4, at: 0.5 },
  { from: [0, 150], site: 0, dx: 12, dy: 10, at: 0.8 },
  { from: [400, 240], site: 2, dx: -12, dy: 4, at: 0.6 },
  { from: [180, 0], site: 1, dx: -10, dy: 10, at: 1.1 },
  { from: [120, 240], site: 2, dx: 8, dy: -8, at: 1.3 },
  { from: [400, 130], site: 1, dx: 4, dy: 12, at: 1.6 },
  { from: [260, 240], site: 2, dx: 14, dy: 8, at: 1.9 },
  { from: [60, 0], site: 0, dx: 4, dy: -12, at: 2.2 },
];

/** Drawn night city: workers (dots) walk to three workplaces and turn green; one goes home and turns red. */
function CityMap() {
  const walk = 1.8;
  // A soft note as each worker arrives, a low one for the worker who didn't come.
  useEffect(() => {
    const ids = WALKERS.map((w) => window.setTimeout(sound.pop, (w.at + walk) * 1000));
    ids.push(window.setTimeout(sound.low, 3600));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);
  return (
    <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g stroke="#1d3d37" strokeWidth="7" fill="none" strokeLinecap="round">
        <path d="M0 125 H400 M0 40 H400 M0 210 H400 M70 0 V240 M175 0 V240 M265 0 V240 M350 0 V240" />
      </g>
      <g fill="#0e2c27">
        {[
          [10, 50, 50, 65], [85, 50, 80, 65], [185, 50, 70, 65], [275, 50, 65, 65], [360, 50, 40, 65],
          [10, 135, 50, 65], [85, 135, 80, 65], [185, 135, 70, 65], [275, 135, 65, 65], [360, 135, 40, 65],
        ].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="5" />
        ))}
      </g>
      {SITES.map((s, i) => (
        <g key={i}>
          <circle cx={s.x} cy={s.y} r="26" fill="#14b8a6" fillOpacity="0.12" stroke="#2dd4bf" strokeOpacity="0.6" strokeDasharray="4 4">
            <animate attributeName="r" values="24;28;24" dur="3s" repeatCount="indefinite" />
          </circle>
          <rect x={s.x - 7} y={s.y - 9} width="14" height="18" rx="2" fill="#2dd4bf" opacity="0.85" />
        </g>
      ))}
      {WALKERS.map((w, i) => {
        const s = SITES[w.site]!;
        const tx = s.x + w.dx;
        const ty = s.y + w.dy;
        return (
          <circle key={i} cx={w.from[0]} cy={w.from[1]} r="5" fill="#94a3b8" stroke="#061a17" strokeWidth="2">
            <animate attributeName="cx" from={w.from[0]} to={tx} begin={`${w.at}s`} dur={`${walk}s`} fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" />
            <animate attributeName="cy" from={w.from[1]} to={ty} begin={`${w.at}s`} dur={`${walk}s`} fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" />
            <animate attributeName="fill" to="#34d399" begin={`${w.at + walk}s`} dur="0.3s" fill="freeze" />
            <animate attributeName="r" values="5;8;5" begin={`${w.at + walk}s`} dur="0.4s" />
          </circle>
        );
      })}
      {/* The one who didn't come: walks home and turns red. */}
      <circle cx="30" cy="232" r="0" fill="#fb7185" opacity="0.5">
        <animate attributeName="r" values="6;20" begin="3.6s" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0" begin="3.6s" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="175" cy="0" r="5" fill="#94a3b8" stroke="#061a17" strokeWidth="2">
        <animate attributeName="cx" from="175" to="30" begin="1.2s" dur="2.4s" fill="freeze" />
        <animate attributeName="cy" from="0" to="232" begin="1.2s" dur="2.4s" fill="freeze" />
        <animate attributeName="fill" to="#fb7185" begin="3.6s" dur="0.3s" fill="freeze" />
      </circle>
      <text x="30" y="214" textAnchor="middle" fill="#fb7185" fontSize="16" fontWeight="700" opacity="0">
        ?
        <animate attributeName="opacity" to="1" begin="3.8s" dur="0.3s" fill="freeze" />
      </text>
    </svg>
  );
}
