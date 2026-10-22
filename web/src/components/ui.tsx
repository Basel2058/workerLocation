import { LoaderCircle } from 'lucide-react';
import {
  forwardRef,
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ComponentType,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router';
import { initials } from '../lib/format';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type IconType = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;

// --- Buttons -------------------------------------------------------------------------------------

const buttonBase =
  'inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';

const buttonVariants = {
  brand: 'bg-brand text-on-brand hover:bg-brand-strong shadow-sm',
  ink: 'bg-ink text-bg hover:opacity-90 shadow-sm',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line-strong/70 hover:bg-surface-2 shadow-xs',
  soft: 'bg-surface-2 text-ink hover:bg-surface-3',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  dangerSoft: 'bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
} as const;

const buttonSizes = {
  xs: 'h-7 px-2.5 text-xs rounded-lg gap-1',
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-xl gap-2',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof buttonSizes;
  loading?: boolean;
  icon?: IconType;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon: Icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className={size === 'lg' ? 'size-5' : 'size-4'} aria-hidden />
      ) : null}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  block,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: keyof typeof buttonSizes; icon?: IconType; block?: boolean }) {
  return (
    <Link className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], block && 'w-full', className)} {...rest}>
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </Link>
  );
}

/** External link styled as a button (tel:, https://wa.me, downloads). */
export function ButtonAnchor({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  block,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof buttonSizes;
  icon?: IconType;
  block?: boolean;
}) {
  return (
    <a className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], block && 'w-full', className)} {...rest}>
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </a>
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconType; label: string; variant?: ButtonVariant; size?: 'sm' | 'md' }
>(function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        buttonBase,
        buttonVariants[variant],
        size === 'sm' ? 'size-8 rounded-lg' : 'size-10 rounded-xl',
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-[18px]'} aria-hidden />
    </button>
  );
});

// --- Surfaces ------------------------------------------------------------------------------------

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl bg-surface ring-1 ring-line shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// --- Status --------------------------------------------------------------------------------------

export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'violet' | 'teal';

const toneClasses: Record<Tone, string> = {
  green: 'bg-emerald-500/12 text-emerald-700 ring-emerald-600/15 dark:text-emerald-300',
  red: 'bg-rose-500/12 text-rose-700 ring-rose-600/15 dark:text-rose-300',
  amber: 'bg-amber-500/15 text-amber-800 ring-amber-600/20 dark:text-amber-300',
  blue: 'bg-sky-500/12 text-sky-700 ring-sky-600/15 dark:text-sky-300',
  gray: 'bg-slate-500/10 text-slate-600 ring-slate-500/15 dark:text-slate-300',
  violet: 'bg-violet-500/12 text-violet-700 ring-violet-600/15 dark:text-violet-300',
  teal: 'bg-teal-500/12 text-teal-700 ring-teal-600/15 dark:text-teal-300',
};

export const toneDot: Record<Tone, string> = {
  green: 'bg-emerald-500',
  red: 'bg-rose-500',
  amber: 'bg-amber-500',
  blue: 'bg-sky-500',
  gray: 'bg-slate-400',
  violet: 'bg-violet-500',
  teal: 'bg-teal-500',
};

export function Badge({
  tone = 'gray',
  dot,
  children,
  className,
  title,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className={cx('size-1.5 shrink-0 rounded-full', toneDot[tone])} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

const avatarPalette = [
  'bg-teal-600',
  'bg-sky-600',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-600',
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-600',
  'bg-emerald-600',
  'bg-cyan-600',
];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return avatarPalette[Math.abs(h) % avatarPalette.length]!;
}

export function Avatar({
  name,
  size = 40,
  ring,
  className,
}: {
  name: string;
  size?: number;
  ring?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white select-none',
        avatarColor(name),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
      {ring && (
        <span
          className={cx('absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-surface', toneDot[ring])}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
        />
      )}
    </span>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <LoaderCircle role="status" aria-label={label} className={cx('size-5 animate-spin text-muted', className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner className="size-6" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-surface-3/70', className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: IconType;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
          <Icon className="size-6" aria-hidden />
        </div>
      )}
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="rounded-2xl bg-rose-500/8 p-4 text-sm text-rose-800 ring-1 ring-rose-500/20 dark:text-rose-200" role="alert">
      <p>{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = 'blue',
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  icon?: IconType;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex gap-3 rounded-2xl p-4 text-sm ring-1 ring-inset', toneClasses[tone], className)}>
      {Icon && <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(!!title && 'mt-0.5', 'opacity-90')}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

// --- Forms ---------------------------------------------------------------------------------------

const fieldBase =
  'block w-full rounded-xl bg-surface px-3.5 text-ink ring-1 ring-inset ring-line-strong/80 placeholder:text-faint transition-shadow focus:ring-2 focus:ring-brand focus:outline-none disabled:opacity-60';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
  optional,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-2">
          <span>{label}</span>
          {optional && <span className="text-xs font-normal text-faint">Optional</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(fieldBase, 'h-11 sm:h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cx(fieldBase, 'py-2.5', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(
        fieldBase,
        "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2398a2b3%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9 sm:h-10",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-brand' : 'bg-surface-3 ring-1 ring-inset ring-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; icon?: IconType }>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" className={cx('inline-flex rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line', className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-all',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
  hint,
  onClick,
  active,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  icon?: IconType;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'rounded-2xl bg-surface p-4 text-left ring-1 shadow-card transition-all',
        active ? 'ring-2 ring-brand' : 'ring-line',
        onClick && 'hover:ring-line-strong active:scale-[0.99]',
      )}
    >
      <div className="flex items-center gap-2 text-[13px] text-muted">
        {tone && <span className={cx('size-2 rounded-full', toneDot[tone])} />}
        {Icon && <Icon className="size-4" aria-hidden />}
        <span className="truncate">{label}</span>
      </div>
      <div className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Tag>
  );
}

export function Kv({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right text-ink">{children}</span>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}
