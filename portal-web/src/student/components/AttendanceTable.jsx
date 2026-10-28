import { Link } from 'react-router-dom';
import { MessageSquareWarning } from 'lucide-react';
import { StatusBadge } from './common.jsx';
import { formatDay, formatTime } from '../../shared/lib/format.js';

/** Attendance rows as a table on wide screens and stacked cards on mobile. */
export default function AttendanceTable({ items, allowComplaint = false }) {
  const complaintLink = (item) => {
    const date = new Date(item.startsAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return `/student/complaints/new?category=attendance_marked_absent&date=${date}&session=${item.sessionId}`;
  };

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">Class</th>
              <th className="px-5 py-3">Status</th>
              {allowComplaint && <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.sessionId} className="transition hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-5 py-3 font-medium text-navy-900">{formatDay(item.startsAt)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-600 tabular-nums">
                  {formatTime(item.startsAt)} – {formatTime(item.endsAt)}
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-800">{item.subject}</p>
                  <p className="text-xs text-slate-500">
                    {[item.room, item.faculty].filter(Boolean).join(' · ') || '—'}
                  </p>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={item.status} />
                  {item.markedAt && <p className="mt-1 text-xs text-slate-500">Marked {formatTime(item.markedAt)}</p>}
                </td>
                {allowComplaint && (
                  <td className="px-5 py-3 text-right">
                    {item.status === 'absent' && (
                      <Link to={complaintLink(item)} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline">
                        <MessageSquareWarning className="h-3.5 w-3.5" /> Raise complaint
                      </Link>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 md:hidden">
        {items.map((item) => (
          <li key={item.sessionId} className="flex items-start justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{item.subject}</p>
              <p className="text-xs text-slate-500">
                {formatDay(item.startsAt)} · {formatTime(item.startsAt)}
                {item.room ? ` · ${item.room}` : ''}
              </p>
              {allowComplaint && item.status === 'absent' && (
                <Link to={complaintLink(item)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                  <MessageSquareWarning className="h-3.5 w-3.5" /> Raise complaint
                </Link>
              )}
            </div>
            <StatusBadge status={item.status} />
          </li>
        ))}
      </ul>
    </>
  );
}
