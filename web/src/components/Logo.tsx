import { useId } from 'react';
import { usePublicConfig } from '../lib/auth';
import { cx } from './ui';

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cx('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-g)`} />
      <path
        d="M16 6.4c-4.15 0-7.5 3.22-7.5 7.35 0 5.3 6.18 10.92 6.88 11.53a.94.94 0 0 0 1.24 0c.7-.61 6.88-6.23 6.88-11.53 0-4.13-3.35-7.35-7.5-7.35Z"
        fill="#fff"
      />
      <path d="m12.85 13.85 2.2 2.2 4.05-4.2" fill="none" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const config = usePublicConfig();
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span className="text-[17px] font-semibold tracking-tight text-ink">{config?.appName ?? 'OnSite'}</span>
    </span>
  );
}
