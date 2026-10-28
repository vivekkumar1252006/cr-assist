import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Inbox, RefreshCw, Timer, XCircle } from 'lucide-react';
import { initials } from '../../shared/lib/format.js';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, icon: Icon, action, children, className = '', bodyClassName = 'p-5' }) {
  return (
    <section className={`rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-navy-900/[0.03] ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-navy-900">
            {Icon && <Icon className="h-4 w-4 text-teal-600" />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const avatarSizes = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-16 w-16 text-lg',
  lg: 'h-28 w-28 text-3xl',
};

/** Circular photo with an initials fallback when there is no photo (or it fails to load). */
export function Avatar({ name, src, size = 'md', className = '' }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = src && failedSrc !== src;
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-teal-400 to-navy-600 font-bold text-white ring-4 ring-white ${avatarSizes[size]} ${className}`}
    >
      {showImage ? (
        <img src={src} alt={`${name}'s profile photo`} className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <span aria-label={`${name} (no photo)`}>{initials(name)}</span>
      )}
    </span>
  );
}

export function Skeleton({ className = '' }) {
  return <span className={`block animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-100 bg-red-50/60 px-4 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-red-500" />
      <p className="text-sm text-red-800">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold text-navy-900">{title}</p>
      {children && <div className="max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}

// Status always carries an icon + text label, never color alone.
const STATUS = {
  present: { label: 'Present', Icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  late: { label: 'Late', Icon: Clock, cls: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  absent: { label: 'Absent', Icon: XCircle, cls: 'bg-red-50 text-red-700 ring-red-600/20' },
  ongoing: { label: 'Ongoing', Icon: Timer, cls: 'bg-navy-50 text-navy-700 ring-navy-600/20' },
};

export function StatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.ongoing;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>
      <s.Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

const complaintStatus = {
  open: { label: 'Open', cls: 'bg-navy-50 text-navy-700 ring-navy-600/20' },
  in_review: { label: 'In review', cls: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-600/20' },
};

export function ComplaintStatusBadge({ status }) {
  const s = complaintStatus[status] ?? complaintStatus.open;
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>{s.label}</span>;
}

export function StatTile({ label, value, sub, icon: Icon, tone = 'navy' }) {
  const tones = {
    navy: 'bg-navy-50 text-navy-700',
    teal: 'bg-teal-50 text-teal-700',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-navy-900/[0.03]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-navy-900 tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-60';
