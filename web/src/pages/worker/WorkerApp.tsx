import { CalendarDays, House, Share, SquarePlus, UserRound } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { LogoMark } from '../../components/Logo';
import { Button, cx } from '../../components/ui';
import { isStandalone } from '../../lib/device';
import { useStoredState } from '../../lib/hooks';
import { isIos } from '../../lib/pwa';
import { useDevice, type DeviceState } from './useDevice';
import { WorkerHome } from './WorkerHome';
import { WorkerMe } from './WorkerMe';
import { WorkerShifts } from './WorkerShifts';

interface WorkerCtx {
  device: ReturnType<typeof useDevice>;
}
const Ctx = createContext<WorkerCtx | null>(null);
export const useWorker = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorker outside WorkerApp');
  return ctx;
};

export function deviceReady(state: DeviceState) {
  return state === 'active';
}

export function WorkerApp() {
  // iPhone home-screen apps keep their own storage, separate from Safari. Suggest installing first so the
  // phone is registered once, inside the installed app.
  const [skipInstall, setSkipInstall] = useStoredState('onsite.skipInstallHint', false);
  const [installHint] = useState(() => isIos() && !isStandalone());
  const gate = installHint && !skipInstall;
  const device = useDevice(!gate);

  if (gate && (device.state === 'checking' || device.state === 'registering')) {
    return <InstallHint onSkip={() => setSkipInstall(true)} />;
  }

  return (
    <Ctx.Provider value={{ device }}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <main className="flex-1 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-28">
          <Routes>
            <Route index element={<WorkerHome />} />
            <Route path="shifts" element={<WorkerShifts />} />
            <Route path="me" element={<WorkerMe />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </Ctx.Provider>
  );
}

function BottomNav() {
  const items = [
    { to: '/w', label: 'Home', icon: House, end: true },
    { to: '/w/shifts', label: 'Shifts', icon: CalendarDays, end: false },
    { to: '/w/me', label: 'Me', icon: UserRound, end: false },
  ];
  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl"
      aria-label="Main"
    >
      <div className="mx-auto grid max-w-md grid-cols-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                isActive ? 'text-brand' : 'text-muted hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-[22px]" strokeWidth={isActive ? 2.3 : 1.8} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function InstallHint({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <LogoMark size={56} />
      <h1 className="mt-6 text-[26px] font-semibold tracking-tight">Add the app to your Home Screen</h1>
      <p className="mt-2 text-[15px] text-muted">Then checking in is one tap from your Home Screen. It takes 10 seconds:</p>
      <ol className="mt-6 space-y-4 text-[15px]">
        <li className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand">1</span>
          <span className="pt-1">
            Tap the <Share className="inline size-5 -translate-y-0.5 text-sky-600" aria-label="Share" /> Share button at the bottom of Safari.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand">2</span>
          <span className="pt-1">
            Choose <SquarePlus className="inline size-5 -translate-y-0.5" aria-hidden /> <b>Add to Home Screen</b>.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand">3</span>
          <span className="pt-1">Open the app from your Home Screen and sign in there.</span>
        </li>
      </ol>
      <Button variant="ghost" className="mt-10" onClick={onSkip}>
        Continue in Safari instead
      </Button>
    </div>
  );
}
