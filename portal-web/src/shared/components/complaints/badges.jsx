import { AlertOctagon, ArrowDown, CheckCircle2, CircleDot, Clock, Equal, Loader, Send, XCircle } from 'lucide-react';
import { STATUS_LABEL } from '../../lib/complaints.js';

// Status: icon + label + color, used everywhere a complaint status appears.
const STATUS = {
  submitted: { Icon: Send, cls: 'bg-navy-50 text-navy-700 ring-navy-600/20', dot: 'bg-navy-500' },
  under_review: { Icon: Clock, cls: 'bg-amber-50 text-amber-800 ring-amber-600/25', dot: 'bg-amber-500' },
  in_progress: { Icon: Loader, cls: 'bg-sky-50 text-sky-800 ring-sky-600/20', dot: 'bg-sky-500' },
  resolved: { Icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  rejected: { Icon: XCircle, cls: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
};

export function ComplaintStatusBadge({ status, size = 'sm' }) {
  const s = STATUS[status] ?? STATUS.submitted;
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${pad} ${s.cls}`}>
      <s.Icon className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const statusDot = (status) => (STATUS[status] ?? STATUS.submitted).dot;

const PRIORITY = {
  high: { label: 'High', Icon: AlertOctagon, cls: 'text-red-700' },
  medium: { label: 'Medium', Icon: Equal, cls: 'text-amber-700' },
  low: { label: 'Low', Icon: ArrowDown, cls: 'text-slate-500' },
};

export function PriorityBadge({ priority }) {
  const p = PRIORITY[priority] ?? { label: priority, Icon: CircleDot, cls: 'text-slate-500' };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold ${p.cls}`}>
      <p.Icon className="h-3.5 w-3.5" />
      {p.label}
    </span>
  );
}
