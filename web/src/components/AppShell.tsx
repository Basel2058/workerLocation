import { Ellipsis, LogOut, UserRound } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { t } from '../lib/i18n';
import { Dialog } from './Dialog';
import { LogoMark } from './Logo';
import { Avatar, cx } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
  end?: boolean;
}

function Badge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cx(
        'tabular grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white',
        className,
      )}
    >
      {count > 99 ? t('ui.badge.overflow') : count}
    </span>
  );
}

/**
 * Layout for the manager dashboard and the developer console:
 * a sidebar on large screens, a top bar + bottom tabs on phones.
 */
export function AppShell({
  title,
  subtitle,
  items,
  accountTo,
  banner,
  children,
}: {
  title: string;
  subtitle?: string;
  items: NavItem[];
  accountTo: string;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const primary = items.length > 5 ? items.slice(0, 4) : items;
  const overflow = items.length > 5 ? items.slice(4) : [];
  const overflowActive = overflow.some((i) => location.pathname.startsWith(i.to));

  return (
    <div className="min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-line bg-surface lg:flex">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <LogoMark size={34} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label={t('ui.shell.mainNav')}>
          {items.map(({ to, label, icon: Icon, badge, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              <Icon className="size-[18px] shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              <Badge count={badge} />
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <NavLink
            to={accountTo}
            className={({ isActive }) =>
              cx('flex items-center gap-3 rounded-xl px-2 py-2 transition-colors', isActive ? 'bg-surface-2' : 'hover:bg-surface-2')
            }
          >
            <Avatar name={user?.fullName ?? '?'} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{user?.fullName}</p>
              <p className="truncate text-xs text-muted">{t('ui.shell.accountSettings')}</p>
            </div>
          </NavLink>
          <button
            onClick={() => void logout()}
            className="mt-1 flex h-9 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="size-4" /> {t('ui.shell.signOut')}
          </button>
        </div>
      </aside>

      {/* Top bar (phones) */}
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <LogoMark size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-semibold">{title}</p>
            {subtitle && <p className="truncate text-[11px] leading-tight text-muted">{subtitle}</p>}
          </div>
          <NavLink to={accountTo} aria-label={t('ui.shell.account')} className="rounded-full">
            <Avatar name={user?.fullName ?? '?'} size={32} />
          </NavLink>
        </div>
      </header>

      <div className="min-w-0 lg:ps-64">
        {banner}
        <main className="mx-auto max-w-[1400px] px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>
      </div>

      {/* Bottom tabs (phones) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden" aria-label={t('ui.shell.mainNav')}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${primary.length + (overflow.length ? 1 : 0)}, minmax(0, 1fr))` }}>
          {primary.map(({ to, label, icon: Icon, badge, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  isActive ? 'text-brand' : 'text-muted',
                )
              }
            >
              <Icon className="size-[22px]" strokeWidth={1.9} />
              <span className="max-w-full truncate px-1">{label}</span>
              <Badge count={badge} className="absolute top-1.5 start-1/2 ms-2 h-[18px] min-w-[18px] text-[10px]" />
            </NavLink>
          ))}
          {overflow.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              className={cx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', overflowActive ? 'text-brand' : 'text-muted')}
            >
              <Ellipsis className="size-[22px]" />
              {t('ui.shell.more')}
            </button>
          )}
        </div>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('ui.shell.more')}>
        <div className="grid gap-1">
          {overflow.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium hover:bg-surface-2"
            >
              <Icon className="size-5 text-muted" />
              <span className="flex-1">{label}</span>
              <Badge count={badge} />
            </NavLink>
          ))}
          <NavLink to={accountTo} onClick={() => setMoreOpen(false)} className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium hover:bg-surface-2">
            <UserRound className="size-5 text-muted" /> {t('ui.shell.account')}
          </NavLink>
        </div>
      </Dialog>
    </div>
  );
}
