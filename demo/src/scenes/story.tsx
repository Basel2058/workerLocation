import { AlertTriangle, Camera, Check, Download, FileSpreadsheet, LogIn, MessageCircle, Phone as PhoneIcon, PhoneOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDemo } from '../context';
import { monthName } from '../i18n';
import { MiniMap } from '../MiniMap';
import { sound } from '../sound';
import { AppHeader, Avatar, cx, Logo, Phone, Scene, StatusBar, Tap, useCountUp, useTimers } from '../ui';

const CHECK_IN_TIME = '07:56';

// --- Pieces of the phone screens ------------------------------------------------------------------

/** A "selfie": drawn person on a soft background, as the manager would see the photo. */
function Selfie({ className }: { className?: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 to-amber-100', className)}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <rect x="0" y="62" width="100" height="40" fill="#cbd5e1" opacity="0.5" />
        <path d="M18 100 C20 74 34 66 50 66 C66 66 80 74 82 100 Z" fill="#f97316" />
        <rect x="44" y="56" width="12" height="12" rx="4" fill="#d6a47c" />
        <ellipse cx="50" cy="40" rx="17" ry="20" fill="#e0b48c" />
        <path d="M32 36 C32 20 68 20 68 36 L68 30 C66 16 34 16 32 30 Z" fill="#facc15" />
        <rect x="30" y="30" width="40" height="6" rx="3" fill="#eab308" />
        <circle cx="43" cy="42" r="1.8" fill="#3b2a1a" />
        <circle cx="57" cy="42" r="1.8" fill="#3b2a1a" />
        <path d="M44 50 Q50 55 56 50" stroke="#9a5b3a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Counter({ value }: { value: number }) {
  const shown = useCountUp(value, 700);
  return <>{Math.round(shown)}</>;
}

interface ManagerProps {
  mainIn: boolean;
  toast?: string | null;
  alert?: { title: string; body: string } | null;
  onTapMain?: (() => void) | null;
  onCallLate?: (() => void) | null;
  highlightMain?: boolean;
}

/** The manager's "Today" screen with the visitor's own number of workers. */
function ManagerToday({ mainIn, toast, alert, onTapMain, onCallLate, highlightMain }: ManagerProps) {
  const { d, t, profile, site } = useDemo();
  const total = profile.workers;
  const notArrived = Math.max(2, Math.round(total * 0.08));
  const onSite = total - notArrived - 1 + (mainIn ? 1 : 0);
  const people = d.people;

  const mainRow = (
    <Row
      name={people.main}
      i={0}
      sub={mainIn ? `${site} · ${CHECK_IN_TIME}` : site}
      chip={mainIn ? { text: d.live.onSite, tone: 'green' } : { text: d.live.notArrived, tone: 'gray' }}
      highlight={highlightMain}
    />
  );
  return (
    <div className="relative flex h-full flex-col">
      <StatusBar time={onCallLate ? '08:25' : CHECK_IN_TIME} />
      <AppHeader />
      {toast && (
        <div className="absolute inset-x-3 top-10 z-20 flex animate-slide-down items-center gap-2.5 rounded-2xl bg-ink/95 p-3 text-white shadow-xl">
          <Logo size={26} />
          <p className="text-[13px] font-semibold">{toast}</p>
        </div>
      )}
      {alert && (
        <div className="absolute inset-x-3 top-10 z-20 animate-slide-down rounded-2xl bg-rose-600 p-3.5 text-white shadow-xl">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <AlertTriangle className="size-5" />
            {alert.title}
          </p>
          <p className="mt-1 text-[13px] text-white/90">{alert.body}</p>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden px-3 pt-3">
        <p className="px-1 text-[20px] font-bold">{d.live.today}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label={d.live.onSite} dot="bg-emerald-500" value={<Counter value={onSite} />} sub={t(d.live.ofTotal, { n: total })} />
          <Stat label={d.live.late} dot="bg-amber-500" value={1} />
          <Stat label={d.live.notArrived} dot="bg-rose-500" value={<Counter value={notArrived - (mainIn ? 1 : 0)} />} />
        </div>

        <Group title={d.live.late} dot="bg-amber-500">
          <Row
            name={people.late}
            i={3}
            sub={`${site} · 08:00`}
            chip={{ text: t(d.live.lateMin, { m: 25 }), tone: 'amber' }}
            action={
              onCallLate !== undefined ? (
                <Tap onTap={() => onCallLate?.()} active={!!onCallLate} round pointer="bl">
                  <span className="flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <PhoneIcon className="size-5" />
                  </span>
                </Tap>
              ) : undefined
            }
          />
        </Group>

        {!mainIn && (
          <Group title={d.live.notArrived} dot="bg-rose-500">
            {mainRow}
            <Row name={people.others[5]!} i={5} sub={site} chip={{ text: d.live.notArrived, tone: 'gray' }} />
          </Group>
        )}

        <Group title={d.live.onSite} dot="bg-emerald-500">
          {mainIn &&
            (onTapMain !== undefined ? (
              <Tap onTap={() => onTapMain?.()} active={!!onTapMain} className="block w-full text-start" pointer="c">
                {mainRow}
              </Tap>
            ) : (
              mainRow
            ))}
          {['07:41', '07:48', '07:52'].map((time, k) => (
            <Row key={time} name={people.others[k]!} i={k + 4} sub={`${site} · ${time}`} chip={{ text: d.live.onSite, tone: 'green' }} />
          ))}
        </Group>
      </div>
    </div>
  );
}

function Stat({ label, value, dot, sub }: { label: string; value: React.ReactNode; dot: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
      <p className="flex items-center gap-1.5 truncate text-[11px] text-muted">
        <span className={cx('size-1.5 shrink-0 rounded-full', dot)} />
        {label}
      </p>
      <p className="mt-0.5 text-[22px] font-bold tabular-nums">{value}</p>
      {sub && <p className="truncate text-[10px] text-faint">{sub}</p>}
    </div>
  );
}

function Group({ title, dot, children }: { title: string; dot: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="flex items-center gap-1.5 px-1 text-[12px] font-semibold text-muted">
        <span className={cx('size-1.5 rounded-full', dot)} />
        {title}
      </p>
      <div className="mt-1.5 divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-sm">{children}</div>
    </div>
  );
}

const CHIP_TONES = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  gray: 'bg-surface-2 text-muted',
};

function Row({ name, i, sub, chip, action, highlight }: { name: string; i: number; sub: string; chip: { text: string; tone: keyof typeof CHIP_TONES }; action?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cx('flex items-center gap-2.5 px-3 py-2.5', highlight && 'animate-highlight')}>
      <Avatar name={name} i={i} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{name}</p>
        <p className="truncate text-[11px] text-muted">{sub}</p>
      </div>
      <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', CHIP_TONES[chip.tone])}>{chip.text}</span>
      {action}
    </div>
  );
}

/** The worker's home screen with the big round button. */
function WorkerHome({ onCheckIn, map }: { onCheckIn: (() => void) | null; map?: React.ReactNode }) {
  const { d, t, site } = useDemo();
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <div className="px-5 pt-2">
        <p className="text-[12px] text-muted">{d.live.today}</p>
        <p className="text-[22px] font-bold tracking-tight">{t(d.checkin.greeting, { name: d.people.main })}</p>
      </div>
      {map && <div className="px-4 pt-3">{map}</div>}
      <div className="m-4 flex flex-1 flex-col items-center rounded-3xl bg-surface p-4 shadow-sm">
        <p className="flex items-center gap-2 self-start text-[14px] font-semibold">
          <span className="size-2 rounded-full bg-faint" />
          {d.checkin.notIn}
        </p>
        <p className="self-start text-[12px] text-muted">{t(d.checkin.shift, { site })}</p>
        <div className="flex flex-1 items-center justify-center py-3">
          <Tap onTap={() => onCheckIn?.()} active={!!onCheckIn} round pointer="br">
            <span className={cx('flex flex-col items-center justify-center gap-2 rounded-full bg-gradient-to-b from-emerald-400 to-teal-600 text-white shadow-[0_12px_30px_-6px_rgb(13_148_136/0.6)] ring-8 ring-emerald-100', map ? 'size-36' : 'size-44')}>
              <LogIn className="flip-rtl size-9" />
              <span className="px-3 text-center text-[17px] leading-tight font-bold">{d.checkin.button}</span>
            </span>
          </Tap>
        </div>
      </div>
    </div>
  );
}

