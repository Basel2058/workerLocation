import { Globe, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DemoContext, loss, type Calc, type DemoState, type Profile } from './context';
import { DICTS, fill, fmtMoney, LANGS, type Lang } from './i18n';
import { BuddyScene, CheckinScene, HomeScene, LateScene, LiveScene, PayrollScene } from './scenes/story';
import { HookScene, LangScene } from './scenes/intro';
import { CompareScene, CtaScene, LossScene, ProfileScene, WorriesScene } from './scenes/pages';
import { isMuted, setMuted } from './sound';
import { cx, Logo } from './ui';

const STEPS = ['lang', 'hook', 'profile', 'loss', 'checkin', 'live', 'home', 'buddy', 'late', 'payroll', 'compare', 'worries', 'cta'] as const;
type Step = (typeof STEPS)[number];
const DARK: Step[] = ['lang', 'hook', 'cta'];

function langFromUrl(): Lang | null {
  const l = new URLSearchParams(window.location.search).get('lang');
  return LANGS.includes(l as Lang) ? (l as Lang) : null;
}

export function App() {
  const urlLang = langFromUrl();
  const [lang, setLang] = useState<Lang>(urlLang ?? 'ar');
  const [step, setStep] = useState<Step>(urlLang ? 'hook' : 'lang');
  const [profile, setProfile] = useState<Profile>({ company: '', workers: 25, industry: 'construction' });
  const [calc, setCalc] = useState<Calc>({ minutes: 15, wage: 50 });
  const [muted, setMutedState] = useState(isMuted());
  const [menu, setMenu] = useState<'none' | 'lang' | 'presenter'>('none');

  const d = DICTS[lang];
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = d.dir;
  }, [lang, d.dir]);

  const index = STEPS.indexOf(step);
  const go = (s: Step) => {
    setStep(s);
    setMenu('none');
    window.scrollTo(0, 0);
  };
  const next = () => go(STEPS[Math.min(index + 1, STEPS.length - 1)]!);

  // Presenter shortcut: tap the logo three times quickly to jump to any scene.
  const taps = useRef<number[]>([]);
  const logoTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 700), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      setMenu('presenter');
    }
  };

  const state: DemoState = { lang, profile, calc };
  const money = loss(profile, calc).money;
  const savings = fill(d.payroll.savings, { money: fmtMoney(lang, money) }, d.dir === 'rtl');
  const dark = DARK.includes(step);
  const progress = index <= 1 ? 0 : (index - 1) / (STEPS.length - 2);

  return (
    <DemoContext.Provider value={state}>
      <div className={cx('flex h-full flex-col', dark ? 'bg-night' : 'bg-bg')}>
        {step !== 'lang' && (
          <header className={cx('relative z-50 flex h-14 shrink-0 items-center gap-3 px-4', dark ? 'text-white' : 'text-ink')}>
            <button type="button" onClick={logoTap} className="flex cursor-pointer items-center gap-2" aria-label="OnSite">
              <Logo size={28} />
              <span className="hidden text-[15px] font-bold sm:inline">OnSite</span>
            </button>
            <div className={cx('h-1.5 flex-1 overflow-hidden rounded-full', dark ? 'bg-white/10' : 'bg-line')}>
              <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
            </div>
            <button
              type="button"
              onClick={() => {
                setMuted(!muted);
                setMutedState(!muted);
              }}
              className={cx('flex size-9 cursor-pointer items-center justify-center rounded-full', dark ? 'hover:bg-white/10' : 'hover:bg-surface-2')}
              aria-label={d.common.sound}
            >
              {muted ? <VolumeX className="size-5 opacity-60" /> : <Volume2 className="size-5" />}
            </button>
            <button
              type="button"
              onClick={() => setMenu(menu === 'lang' ? 'none' : 'lang')}
              className={cx('flex size-9 cursor-pointer items-center justify-center rounded-full', dark ? 'hover:bg-white/10' : 'hover:bg-surface-2')}
              aria-label={d.common.language}
            >
              <Globe className="size-5" />
            </button>
            {menu === 'lang' && (
              <div className="absolute end-3 top-12 flex animate-pop-in flex-col overflow-hidden rounded-2xl bg-surface text-ink shadow-xl ring-1 ring-line">
                {LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    lang={l}
                    onClick={() => {
                      setLang(l);
                      setMenu('none');
                    }}
                    className={cx('cursor-pointer px-6 py-3 text-start text-[15px] hover:bg-surface-2', l === lang && 'font-bold text-brand')}
                  >
                    {DICTS[l].langName}
                  </button>
                ))}
              </div>
            )}
          </header>
        )}

        <main key={`${step}-${lang}`} className="min-h-0 flex-1">
          {step === 'lang' && (
            <LangScene
              onPick={(l) => {
                setLang(l);
                go('hook');
              }}
            />
          )}
          {step === 'hook' && <HookScene onNext={next} />}
          {step === 'profile' && <ProfileScene profile={profile} onChange={setProfile} onNext={next} />}
          {step === 'loss' && <LossScene calc={calc} onChange={setCalc} onNext={next} />}
          {step === 'checkin' && <CheckinScene onNext={next} />}
          {step === 'live' && <LiveScene onNext={next} />}
          {step === 'home' && <HomeScene onNext={next} />}
          {step === 'buddy' && <BuddyScene onNext={next} />}
          {step === 'late' && <LateScene onNext={next} />}
          {step === 'payroll' && <PayrollScene onNext={next} savings={savings} />}
          {step === 'compare' && <CompareScene onNext={next} />}
          {step === 'worries' && <WorriesScene onNext={next} />}
          {step === 'cta' && <CtaScene onRestart={() => go('hook')} />}
        </main>

        {menu === 'presenter' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4" onClick={() => setMenu('none')}>
            <div className="w-full max-w-xs animate-pop-in rounded-3xl bg-surface p-3 shadow-2xl" onClick={(e) => e.stopPropagation()} dir="ltr">
              <p className="px-3 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">Jump to</p>
              {STEPS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => go(s)}
                  className={cx('flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-start text-[15px] hover:bg-surface-2', s === step && 'bg-brand-soft font-semibold text-brand')}
                >
                  <span className="w-5 text-muted tabular-nums">{i}</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </DemoContext.Provider>
  );
}
