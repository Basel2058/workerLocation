import { Building2, Check, EyeOff, HardHat, Languages, Link2, MessageCircle, Rocket, Send, ShieldCheck, Sparkles, UtensilsCrossed, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loss, useDemo, type Calc, type Profile } from '../context';
import { fmtMoney, fmtNumber, INDUSTRIES, type Industry } from '../i18n';
import { sound } from '../sound';
import { BigButton, cx, Headline, Logo, Odometer, Page, useCountUp } from '../ui';
import { Backdrop } from './intro';

const WORKER_CHOICES = [10, 25, 50, 100];
const INDUSTRY_ICONS: Record<Industry, typeof HardHat> = {
  construction: HardHat,
  cleaning: Sparkles,
  security: ShieldCheck,
  restaurants: UtensilsCrossed,
  other: Building2,
};

export const workersLabel = (n: number) => (n >= 100 ? '100+' : String(n));

function Choice({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        sound.tap();
        onClick();
      }}
      className={cx(
        'cursor-pointer rounded-2xl px-4 py-3 text-[17px] font-semibold ring-1 transition active:scale-[0.97]',
        selected ? 'bg-brand text-white shadow-lg shadow-brand/20 ring-brand' : 'bg-surface text-ink-2 ring-line hover:ring-brand/40',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Three quick questions so the rest of the demo talks about the visitor's own business. */
export function ProfileScene({ profile, onChange, onNext }: { profile: Profile; onChange: (p: Profile) => void; onNext: () => void }) {
  const { d } = useDemo();
  return (
    <Page>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
        <Headline text={d.profile.title} />
      </h2>
      <label className="mt-7 block animate-fade-up" style={{ animationDelay: '80ms' }}>
        <span className="text-[15px] font-semibold text-ink-2">
          {d.profile.company} <span className="font-normal text-muted">({d.profile.optional})</span>
        </span>
        <input
          value={profile.company}
          onChange={(e) => onChange({ ...profile, company: e.target.value.slice(0, 40) })}
          placeholder={d.profile.placeholder}
          dir="auto"
          className="mt-2 h-14 w-full rounded-2xl bg-surface px-4 text-lg ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-brand"
        />
      </label>
      <div className="mt-6 animate-fade-up" style={{ animationDelay: '160ms' }}>
        <p className="text-[15px] font-semibold text-ink-2">{d.profile.workers}</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {WORKER_CHOICES.map((n) => (
            <Choice key={n} selected={profile.workers === n} onClick={() => onChange({ ...profile, workers: n })} className="text-xl">
              <span dir="ltr">{workersLabel(n)}</span>
            </Choice>
          ))}
        </div>
      </div>
      <div className="mt-6 animate-fade-up" style={{ animationDelay: '240ms' }}>
        <p className="text-[15px] font-semibold text-ink-2">{d.profile.industry}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INDUSTRIES.map((key) => {
            const Icon = INDUSTRY_ICONS[key];
            return (
              <Choice key={key} selected={profile.industry === key} onClick={() => onChange({ ...profile, industry: key })} className="flex items-center gap-2">
                <Icon className="size-5 shrink-0" />
                {d.profile.industries[key]}
              </Choice>
            );
          })}
        </div>
      </div>
      <div className="mt-auto flex justify-center pt-8 lg:mt-10">
        <BigButton next onClick={onNext} className="w-full max-w-sm">
          {d.profile.cta}
        </BigButton>
      </div>
    </Page>
  );
}

const MINUTE_CHOICES = [5, 10, 15, 30];

/** The money lost every month, from the visitor's own numbers. */
type Bucket = 'less' | 'between' | 'more';

/** Rounds a shekel amount to a number a person would say: 1,500, 4,000, 12,000… */
const roundNice = (n: number) => (n < 10_000 ? Math.max(500, Math.round(n / 500) * 500) : Math.round(n / 1000) * 1000);

export function LossScene({ calc, onChange, onNext }: { calc: Calc; onChange: (c: Calc) => void; onNext: () => void }) {
  const { d, t, lang, profile } = useDemo();
  const { hours, money } = loss(profile, calc);
  // First the visitor guesses, then the reveal: a rising tone, the digits roll with soft ticks, a deep impact,
  // a pause, then the yearly figure and whether the guess was right.
  const [guess, setGuess] = useState<Bucket | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [yearly, setYearly] = useState(false);
  const shownHours = useCountUp(revealed ? hours : 0, 1100);
  const [bounds] = useState(() => {
    const a = roundNice(money * 0.4);
    return { a, b: Math.max(a + 500, roundNice(money * 0.8)) };
  });
  const revealedRef = useRef(false);
  useEffect(() => {
    if (!guess) return;
    const timers: number[] = [];
    let interval = 0;
    const ticks = (ms: number) => {
      interval = window.setInterval(sound.tick, 55);
      timers.push(window.setTimeout(() => window.clearInterval(interval), ms));
    };
    if (!revealedRef.current) {
      sound.riser(0.9);
      timers.push(
        window.setTimeout(() => {
          revealedRef.current = true;
          setRevealed(true);
          ticks(1250);
        }, 900),
      );
      timers.push(window.setTimeout(sound.impact, 2200));
      timers.push(window.setTimeout(() => setYearly(true), 2900));
    } else {
      ticks(650);
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.clearInterval(interval);
    };
  }, [guess, money]);
  const fmt = (n: number) => fmtMoney(lang, n);
  const options: Array<[Bucket, string]> = [
    ['less', t(d.loss.less, { a: fmt(bounds.a) })],
    ['between', t(d.loss.between, { a: fmt(bounds.a), b: fmt(bounds.b) })],
    ['more', t(d.loss.more, { b: fmt(bounds.b) })],
  ];
  return (
    <Page>
      <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        <Headline text={d.loss.title} />
      </h2>
      <p className="mt-4 animate-fade-up text-lg text-ink-2" style={{ animationDelay: '500ms' }}>
        {d.loss.intro}
      </p>
      <div className="mt-3 grid animate-fade-up grid-cols-4 gap-2" style={{ animationDelay: '600ms' }}>
        {MINUTE_CHOICES.map((m) => (
          <Choice key={m} selected={calc.minutes === m} onClick={() => onChange({ ...calc, minutes: m })} className="px-1 text-[15px] whitespace-nowrap sm:text-[17px]">
            {t(d.loss.minutes, { n: m })}
          </Choice>
        ))}
      </div>
      <p className="mt-1.5 text-center text-sm text-muted">{d.loss.perDay}</p>

      <div className="relative mt-5 animate-fade-up overflow-hidden rounded-3xl bg-night p-6 text-center text-white shadow-xl sm:p-8" style={{ animationDelay: '700ms' }}>
        <div aria-hidden className={cx('absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700', guess ? 'bg-rose-500/25' : 'bg-teal-400/20')} />
        {!guess ? (
          <div className="relative">
            <p className="text-xl font-bold sm:text-2xl">{d.loss.guess}</p>
            <div className="mt-5 grid gap-2.5">
              {options.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    sound.tap();
                    setGuess(key);
                  }}
                  className="h-13 cursor-pointer rounded-2xl bg-white/10 px-4 py-3 text-lg font-semibold tabular-nums ring-1 ring-white/15 transition duration-200 hover:bg-white/15 active:scale-[0.98]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="relative flex justify-center text-5xl font-bold tracking-tight text-rose-300 tabular-nums sm:text-7xl">
              <Odometer text={fmtMoney(lang, revealed ? money : 0)} />
            </p>
            <p className="relative mt-2 text-lg text-white/85 sm:text-xl">{d.loss.paid}</p>
            <div className="relative mt-4 flex flex-wrap justify-center gap-2 text-[15px]">
              <span className="rounded-full bg-white/10 px-3 py-1 tabular-nums">{t(d.loss.hours, { hours: fmtNumber(lang, shownHours) })}</span>
              <span className={cx('rounded-full bg-rose-500/20 px-3 py-1 font-semibold text-rose-200 tabular-nums transition duration-700', yearly ? 'opacity-100' : 'translate-y-1 opacity-0')}>
                {t(d.loss.perYear, { money: fmtMoney(lang, money * 12) })}
              </span>
            </div>
            {yearly && (
              <p className="relative mt-4 animate-fade-up text-[15px] font-semibold text-mint">
                {guess === 'more' ? `✓ ${d.common.right}` : d.loss.moreThanThought}
              </p>
            )}
          </>
        )}
      </div>

      <label className="mt-5 block animate-fade-up" style={{ animationDelay: '800ms' }}>
        <span className="flex items-center justify-between text-[15px] font-semibold text-ink-2">
          {d.loss.wage}
          <span className="text-lg text-ink tabular-nums">{fmtMoney(lang, calc.wage)}</span>
        </span>
        <input
          type="range"
          min={30}
          max={150}
          step={5}
          value={calc.wage}
          onChange={(e) => onChange({ ...calc, wage: Number(e.target.value) })}
          className="mt-2 h-8 w-full cursor-pointer"
        />
      </label>
      <p className="mt-2 text-center text-xs text-muted">{d.loss.note}</p>
      <div className="mt-auto flex h-14 justify-center pt-6 lg:mt-8 lg:pt-0">
        {yearly && (
          <BigButton next wait={1600} onClick={onNext} className="w-full max-w-sm animate-fade-up">
            {d.loss.cta}
          </BigButton>
        )}
      </div>
    </Page>
  );
}