// --- Scene 1: check in --------------------------------------------------------------------------

export function CheckinScene({ onNext }: { onNext: () => void }) {
  const { d, site } = useDemo();
  const [phase, setPhase] = useState<'idle' | 'locating' | 'selfie' | 'done'>('idle');
  const later = useTimers();
  const start = () => {
    setPhase('locating');
    later(1400, () => setPhase('selfie'));
    later(2500, () => {
      setPhase('done');
      sound.success();
    });
  };
  return (
    <Scene role={d.common.you.worker} title={d.checkin.title} hint={d.checkin.hint} doneTitle={d.checkin.doneTitle} doneBody={d.checkin.doneBody} done={phase === 'done'} onNext={onNext}>
      <Phone>
        {phase === 'idle' && <WorkerHome onCheckIn={start} />}
        {phase === 'locating' && (
          <div className="flex h-full flex-col">
            <StatusBar />
            <div className="relative m-4 flex-1">
              <MiniMap mode="inside" workLabel={site} className="h-full" />
              <span className="absolute top-1/2 left-1/2 -mt-16 -ml-16 size-32 animate-radar rounded-full border-4 border-blue-500/60" />
            </div>
            <p className="pb-10 text-center text-[16px] font-semibold text-ink-2">{d.checkin.locating}</p>
          </div>
        )}
        {phase === 'selfie' && (
          <div className="relative flex h-full flex-col bg-black">
            <StatusBar dark />
            <div className="relative mx-4 mt-2 flex-1 overflow-hidden rounded-3xl">
              <Selfie className="h-full w-full rounded-none" />
              <div className="absolute inset-[14%] rounded-[50%] border-4 border-white/80" />
              <div className="absolute inset-0 animate-flash bg-white" style={{ animationDelay: '700ms' }} />
            </div>
            <p className="pt-3 text-center text-[15px] font-semibold text-white">{d.checkin.selfie}</p>
            <div className="flex justify-center pt-3 pb-8">
              <span className="flex size-16 items-center justify-center rounded-full border-4 border-white">
                <Camera className="size-6 text-white" />
              </span>
            </div>
          </div>
        )}
        {phase === 'done' && <CheckedIn />}
      </Phone>
    </Scene>
  );
}

