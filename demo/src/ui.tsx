import { ArrowRight, Pointer } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useDemo } from './context';
import { sound } from './sound';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/** Runs callbacks after the given delays (ms); all are cancelled when the component goes away. */
export function useTimers() {
  const ids = useRef<number[]>([]);
  useEffect(() => () => ids.current.forEach((id) => window.clearTimeout(id)), []);
  return (ms: number, fn: () => void) => {
    ids.current.push(window.setTimeout(fn, ms));
  };
}

/** A number that counts up (or down) to `value`. */
export function useCountUp(value: number, duration = 900) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return shown;
}

// --- Phone ---------------------------------------------------------------------------------------

const PW = 320;
const PH = 680;

/**
 * A phone drawn at a fixed design size (320 × 680) and scaled to fit its box, so the screens inside can use
 * normal pixel sizes on every device.
 */
export function Phone({ children, label, className, dim }: { children: ReactNode; label?: string; className?: string; dim?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setScale(Math.max(0.2, Math.min(r.width / PW, r.height / PH, 1.25)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={cx('flex min-h-0 min-w-0 flex-1 flex-col items-center', className)}>
      {label && <p className="mb-2 shrink-0 rounded-full bg-ink/80 px-3 py-1 text-xs font-semibold text-white">{label}</p>}
      <div ref={ref} className="relative min-h-0 w-full flex-1">
        <div
          className={cx('absolute top-1/2 left-1/2 transition-opacity duration-500', dim && 'opacity-45', scale === 0 && 'invisible')}
          style={{ width: PW, height: PH, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <div className="h-full w-full rounded-[46px] bg-[#0c1116] p-[10px] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.45)] ring-1 ring-white/10">
            <div className="relative h-full w-full overflow-hidden rounded-[36px] bg-bg">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The thin bar at the top of a phone screen. */
export function StatusBar({ time = '07:56', dark }: { time?: string; dark?: boolean }) {
  return (
    <div className={cx('flex h-9 items-center justify-between px-6 pt-1 text-[12px] font-semibold', dark ? 'text-white' : 'text-ink')} dir="ltr">
      <span>{time}</span>
      <span className="flex items-center gap-1">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className={cx('w-[3px] rounded-sm', dark ? 'bg-white' : 'bg-ink')} style={{ height: h }} />
          ))}
        </span>
        <span className={cx('ms-1 h-[10px] w-[20px] rounded-[3px] border', dark ? 'border-white' : 'border-ink')}>
          <span className={cx('block h-full w-3/4', dark ? 'bg-white' : 'bg-ink')} />
        </span>
      </span>
    </div>
  );
}

/** App header inside a phone: logo + company name. */
export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { company } = useDemo();
  return (
    <div className="flex items-center gap-2.5 border-b border-line bg-surface px-4 pb-2.5">
      <Logo size={30} />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold">{company}</p>
        {subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return <img src="/favicon.svg" alt="" width={size} height={size} className="shrink-0 rounded-[28%]" draggable={false} />;
}

const AVATAR_COLORS = ['#0f766e', '#7c3aed', '#2563eb', '#db2777', '#ea580c', '#0891b2', '#65a30d', '#9333ea'];

export function Avatar({ name, size = 36, i = 0 }: { name: string; size?: number; i?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
    >
      {[...name][0]}
    </span>
  );
}

/**
 * The one thing to press on a screen: a soft pulsing ring and a bouncing finger. Everything else on the
 * screen is decoration.
 */
export function Tap({
  children,
  onTap,
  active = true,
  className,
  round,
  pointer = 'br',
}: {
  children: ReactNode;
  onTap: () => void;
  active?: boolean;
  className?: string;
  round?: boolean;
  pointer?: 'br' | 'bl' | 'c';
}) {
  return (
    <button
      type="button"
      disabled={!active}
      onClick={() => {
        sound.tap();
        onTap();
      }}
      className={cx('relative cursor-pointer select-none disabled:cursor-default', className)}
    >
      {active && (
        <span aria-hidden className={cx('pointer-events-none absolute inset-0 animate-pulse-ring bg-mint/60', round ? 'rounded-full' : 'rounded-2xl')} />
      )}
      {children}
      {active && (
        <span
          aria-hidden
          className={cx(
            'pointer-events-none absolute z-10 animate-tap-hint drop-shadow-[0_2px_4px_rgb(0_0_0/0.35)]',
            pointer === 'br' && '-end-3 -bottom-5',
            pointer === 'bl' && '-start-3 -bottom-5',
            pointer === 'c' && 'start-1/2 top-1/2',
          )}
        >
          <Pointer className="size-9 fill-white text-ink" strokeWidth={1.5} />
        </span>
      )}
    </button>
  );
}

/** Big primary button outside the phones. */
export function BigButton({ children, onClick, tone = 'brand', className, icon = true }: { children: ReactNode; onClick: () => void; tone?: 'brand' | 'light' | 'ghost'; className?: string; icon?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        sound.tap();
        onClick();
      }}
      className={cx(
        'inline-flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl px-7 text-[17px] font-semibold transition active:scale-[0.97]',
        tone === 'brand' && 'animate-glow bg-brand text-white shadow-lg shadow-brand/25 hover:bg-brand-strong',
        tone === 'light' && 'bg-white text-night hover:bg-white/90',
        tone === 'ghost' && 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15',
        className,
      )}
    >
      {children}
      {icon && <ArrowRight className="flip-rtl size-5" />}
    </button>
  );
}

/**
 * Frame of a story scene: who you are, what to do (or what just happened), the phones, and the Next button
 * once the action is done. Side by side on wide screens, stacked on phones.
 */
export function Scene({
  role,
  title,
  hint,
  doneTitle,
  doneBody,
  done,
  extra,
  onNext,
  children,
}: {
  role: string;
  title: string;
  hint: string;
  doneTitle: string;
  doneBody: string;
  done: boolean;
  extra?: ReactNode;
  onNext: () => void;
  children: ReactNode;
}) {
  const { d } = useDemo();
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 px-4 pt-3 pb-4 lg:flex-row lg:items-center lg:gap-10 lg:px-8">
      <div className="shrink-0 lg:w-[38%]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand lg:text-sm">
          <span className="size-1.5 rounded-full bg-brand" />
          {role}
        </span>
        <div key={done ? 'done' : 'todo'} className="animate-fade-up">
          <h2 className="mt-2 text-[22px] leading-tight font-bold tracking-tight text-balance sm:text-3xl lg:mt-4 lg:text-[40px]">
            {done ? doneTitle : title}
          </h2>
          <p className={cx('mt-1.5 text-[15px] text-pretty sm:text-lg lg:mt-3 lg:text-xl', done ? 'text-ink-2' : 'font-semibold text-brand')}>
            {done ? doneBody : `👆 ${hint}`}
          </p>
          {done && extra}
        </div>
        <div className="mt-6 hidden lg:block">{done && <BigButton onClick={onNext}>{d.common.next}</BigButton>}</div>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 self-stretch lg:py-4">{children}</div>
      <div className="flex h-14 shrink-0 justify-center lg:hidden">
        {done && (
          <BigButton onClick={onNext} className="w-full max-w-sm animate-fade-up">
            {d.common.next}
          </BigButton>
        )}
      </div>
    </div>
  );
}

/** A full-page step that is not a phone scene (profile, calculator, before/after…). */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto px-5 pt-4 pb-6 sm:pt-8 lg:justify-center [&>*]:shrink-0', className)}>{children}</div>;
}