export function CompareScene({ onNext }: { onNext: () => void }) {
  const { d } = useDemo();
  return (
    <Page>
      <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
        <Headline text={d.compare.title} />
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <p className="rounded-2xl bg-surface-2 py-3 text-center text-[15px] font-bold text-muted sm:text-lg">{d.compare.before}</p>
        <p className="rounded-2xl bg-brand py-3 text-center text-[15px] font-bold text-white sm:text-lg">{d.compare.after}</p>
        {d.compare.rows.map(([before, after], i) => (
          <div key={i} className="contents">
            <div className="flex animate-fade-up items-start gap-2.5 rounded-2xl bg-surface p-3.5 ring-1 ring-line sm:p-4" style={{ animationDelay: `${200 + i * 350}ms` }}>
              <X className="mt-0.5 size-5 shrink-0 text-rose-500" strokeWidth={2.5} />
              <span className="text-[15px] text-muted line-through decoration-rose-300 sm:text-lg">{before}</span>
            </div>
            <div className="flex animate-fade-up items-start gap-2.5 rounded-2xl bg-brand-soft p-3.5 ring-1 ring-brand/20 sm:p-4" style={{ animationDelay: `${375 + i * 350}ms` }}>
              <Check className="mt-0.5 size-5 shrink-0 text-brand" strokeWidth={3} />
              <span className="text-[15px] font-semibold text-ink sm:text-lg">{after}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex justify-center pt-8 lg:mt-10">
        <BigButton next wait={2000} onClick={onNext} className="w-full max-w-sm animate-fade-up">
          {d.common.next}
        </BigButton>
      </div>
    </Page>
  );
}

const WORRY_ICONS = [Link2, Languages, EyeOff, Rocket];

export function WorriesScene({ onNext }: { onNext: () => void }) {
  const { d } = useDemo();
  return (
    <Page>
      <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
        <Headline text={d.worries.title} />
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {d.worries.items.map(([title, body], i) => {
          const Icon = WORRY_ICONS[i]!;
          return (
            <div key={i} className="flex animate-fade-up items-start gap-4 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line" style={{ animationDelay: `${150 + i * 200}ms` }}>
              <span className={cx('flex size-12 shrink-0 items-center justify-center rounded-2xl', i === 2 ? 'bg-night text-mint' : 'bg-brand text-white')}>
                <Icon className="size-6" />
              </span>
              <span>
                <span className="block text-lg font-bold">{title}</span>
                <span className="mt-0.5 block text-[15px] text-muted">{body}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-auto flex justify-center pt-8 lg:mt-10">
        <BigButton next wait={1800} onClick={onNext} className="w-full max-w-sm">
          {d.common.next}
        </BigButton>
      </div>
    </Page>
  );
}

const WHATSAPP = '972526037363';

/** The end: one big "I want to start" that opens WhatsApp with everything filled in. */
export function CtaScene({ onRestart }: { onRestart: () => void }) {
  const { d, t, company, profile, lang } = useDemo();
  const message = t(d.cta.message, {
    company,
    workers: workersLabel(profile.workers),
    industry: d.profile.industries[profile.industry],
  }).replace(/[⁨⁩]/g, '');
  const startUrl = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;
  useEffect(() => {
    const id = window.setTimeout(sound.logo, 350);
    return () => window.clearTimeout(id);
  }, []);
  const demoUrl = `${window.location.origin}/?lang=${lang}`;
  const share = async () => {
    const text = d.cta.shareText.replace('{url}', demoUrl);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'OnSite', text: text.replace(demoUrl, '').trim(), url: demoUrl });
        return;
      }
    } catch {
      return; // Cancelled.
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-night px-6 text-center text-white">
      <Backdrop />
      <div className="relative flex w-full max-w-xl flex-col items-center">
        <div className="animate-float">
          <Logo size={84} />
        </div>
        <h1 className="mt-6 text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          <Headline text={t(d.cta.title, { company })} delay={200} />
        </h1>
        <p className="mt-4 animate-fade-up text-lg text-white/75 sm:text-xl" style={{ animationDelay: '120ms' }}>
          {d.cta.body}
        </p>
        <div className="mt-10 flex w-full max-w-sm animate-fade-up flex-col gap-3" style={{ animationDelay: '240ms' }}>
          <a
            href={startUrl}
            target="_blank"
            rel="noopener"
            onClick={() => sound.success()}
            className="inline-flex h-16 animate-glow items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] text-xl font-bold text-[#062b16] shadow-lg shadow-[#25D366]/30 transition active:scale-[0.97]"
          >
            <MessageCircle className="size-6" strokeWidth={2.5} />
            {d.cta.start}
          </a>
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white/10 text-[17px] font-semibold ring-1 ring-white/20 transition hover:bg-white/15 active:scale-[0.97]"
          >
            <Send className="flip-rtl size-5" />
            {d.cta.share}
          </button>
          <button type="button" onClick={onRestart} className="mt-2 cursor-pointer text-[15px] text-white/60 underline-offset-4 hover:text-white hover:underline">
            {d.cta.restart}
          </button>
        </div>
      </div>
    </div>
  );
}