function CheckedIn() {
  const { d, site } = useDemo();
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-24 animate-pop-in items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
          <Check className="size-12" strokeWidth={3} />
        </span>
        <p className="mt-6 text-[22px] font-bold">{d.checkin.done}</p>
        <p className="mt-1 text-[44px] font-bold tracking-tight tabular-nums">{CHECK_IN_TIME}</p>
        <p className="text-[14px] text-muted">{site}</p>
        <div className="mt-6 flex w-full items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-sm">
          <Selfie className="size-14 shrink-0 rounded-xl" />
          <MiniMap mode="inside" className="h-14 flex-1 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// --- Scene 2: the manager sees it ---------------------------------------------------------------

export function LiveScene({ onNext }: { onNext: () => void }) {
  const { d, t, site } = useDemo();
  const [mainIn, setMainIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [canTap, setCanTap] = useState(false);
  const [sheet, setSheet] = useState(false);
  const later = useTimers();
  useEffect(() => {
    later(900, () => {
      setToast(t(d.live.justIn, { name: d.people.main, time: CHECK_IN_TIME }));
      sound.alert();
    });
    later(1700, () => setMainIn(true));
    later(3400, () => setToast(null));
    later(3000, () => setCanTap(true));
  }, []);
  return (
    <Scene
      role={d.common.you.manager}
      title={d.live.title}
      hint={t(d.live.hint, { name: d.people.main })}
      doneTitle={d.live.doneTitle}
      doneBody={d.live.doneBody}
      done={sheet}
      onNext={onNext}
    >
      <Phone>
        <ManagerToday mainIn={mainIn} toast={toast} highlightMain={mainIn} onTapMain={canTap && !sheet ? () => setSheet(true) : null} />
        {sheet && (
          <>
            <div className="absolute inset-0 z-30 animate-[fade-up_0.3s_both] bg-ink/40" />
            <div className="absolute inset-x-0 bottom-0 z-40 animate-sheet-up rounded-t-3xl bg-surface p-4 pb-6 shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
              <div className="flex items-center gap-3">
                <Avatar name={d.people.main} i={0} size={44} />
                <div className="flex-1">
                  <p className="text-[17px] font-bold">{d.people.main}</p>
                  <p className="text-[12px] font-semibold text-emerald-700">
                    {d.live.checkedIn} · {CHECK_IN_TIME}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[96px_1fr] gap-2">
                <div>
                  <Selfie className="h-[120px] w-full" />
                  <p className="mt-1 text-center text-[10px] text-muted">{d.live.photo}</p>
                </div>
                <div>
                  <MiniMap mode="inside" workLabel={site} className="h-[120px]" />
                  <p className="mt-1 text-center text-[10px] font-semibold text-emerald-700">{t(d.live.inside, { m: 35 })}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </Phone>
    </Scene>
  );
}

// --- Scene 3: from home -------------------------------------------------------------------------

export function HomeScene({ onNext }: { onNext: () => void }) {
  const { d, t, site } = useDemo();
  const [phase, setPhase] = useState<'idle' | 'locating' | 'refused'>('idle');
  const later = useTimers();
  const map = <MiniMap mode="far" homeLabel={d.home.homeLabel} workLabel={site} distance={d.home.distance} className="h-36" />;
  return (
    <Scene role={d.common.you.worker} title={d.home.title} hint={d.home.hint} doneTitle={d.home.doneTitle} doneBody={d.home.doneBody} done={phase === 'refused'} onNext={onNext}>
      <Phone>
        {phase === 'idle' && (
          <WorkerHome
            map={map}
            onCheckIn={() => {
              setPhase('locating');
              later(1100, () => {
                setPhase('refused');
                sound.error();
              });
            }}
          />
        )}
        {phase === 'locating' && (
          <div className="flex h-full flex-col">
            <StatusBar />
            <div className="relative m-4 flex-1">
              <MiniMap mode="far" homeLabel={d.home.homeLabel} workLabel={site} distance={d.home.distance} className="h-full" />
            </div>
            <p className="pb-10 text-center text-[16px] font-semibold text-ink-2">{d.checkin.locating}</p>
          </div>
        )}
        {phase === 'refused' && (
          <div className="flex h-full flex-col">
            <StatusBar />
            <div className="px-4 pt-2">{map}</div>
            <div className="flex flex-1 animate-shake flex-col items-center justify-center px-6 text-center">
              <span className="flex size-24 animate-pop-in items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30">
                <X className="size-12" strokeWidth={3} />
              </span>
              <p className="mt-5 text-[20px] leading-snug font-bold text-rose-700">{t(d.home.far, { site })}</p>
              <p className="mt-2 text-[14px] text-muted">{d.home.goThere}</p>
            </div>
          </div>
        )}
      </Phone>
    </Scene>
  );
}

// --- Scene 4: a friend checks in -----------------------------------------------------------------

export function BuddyScene({ onNext }: { onNext: () => void }) {
  const { d, t } = useDemo();
  const [phase, setPhase] = useState<'idle' | 'refused' | 'alerted'>('idle');
  const later = useTimers();
  const friend = d.people.friend;
  return (
    <Scene
      role={d.common.you.friend}
      title={d.buddy.title}
      hint={t(d.buddy.hint, { friend })}
      doneTitle={d.buddy.doneTitle}
      doneBody={d.buddy.doneBody}
      done={phase === 'alerted'}
      onNext={onNext}
    >
      <Phone label={t(d.buddy.phoneOf, { friend })}>
        <div className="flex h-full flex-col">
          <StatusBar />
          <div className="flex flex-col items-center px-6 pt-10">
            <Logo size={56} />
            <p className="mt-3 text-[22px] font-bold">OnSite</p>
          </div>
          <div className={cx('mx-5 mt-8 space-y-3', phase !== 'idle' && 'animate-shake')}>
            <div>
              <p className="text-[12px] font-semibold text-ink-2">{d.buddy.username}</p>
              <p className="mt-1 rounded-xl bg-surface px-3 py-2.5 text-[15px] ring-1 ring-line" dir="ltr">
                {d.people.username}
              </p>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-ink-2">{d.buddy.password}</p>
              <p className="mt-1 rounded-xl bg-surface px-3 py-2.5 text-[15px] tracking-widest ring-1 ring-line" dir="ltr">
                ••••••••
              </p>
            </div>
            {phase !== 'idle' && (
              <p className="flex animate-pop-in items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[14px] font-semibold text-rose-700 ring-1 ring-rose-200">
                <X className="size-4 shrink-0" strokeWidth={3} />
                {d.buddy.error}
              </p>
            )}
            <Tap
              active={phase === 'idle'}
              className="block w-full"
              pointer="c"
              onTap={() => {
                setPhase('refused');
                sound.error();
                later(1100, () => {
                  setPhase('alerted');
                  sound.alert();
                });
              }}
            >
              <span className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[16px] font-bold text-white">{d.buddy.signIn}</span>
            </Tap>
          </div>
        </div>
      </Phone>
      <Phone label={d.common.managerPhone} dim={phase === 'idle'}>
        <ManagerToday mainIn={false} alert={phase === 'alerted' ? { title: d.buddy.alertTitle, body: t(d.buddy.alertBody, { name: d.people.main, friend }) } : null} />
      </Phone>
    </Scene>
  );
}

// --- Scene 5: call the late worker ---------------------------------------------------------------

export function LateScene({ onNext }: { onNext: () => void }) {
  const { d, t } = useDemo();
  const [phase, setPhase] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [seconds, setSeconds] = useState(0);
  const later = useTimers();
  useEffect(() => {
    if (phase !== 'connected') return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);
  const late = d.people.late;
  return (
    <Scene
      role={d.common.you.manager}
      title={t(d.late.title, { late })}
      hint={d.late.hint}
      doneTitle={d.late.doneTitle}
      doneBody={d.late.doneBody}
      done={phase === 'connected'}
      onNext={onNext}
    >
      <Phone>
        <ManagerToday
          mainIn
          onCallLate={
            phase === 'idle'
              ? () => {
                  setPhase('calling');
                  sound.ring();
                  later(1300, sound.ring);
                  later(2400, () => {
                    setPhase('connected');
                    sound.success();
                  });
                }
              : null
          }
        />
        {phase !== 'idle' && (
          <div className="absolute inset-0 z-30 flex animate-[fade-up_0.3s_both] flex-col items-center bg-gradient-to-b from-[#0d3b35] to-night pt-24 text-white">
            <div className="relative">
              {phase === 'calling' && <span className="absolute inset-0 animate-ring-wave rounded-full bg-mint/40" />}
              <Avatar name={late} i={3} size={96} />
            </div>
            <p className="mt-6 text-[26px] font-bold">{late}</p>
            <p className="mt-1 text-[15px] text-white/70" dir="ltr">
              +972 52 418 2290
            </p>
            <p className="mt-4 text-[16px] font-semibold text-mint tabular-nums">
              {phase === 'calling' ? d.late.calling : t(d.late.connected, { t: `00:0${Math.min(seconds, 9)}` })}
            </p>
            <div className="mt-auto mb-14 flex items-center gap-10">
              <span className="flex size-14 items-center justify-center rounded-full bg-white/15">
                <MessageCircle className="size-6" />
              </span>
              <span className="flex size-16 items-center justify-center rounded-full bg-rose-500">
                <PhoneOff className="size-7" />
              </span>
            </div>
          </div>
        )}
      </Phone>
    </Scene>
  );
}

// --- Scene 6: payroll ----------------------------------------------------------------------------

export function PayrollScene({ onNext, savings }: { onNext: () => void; savings: string }) {
  const { d, t, lang } = useDemo();
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const later = useTimers();
  const p = d.people;
  const rows: Array<[string, number, number]> = [
    [p.main, 176 * 60 + 30, 0],
    [p.others[0]!, 172 * 60 + 15, 1],
    [p.others[1]!, 168 * 60 + 45, 0],
    [p.late, 158 * 60 + 40, 6],
    [p.others[2]!, 180 * 60, 0],
    [p.others[3]!, 165 * 60 + 20, 2],
  ];
  const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const month = monthName(lang);
  return (
    <Scene
      role={d.common.you.manager}
      title={d.payroll.title}
      hint={d.payroll.hint}
      doneTitle={d.payroll.doneTitle}
      doneBody={d.payroll.doneBody}
      done={phase === 'done'}
      onNext={onNext}
      extra={
        <p className="mt-4 animate-fade-up rounded-2xl bg-night p-4 text-[16px] font-semibold text-white sm:text-lg" style={{ animationDelay: '300ms' }}>
          💰 {savings}
        </p>
      }
    >
      <Phone>
        <div className="relative flex h-full flex-col">
          <StatusBar time="17:30" />
          <AppHeader />
          <div className="min-h-0 flex-1 px-3 pt-3">
            <p className="px-1 text-[20px] font-bold">{t(d.payroll.hoursOf, { month })}</p>
            <div className="mt-3 overflow-hidden rounded-2xl bg-surface shadow-sm">
              <div className="grid grid-cols-[1fr_70px_52px] gap-1 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-semibold text-muted">
                <span>{d.payroll.worker}</span>
                <span className="text-center">{d.payroll.hours}</span>
                <span className="text-center">{d.payroll.lates}</span>
              </div>
              {rows.map(([name, min, lates], i) => (
                <div key={name} className="grid grid-cols-[1fr_70px_52px] items-center gap-1 border-b border-line px-3 py-2 text-[13px] last:border-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={name} i={i} size={24} />
                    <span className="truncate font-semibold">{name}</span>
                  </span>
                  <span className="text-center font-semibold tabular-nums" dir="ltr">
                    {hm(min)}
                  </span>
                  <span className={cx('text-center tabular-nums', lates > 3 ? 'font-bold text-amber-600' : 'text-muted')}>{lates}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_70px_52px] gap-1 bg-brand-soft px-3 py-2 text-[13px] font-bold">
                <span>{d.payroll.total}</span>
                <span className="text-center tabular-nums" dir="ltr">
                  {hm(rows.reduce((s, r) => s + r[1], 0))}
                </span>
                <span className="text-center tabular-nums">{rows.reduce((s, r) => s + r[2], 0)}</span>
              </div>
            </div>
          </div>
          <div className="p-4 pb-6">
            <Tap
              active={phase === 'idle'}
              className="block w-full"
              pointer="c"
              onTap={() => {
                setPhase('busy');
                later(800, () => {
                  setPhase('done');
                  sound.success();
                });
              }}
            >
              <span className={cx('flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[16px] font-bold text-white', phase === 'done' ? 'bg-emerald-600' : 'bg-[#107c41]')}>
                {phase === 'done' ? <Check className="size-5" strokeWidth={3} /> : <Download className={cx('size-5', phase === 'busy' && 'animate-bounce')} />}
                {phase === 'done' ? d.payroll.downloaded : d.payroll.download}
              </span>
            </Tap>
          </div>
          {phase === 'done' && (
            <div className="absolute inset-x-4 bottom-24 z-20 flex animate-pop-in items-center gap-3 rounded-2xl bg-surface p-3 shadow-xl ring-1 ring-line">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[#107c41] text-white">
                <FileSpreadsheet className="size-5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" dir="ltr">
                onsite-hours.xlsx
              </span>
              <Check className="size-5 text-emerald-600" strokeWidth={3} />
            </div>
          )}
        </div>
      </Phone>
    </Scene>
  );
}
