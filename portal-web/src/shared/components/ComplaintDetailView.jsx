import { useState } from 'react';
import {
  CalendarDays, CheckCircle2, ClipboardList, Download, ExternalLink, FileText, History, Loader2, MessageSquare, Paperclip,
  Send, ShieldCheck, UserRound, XCircle,
} from 'lucide-react';
import { Card } from '@student/components/common.jsx';
import { ComplaintStatusBadge, PriorityBadge, statusDot } from './badges.jsx';
import FilePicker from './FilePicker.jsx';
import { api, parseApiError } from '@shared/lib/api.js';
import { uploadAttachments } from '@shared/lib/uploads.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate, formatDay, formatTime } from '@shared/lib/format.js';
import { ATTENDANCE_STATUS_LABEL, LIMITS, STATUS_LABEL, formatBytes } from '@shared/lib/complaints.js';

const dateTime = (v) => (v ? `${formatDate(v)}, ${formatTime(v)}` : '—');
const roleLabel = { student: 'Student', faculty: 'Class Incharge / Faculty', admin: 'Administrator' };

function Attachments({ complaint }) {
  if (!complaint.attachments.length) return <p className="text-sm text-slate-500">No files attached.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {complaint.attachments.map((a) => (
        <li key={a.id} className="flex gap-3 rounded-xl border border-slate-200 p-2.5">
          <a href={a.url} target="_blank" rel="noreferrer" className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
            {a.mimeType.startsWith('image/') ? (
              <img src={a.url} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <FileText className="h-7 w-7 text-red-500" />
            )}
          </a>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy-900" title={a.name}>{a.name}</p>
            <p className="text-xs text-slate-500">
              {formatBytes(a.size)} · {formatDay(a.uploadedAt)}{a.uploadedByStaff ? ' · by staff' : ''}
            </p>
            <div className="mt-1.5 flex gap-3 text-xs font-semibold">
              <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
              <a href={`${a.url}?download=1`} className="inline-flex items-center gap-1 text-navy-700 hover:underline">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AddAttachments({ complaint, limits, onUploaded }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const remaining = limits.maxFiles - complaint.attachments.length;
  const update = (id, patch) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  async function upload() {
    setBusy(true);
    const failed = await uploadAttachments(complaint.id, items, update);
    setBusy(false);
    if (failed) toast(`${failed} file(s) failed to upload. Use retry to try again.`, 'error');
    else {
      toast('Files uploaded', 'success');
      setItems([]);
      onUploaded();
    }
  }

  if (remaining <= 0) return <p className="text-xs text-slate-500">Maximum number of attachments reached.</p>;
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <FilePicker items={items} onChange={setItems} maxFiles={remaining} maxBytes={limits.maxFileBytes} disabled={busy} onRetry={() => upload()} />
      {items.some((i) => i.status !== 'done') && (
        <button onClick={upload} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          Upload {items.filter((i) => i.status !== 'done').length} file(s)
        </button>
      )}
    </div>
  );
}

function Conversation({ complaint, canPost, onPosted, placeholder }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function send(e) {
    e.preventDefault();
    const text = message.trim();
    if (text.length < LIMITS.message[0]) return setError('Write a message first.');
    setBusy(true);
    setError('');
    try {
      await api.post(`/complaints/${complaint.id}/responses`, { message: text });
      setMessage('');
      toast('Message sent', 'success');
      onPosted();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {complaint.responses.length === 0 ? (
        <p className="text-sm text-slate-500">No responses yet.</p>
      ) : (
        <ul className="space-y-3">
          {complaint.responses.map((r) => {
            const staff = r.author.role !== 'student';
            return (
              <li key={r.id} className={`rounded-xl border p-3.5 ${staff ? 'border-teal-100 bg-teal-50/50' : 'border-slate-100 bg-slate-50/70'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <p className="font-semibold text-navy-900">
                    {r.author.isMe ? 'You' : r.author.name}
                    <span className={`ml-2 rounded-full px-2 py-0.5 font-medium ${staff ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-700'}`}>
                      {roleLabel[r.author.role] ?? r.author.role}
                    </span>
                  </p>
                  <p className="text-slate-500">{dateTime(r.createdAt)}</p>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.message}</p>
              </li>
            );
          })}
        </ul>
      )}
      {canPost && (
        <form onSubmit={send} className="mt-4">
          <label htmlFor="followup" className="mb-1.5 block text-sm font-medium text-navy-900">{placeholder}</label>
          <textarea
            id="followup"
            rows={3}
            maxLength={LIMITS.message[1]}
            value={message}
            onChange={(e) => { setMessage(e.target.value); setError(''); }}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-100"
            placeholder="Type your message…"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className={`text-xs ${error ? 'font-medium text-red-600' : 'text-slate-400'}`}>{error || `${message.length}/${LIMITS.message[1]}`}</p>
            <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function Timeline({ history }) {
  return (
    <ol className="relative space-y-5 border-l-2 border-slate-100 pl-5">
      {history.map((h) => (
        <li key={h.id} className="relative">
          <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${statusDot(h.to)}`} />
          <p className="text-sm font-semibold text-navy-900">
            {h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}` : STATUS_LABEL[h.to]}
          </p>
          <p className="text-xs text-slate-500">
            {dateTime(h.at)}{h.by ? ` · ${h.by.name}` : ''}
          </p>
          {h.reason && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{h.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

function AttendanceSection({ complaint }) {
  const c = complaint;
  if (!c.attendanceDate && !c.session && !c.correction) return null;
  const decision = c.correction?.decision;
  return (
    <Card title="Attendance details" icon={CalendarDays}>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Attendance date</dt><dd className="font-medium text-navy-900">{c.attendanceDate ? formatDate(`${c.attendanceDate}T00:00:00`) : '—'}</dd></div>
        <div><dt className="text-slate-500">Class / subject</dt><dd className="font-medium text-navy-900">{c.session ? `${c.session.subject}${c.session.room ? ` · ${c.session.room}` : ''}` : '—'}</dd></div>
        <div><dt className="text-slate-500">Session time</dt><dd className="font-medium text-navy-900">{c.session ? `${formatTime(c.session.startsAt)} – ${formatTime(c.session.endsAt)}` : '—'}</dd></div>
        <div><dt className="text-slate-500">Status when reported</dt><dd className="font-medium text-navy-900">{ATTENDANCE_STATUS_LABEL[c.currentAttendanceStatus] ?? '—'}</dd></div>
        <div><dt className="text-slate-500">Requested correction</dt><dd className="font-medium text-navy-900">{ATTENDANCE_STATUS_LABEL[c.requestedCorrection] ?? 'None'}</dd></div>
        {c.session && (
          <div><dt className="text-slate-500">Current attendance record</dt><dd className="font-medium text-navy-900">{ATTENDANCE_STATUS_LABEL[c.session.currentRecord ?? 'not_recorded']}</dd></div>
        )}
      </dl>
      {c.correction && (
        <div
          className={`mt-4 flex gap-3 rounded-xl border p-3.5 text-sm ${
            decision === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : decision === 'rejected' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {decision === 'approved' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : decision === 'rejected' ? <XCircle className="h-5 w-5 shrink-0" /> : <ShieldCheck className="h-5 w-5 shrink-0" />}
          <div>
            <p className="font-semibold">
              {decision === 'pending'
                ? 'Correction pending staff verification'
                : decision === 'approved'
                  ? `Correction approved: ${ATTENDANCE_STATUS_LABEL[c.correction.originalStatus]} → ${ATTENDANCE_STATUS_LABEL[c.correction.approvedStatus]}`
                  : 'Correction rejected'}
            </p>
            {decision === 'pending' ? (
              <p className="text-xs">Attendance is only changed after an authorized staff member verifies the request.</p>
            ) : (
              <p className="text-xs">
                {c.correction.decidedBy} · {dateTime(c.correction.decidedAt)}
                {c.correction.reason ? ` — ${c.correction.reason}` : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Full complaint view shared by the student and staff detail pages.
 * `actions` renders extra cards at the top of the side column (staff tools, reopen).
 */
export default function ComplaintDetailView({ data, onReload, actions, viewer = 'student' }) {
  const { complaint: c, permissions, limits } = data;
  const s = c.studentSnapshot;
  // Students get the complaint itself (details, description, attachments and the
  // reopen action). Staff keep the working panels: responses, status, student
  // details and the status timeline.
  const isStudent = viewer === 'student';
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-teal-700">{c.complaintNumber}</p>
            <h1 className="mt-1 text-xl font-bold text-navy-900 sm:text-2xl">{c.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{c.categoryLabel} · Submitted {dateTime(c.createdAt)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!isStudent && <PriorityBadge priority={c.priority} />}
            <ComplaintStatusBadge status={c.status} size="lg" />
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 p-3.5 text-sm font-medium text-slate-700">{c.summary}</p>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{c.description || 'No description provided.'}</p>
        {c.resolutionNote && (
          <div className={`mt-4 rounded-xl border p-3.5 text-sm ${c.status === 'rejected' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">{c.status === 'rejected' ? 'Rejection reason' : 'Resolution'}</p>
            <p className="mt-1 whitespace-pre-line">{c.resolutionNote}</p>
          </div>
        )}
      </section>

      {isStudent && actions && <div className="space-y-6">{actions}</div>}

      <div className={isStudent ? 'space-y-6' : 'grid gap-6 lg:grid-cols-3'}>
        <div className={isStudent ? 'space-y-6' : 'space-y-6 lg:col-span-2'}>
          <AttendanceSection complaint={c} />

          <Card title={`Attachments (${c.attachments.length})`} icon={Paperclip}>
            <Attachments complaint={c} />
            {permissions.canUpload && <AddAttachments complaint={c} limits={limits} onUploaded={onReload} />}
          </Card>

          {!isStudent && (
            <Card title="Responses & follow-ups" icon={MessageSquare}>
              <Conversation
                complaint={c}
                canPost={permissions.canFollowUp || viewer === 'staff'}
                onPosted={onReload}
                placeholder={viewer === 'staff' ? 'Reply to the student' : 'Add a follow-up message'}
              />
              {viewer === 'student' && !permissions.canFollowUp && (
                <p className="mt-3 text-xs text-slate-500">This complaint is closed, so follow-up messages are disabled.</p>
              )}
            </Card>
          )}
        </div>

        {!isStudent && (
          <div className="space-y-6">
            {actions}

            <Card title="Status" icon={ClipboardList}>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Current status</dt><dd><ComplaintStatusBadge status={c.status} /></dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Assigned to</dt><dd className="text-right font-medium text-navy-900">{c.assignedTo ? c.assignedTo.name : 'Awaiting assignment'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Submitted</dt><dd className="text-right font-medium text-navy-900">{dateTime(c.createdAt)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Last updated</dt><dd className="text-right font-medium text-navy-900">{dateTime(c.updatedAt)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Resolved</dt><dd className="text-right font-medium text-navy-900">{c.resolvedAt ? dateTime(c.resolvedAt) : '—'}</dd></div>
              </dl>
            </Card>

            <Card title="Student details (as submitted)" icon={UserRound}>
              <dl className="space-y-2 text-sm">
                {[
                  ['Name', s.fullName],
                  ['Enrollment No.', s.enrollmentNumber],
                  ['Student ID', s.studentId],
                  ['Class', `${s.course} · Sem ${s.semester} · Group ${s.group}`],
                  ['Email', s.email],
                  ['Mobile', s.mobile || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="break-all text-right font-medium text-navy-900">{v}</dd></div>
                ))}
              </dl>
            </Card>

            <Card title="Status timeline" icon={History}>
              <Timeline history={c.history} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
