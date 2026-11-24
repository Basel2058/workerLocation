import { Building2, House } from 'lucide-react';
import { cx } from './ui';

/**
 * A small drawn map (not real map tiles): streets, the workplace with its allowed area, and where the
 * worker is. `inside`: at work. `far`: at home, 3.2 km away.
 */
export function MiniMap({ mode, homeLabel, workLabel, distance, className }: { mode: 'inside' | 'far'; homeLabel?: string; workLabel?: string; distance?: string; className?: string }) {
  const work = mode === 'far' ? { x: 230, y: 70 } : { x: 160, y: 95 };
  const me = mode === 'far' ? { x: 70, y: 150 } : { x: 172, y: 104 };
  return (
    <div className={cx('relative overflow-hidden rounded-2xl bg-[#eef2ef]', className)} dir="ltr">
      <svg viewBox="0 0 320 190" className="block h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <rect width="320" height="190" fill="#eef2ef" />
        {/* Blocks */}
        {[
          [10, 10, 70, 45], [95, 10, 80, 45], [190, 10, 120, 30], [10, 70, 50, 50], [75, 70, 60, 50], [250, 55, 60, 60],
          [10, 135, 90, 45], [115, 135, 70, 45], [200, 130, 110, 50],
        ].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="6" fill="#e2e8e4" />
        ))}
        <rect x="150" y="62" width="85" height="60" rx="8" fill="#d9f2e9" />
        {/* Streets */}
        <path d="M0 60 H320 M0 127 H320 M88 0 V190 M190 0 V190 M245 40 V190" stroke="#ffffff" strokeWidth="9" fill="none" />
        <path d="M0 60 H320 M0 127 H320 M88 0 V190 M190 0 V190 M245 40 V190" stroke="#f6d78b" strokeWidth="1.2" strokeDasharray="5 6" fill="none" opacity="0.7" />
        {/* Allowed area */}
        <circle cx={work.x} cy={work.y} r={mode === 'far' ? 30 : 42} fill="#0f766e" fillOpacity="0.14" stroke="#0f766e" strokeWidth="2" strokeDasharray="5 4" />
        {mode === 'far' && (
          <>
            <path d={`M${me.x} ${me.y} L${work.x} ${work.y}`} stroke="#e11d48" strokeWidth="2.5" strokeDasharray="6 5" fill="none" />
            <circle cx={me.x} cy={me.y} r="18" fill="#e11d48" fillOpacity="0.15" />
          </>
        )}
        {mode === 'inside' && <circle cx={me.x} cy={me.y} r="14" fill="#2563eb" fillOpacity="0.15" />}
        <circle cx={me.x} cy={me.y} r="7" fill={mode === 'far' ? '#e11d48' : '#2563eb'} stroke="#fff" strokeWidth="3" />
      </svg>
      {/* Labels (HTML, so they use the page's font and language). */}
      <span
        className="absolute flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-brand shadow"
        style={{ left: `${(work.x / 320) * 100}%`, top: `${((work.y - 48) / 190) * 100}%`, transform: 'translateX(-50%)' }}
      >
        <Building2 className="size-3" />
        {workLabel}
      </span>
      {mode === 'far' && (
        <>
          <span
            className="absolute flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-600 shadow"
            style={{ left: `${(me.x / 320) * 100}%`, top: `${((me.y + 14) / 190) * 100}%`, transform: 'translateX(-50%)' }}
          >
            <House className="size-3" />
            {homeLabel}
          </span>
          <span className="absolute rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ left: '44%', top: '50%' }}>
            {distance}
          </span>
        </>
      )}
    </div>
  );
}
