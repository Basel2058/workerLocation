import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, cx, IconButton, Input, type ButtonVariant } from './ui';

/**
 * Modal built on the native <dialog> element (focus trap, Escape, top layer for free).
 * Centered on larger screens, a bottom sheet on phones.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  bare,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** No padding around the body (for maps and photos). */
  bare?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        'fixed inset-x-0 bottom-0 m-0 mt-auto max-h-[94dvh] w-full max-w-full overflow-visible bg-transparent p-0 text-ink',
        'sm:inset-0 sm:m-auto sm:h-fit sm:px-4',
        width,
      )}
    >
      {open && (
        <div className="animate-sheet-up flex max-h-[94dvh] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop ring-1 ring-line sm:rounded-2xl">
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
          {(title || description) && (
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-3 pb-2 sm:pt-5">
              <div className="min-w-0">
                {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-1" />
            </div>
          )}
          <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain', !bare && 'px-5 pb-5', bare && !title && 'rounded-t-3xl')}>
            {children}
          </div>
          {footer && (
            <div className="safe-bottom flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

// --- Confirm -------------------------------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ButtonVariant;
  /** Ask the user to type this text to confirm (for destructive actions). */
  typeToConfirm?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise((resolve) => {
        setTyped('');
        setState({ ...opts, resolve });
      }),
    [],
  );
  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  const blocked = !!state?.typeToConfirm && typed.trim() !== state.typeToConfirm;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {state?.cancelText ?? 'Cancel'}
            </Button>
            <Button variant={state?.variant ?? 'brand'} disabled={blocked} onClick={() => close(true)}>
              {state?.confirmText ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {state?.body && <div className="text-sm text-ink-2">{state.body}</div>}
        {state?.typeToConfirm && (
          <div className="mt-4">
            <p className="mb-1.5 text-[13px] text-muted">
              Type <span className="font-mono font-semibold text-ink">{state.typeToConfirm}</span> to confirm.
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm outside ConfirmProvider');
  return ctx;
}
