import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatPercent } from '../../shared/lib/format.js';

/**
 * Single-value progress ring for overall attendance. The threshold tick shows the minimum
 * required percentage; the state is also stated in text below (never color alone).
 */
export function AttendanceRing({ percentage, minimum = 75, size = 168 }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = percentage ?? 0;
  const ok = percentage == null || percentage >= minimum;
  const color = ok ? '#0d9488' : '#dc2626'; // teal-600 / red-600
  const tickAngle = (minimum / 100) * 2 * Math.PI - Math.PI / 2;
  const tick = (rad) => [size / 2 + rad * Math.cos(tickAngle), size / 2 + rad * Math.sin(tickAngle)];
  const [x1, y1] = tick(r - stroke / 2 - 3);
  const [x2, y2] = tick(r + stroke / 2 + 3);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`Overall attendance ${formatPercent(percentage)}, minimum required ${minimum}%`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 900ms ease-out' }}
          />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0b1f4b" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-3xl font-bold tracking-tight text-navy-900 tabular-nums">{formatPercent(percentage)}</p>
            <p className="text-xs font-medium text-slate-500">attendance</p>
          </div>
        </div>
      </div>
      {percentage != null && (
        <p className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-teal-700' : 'text-red-700'}`}>
          {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {ok ? `Meets the ${minimum}% requirement` : `Below the ${minimum}% requirement`}
        </p>
      )}
    </div>
  );
}

/**
 * Horizontal bars: attendance % per subject (one series, so no legend). A dashed reference
 * line marks the minimum; bars below it switch to the warning color and get an icon label.
 */
export function SubjectBars({ data, minimum = 75 }) {
  const [hover, setHover] = useState(null);
  return (
    <div>
      <ul className="space-y-3.5">
        {data.map((d) => {
          const below = d.percentage < minimum;
          return (
            <li
              key={d.subject}
              className="relative"
              onMouseEnter={() => setHover(d.subject)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.subject)}
              onBlur={() => setHover(null)}
              tabIndex={0}
            >
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-slate-700">{d.subject}</span>
                <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-navy-900">
                  {below && <AlertTriangle className="h-3.5 w-3.5 text-red-600" aria-label="Below minimum" />}
                  {formatPercent(d.percentage)}
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${below ? 'bg-red-500' : 'bg-teal-500'} ${hover === d.subject ? 'brightness-95' : ''}`}
                  style={{ width: `${d.percentage}%` }}
                />
                <span
                  className="absolute -top-1 bottom-[-4px] w-0 border-l-2 border-dashed border-navy-800/60"
                  style={{ left: `${minimum}%` }}
                  aria-hidden="true"
                />
              </div>
              {hover === d.subject && (
                <div className="pointer-events-none absolute -top-9 right-0 z-10 rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
                  {d.attended} of {d.total} classes attended
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-block h-3 w-0 border-l-2 border-dashed border-navy-800/60" /> Minimum required ({minimum}%)
      </p>
    </div>
  );
}
