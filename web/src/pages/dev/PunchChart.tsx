import { useId, useMemo, useState } from 'react';
import type { DevOverview } from '../../../../shared/types';
import { cx } from '../../components/ui';
import { getIntlLocale, t, useI18n } from '../../lib/i18n';

// Check-ins per hour over the last 24 hours, stacked by outcome. Outcomes are states, so they use the
// fixed status colors (good / warning / critical) with a labelled legend, a tooltip and a table view.
// The chart itself always reads left to right (time runs left to right in every language).
const SERIES = [
  { key: 'accepted', color: '#0ca30c' },
  { key: 'review', color: '#fab219' },
  { key: 'rejected', color: '#d03b3b' },
] as const;

function seriesLabel(key: (typeof SERIES)[number]['key']): string {
  if (key === 'accepted') return t('dev.chart.accepted');
  if (key === 'review') return t('dev.chart.review');
  return t('dev.chart.rejected');
}

type Hour = DevOverview['punchesByHour'][number];

const W = 720;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 34 };
const GAP = 2;

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s * 4 >= v) ?? pow * 10;
  return step * 4;
}

export function PunchChart({ data }: { data: Hour[] }) {
  const { dir } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const titleId = useId();
  // Hours in the app language (the whole app re-mounts when the language changes).
  const hourLabel = useMemo(() => {
    const format = new Intl.DateTimeFormat(getIntlLocale(), { hour: 'numeric' });
    return (iso: string) => format.format(new Date(iso));
  }, []);
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.accepted + d.review + d.rejected))), [data]);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => (v / max) * plotH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
            {seriesLabel(s.key)}
          </span>
        ))}
        <button onClick={() => setTable((v) => !v)} className="ms-auto text-xs font-medium text-brand hover:underline">
          {table ? t('dev.chart.showChart') : t('dev.chart.showTable')}
        </button>
      </div>

      {table ? (
        <div className="max-h-64 overflow-y-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('dev.chart.hour')}</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-end font-medium">
                    {seriesLabel(s.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line">
              {[...data].reverse().map((d) => (
                <tr key={d.hour}>
                  <td className="px-3 py-1.5">{hourLabel(d.hour)}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-end">
                      {d[s.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" dir="ltr">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={titleId} onPointerLeave={() => setHover(null)}>
            <title id={titleId}>{t('dev.chart.title')}</title>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH - y(tick)} y2={PAD.top + plotH - y(tick)} className="stroke-line" strokeWidth={1} />
                <text x={PAD.left - 8} y={PAD.top + plotH - y(tick)} dy="0.32em" textAnchor="end" className="fill-faint text-[10px]">
                  {Math.round(tick)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = PAD.left + i * band + (band - barW) / 2;
              let base = PAD.top + plotH;
              const parts = SERIES.map((s) => ({ ...s, value: d[s.key] })).filter((p) => p.value > 0);
              return (
                <g key={d.hour}>
                  {parts.map((p, j) => {
                    const h = Math.max(1, y(p.value) - (j > 0 ? GAP : 0));
                    const top = base - h;
                    base = top - GAP;
                    const isTop = j === parts.length - 1;
                    const r = isTop ? Math.min(4, h / 2, barW / 2) : 0;
                    // Rounded only at the data end; square at the baseline.
                    const path = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
                    return <path key={p.key} d={path} fill={p.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
                  })}
                  {(i % 3 === 0 || i === data.length - 1) && (
                    <text x={PAD.left + i * band + band / 2} y={H - 8} textAnchor="middle" className="fill-faint text-[10px]">
                      {hourLabel(d.hour)}
                    </text>
                  )}
                  <rect
                    x={PAD.left + i * band}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={t('dev.chart.bar', { hour: hourLabel(d.hour), accepted: d.accepted, review: d.review, rejected: d.rejected })}
                    onPointerEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="outline-none"
                  />
                </g>
              );
            })}
          </svg>
          {active && hover !== null && (
            <div
              dir={dir}
              className={cx('pointer-events-none absolute top-0 z-10 w-44 rounded-xl bg-surface p-3 text-xs shadow-pop ring-1 ring-line')}
              style={{
                left: `${Math.min(80, Math.max(0, ((PAD.left + hover * band + band / 2) / W) * 100 - 12))}%`,
              }}
            >
              <p className="mb-1.5 font-medium text-muted">{hourLabel(active.hour)}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-2 py-0.5">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="tabular font-semibold text-ink">{active[s.key]}</span>
                  <span className="text-muted">{seriesLabel(s.key)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
