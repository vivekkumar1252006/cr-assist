import React from 'react';

export function StatusBadge({ status }) {
  const map = {
    active: { label: 'Active', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pending: { label: 'Pending Approval', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    suspended: { label: 'Suspended', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
    rejected: { label: 'Rejected', bg: 'bg-slate-100 text-slate-700 border-slate-300' },
    // Attendance
    present: { label: 'Present', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    late: { label: 'Late', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    absent: { label: 'Absent', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
    // Session
    scheduled: { label: 'Scheduled', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
    closed: { label: 'Closed', bg: 'bg-slate-100 text-slate-700 border-slate-300' },
    cancelled: { label: 'Cancelled', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
    // Complaints
    submitted: { label: 'Submitted', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
    under_review: { label: 'Under Review', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    in_progress: { label: 'In Progress', bg: 'bg-purple-50 text-purple-700 border-purple-200' },
    resolved: { label: 'Resolved', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };

  const current = map[status] || { label: status, bg: 'bg-slate-50 text-slate-700 border-slate-200' };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${current.bg}`}
    >
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-current opacity-70"></span>
      {current.label}
    </span>
  );
}

/**
 * Complaint status as the three states an admin acts on: Pending covers the open
 * workflow statuses (submitted / under review / in progress), Approved is a
 * resolved complaint and Rejected a rejected one. Matches the student portal.
 */
export function ComplaintStatusBadge({ status }) {
  const map = {
    pending: { label: 'Pending', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    approved: { label: 'Approved', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    rejected: { label: 'Rejected', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  };
  const group = status === 'resolved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
  const current = map[group];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${current.bg}`}
    >
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-current opacity-70"></span>
      {current.label}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const map = {
    low: { label: 'Low', bg: 'bg-slate-50 text-slate-600 border-slate-200' },
    medium: { label: 'Medium', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    high: { label: 'High Priority', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  };
  const current = map[priority] || { label: priority, bg: 'bg-slate-50 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${current.bg}`}>
      {current.label}
    </span>
  );
}
