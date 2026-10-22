import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';
import { cx } from './ui';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success(message: string): void;
  error(messageOrError: unknown): void;
  info(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++;
    setItems((list) => [...list.slice(-2), { id, tone, message }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (e) => push('error', typeof e === 'string' ? e : errorMessage(e)),
    info: (m) => push('info', m),
  };
  const icons = { success: CircleCheck, error: CircleAlert, info: Info };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="animate-fade-up pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-pop"
            >
              <Icon
                className={cx(
                  'mt-0.5 size-4 shrink-0',
                  t.tone === 'success' && 'text-emerald-400',
                  t.tone === 'error' && 'text-rose-400',
                  t.tone === 'info' && 'text-sky-400',
                )}
                aria-hidden
              />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
