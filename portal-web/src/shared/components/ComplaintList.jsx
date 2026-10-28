import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, Paperclip } from 'lucide-react';
import { formatDate } from '@shared/lib/format.js';

// The student list groups the workflow statuses into three simple states that
// match the Status filter (Pending / Approved / Rejected).
const STATUS_PILL = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-600/20' },
};

/** Collapses submitted/under_review/in_progress into Pending, resolved into Approved. */
export function complaintStatusGroup(status) {
  if (status === 'resolved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function StatusPill({ status }) {
  const cfg = STATUS_PILL[complaintStatusGroup(status)];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

/** Complaints as a table (desktop) / cards (mobile). `showStudent` adds the student column for staff. */
export function ComplaintList({ items, basePath, showStudent = false, showStatus = false }) {
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Complaint ID</th>
              {showStudent && <th className="px-5 py-3">Student</th>}
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Submitted</th>
              {showStatus ? <th className="px-5 py-3">Status</th> : <th className="px-5 py-3">Updated</th>}
              <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((c) => (
              <tr key={c.id} className="transition hover:bg-slate-50/70">
                <td className="max-w-xs px-5 py-3">
                  <p className="font-mono text-xs font-semibold text-teal-700">{c.complaintNumber}</p>
                  <p className="truncate font-medium text-navy-900" title={c.title}>{c.title}</p>
                  {c.attachmentCount > 0 && <p className="inline-flex items-center gap-1 text-xs text-slate-500"><Paperclip className="h-3 w-3" />{c.attachmentCount}</p>}
                </td>
                {showStudent && (
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{c.student.name}</p>
                    <p className="text-xs text-slate-500">{c.student.enrollmentNumber} · {c.student.course} S{c.student.semester} G{c.student.group}</p>
                  </td>
                )}
                <td className="px-5 py-3 text-slate-600">{c.categoryLabel}</td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDate(c.createdAt)}</td>
                {showStatus ? (
                  <td className="whitespace-nowrap px-5 py-3"><StatusPill status={c.status} /></td>
                ) : (
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDate(c.updatedAt)}</td>
                )}
                <td className="px-5 py-3 text-right">
                  <Link to={`${basePath}/${c.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-navy-800 hover:bg-slate-50">
                    <Eye className="h-3.5 w-3.5" /> View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 lg:hidden">
        {items.map((c) => (
          <li key={c.id}>
            <Link to={`${basePath}/${c.id}`} className="block px-5 py-4 transition hover:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-teal-700">{c.complaintNumber}</p>
                  <p className="truncate font-semibold text-navy-900">{c.title}</p>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">{c.categoryLabel}</p>
              {showStudent && <p className="text-xs text-slate-500">{c.student.name} · {c.student.enrollmentNumber}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Submitted {formatDate(c.createdAt)}</span>
                {showStatus ? <StatusPill status={c.status} /> : <span>Updated {formatDate(c.updatedAt)}</span>}
              </div>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700"><Eye className="h-3.5 w-3.5" /> View Details</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({ page, pages, total, onPage, disabled }) {
  if (pages <= 1) return null;
  const btn = 'inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40';
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
      <p className="text-slate-500">Page {page} of {pages} · {total} total</p>
      <div className="flex gap-2">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1 || disabled} className={btn}><ChevronLeft className="h-4 w-4" /> Previous</button>
        <button onClick={() => onPage(page + 1)} disabled={page >= pages || disabled} className={btn}>Next <ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export const filterSelectCls =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-100';
