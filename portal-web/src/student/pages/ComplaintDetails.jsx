import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@/student/components/common.jsx';
import ComplaintDetailView from '@shared/components/ComplaintDetailView.jsx';
import { Modal } from '@shared/components/Modal.jsx';
import { api, parseApiError } from '@shared/lib/api.js';
import { useApi } from '@shared/lib/useApi.js';
import { useToast } from '../../shared/context/ToastContext.jsx';
import { formatDate } from '@shared/lib/format.js';
import { LIMITS } from '@shared/lib/complaints.js';

function ReopenCard({ complaint, deadline, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function reopen() {
    if (reason.trim().length < LIMITS.reason[0]) return setError(`Give a reason of at least ${LIMITS.reason[0]} characters.`);
    setBusy(true);
    try {
      const { data } = await api.post(`/complaints/${complaint.id}/reopen`, { reason: reason.trim() });
      toast(data.message, 'success');
      setOpen(false);
      onDone();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="text-sm font-semibold text-navy-900">Not satisfied with the resolution?</p>
      <p className="mt-1 text-xs text-slate-500">You can reopen this complaint once, until {formatDate(deadline)}. It will go back to staff for review.</p>
      <button onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50">
        <RotateCcw className="h-4 w-4" /> Reopen complaint
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title="Reopen complaint"
        size="sm"
        footer={
          <>
            <button onClick={() => setOpen(false)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={reopen} disabled={busy} className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60">
              {busy ? 'Reopening…' : 'Reopen'}
            </button>
          </>
        }
      >
        <label htmlFor="reopen-reason" className="mb-1.5 block text-sm font-medium text-navy-900">Why are you reopening it?<span className="text-red-500">*</span></label>
        <textarea
          id="reopen-reason"
          rows={4}
          maxLength={LIMITS.reason[1]}
          value={reason}
          onChange={(e) => { setReason(e.target.value); setError(''); }}
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-100"
        />
        {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
      </Modal>
    </Card>
  );
}

export default function ComplaintDetails() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/complaints/${encodeURIComponent(id)}`);

  return (
    <div className="animate-fade-up">
      <Link to="/student/complaints" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-teal-700">
        <ArrowLeft className="h-4 w-4" /> Back to My Complaints
      </Link>
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <div className="space-y-6"><Skeleton className="h-48 rounded-2xl" /><div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-72 rounded-2xl lg:col-span-2" /><Skeleton className="h-72 rounded-2xl" /></div></div>
      ) : (
        <ComplaintDetailView
          data={data}
          onReload={reload}
          viewer="student"
          actions={data.permissions.canReopen && <ReopenCard complaint={data.complaint} deadline={data.permissions.reopenDeadline} onDone={reload} />}
        />
      )}
      {loading && data && <span className="sr-only">Refreshing…</span>}
    </div>
  );
}
