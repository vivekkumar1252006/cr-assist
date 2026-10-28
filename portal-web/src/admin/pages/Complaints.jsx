import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  X as XIcon,
  Paperclip,
  FileCheck,
  Download,
  Trash2,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { formatBytes } from '@shared/lib/complaints.js';
import { ComplaintStatusBadge } from '../components/Badge.jsx';
import { Modal } from '../components/Modal.jsx';
import { AttachmentPreview, attachmentUrl, previewKind } from '../components/AttachmentPreview.jsx';

// ---------------------------------------------------------------------------
// Manage Complaint Types — the database-backed "Complaint type" dropdown that
// students see in the complaint form (complaint_types table, migration 014).
// Adding, renaming or deleting here reflects on the student form immediately.
// ---------------------------------------------------------------------------
function TypeRow({ type, index, busy, editingId, editingValue, setEditingId, setEditingValue, onSaveEdit, onDelete, onError }) {
  const isEditing = editingId === type.id;

  async function saveEdit() {
    const label = editingValue.trim();
    if (!label) return onError('Type name cannot be empty.');
    await onSaveEdit(type, label);
  }

  if (isEditing) {
    return (
      <li className="flex items-center gap-2 py-2">
        <span className="w-6 text-right text-[11px] font-semibold text-slate-400">{index + 1}.</span>
        <input
          autoFocus
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
            else if (e.key === 'Escape') { setEditingId(null); setEditingValue(''); }
          }}
          className="min-w-0 flex-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={saveEdit}
          disabled={busy}
          title="Save"
          className="rounded-lg bg-blue-600 p-1.5 text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => { setEditingId(null); setEditingValue(''); }}
          title="Cancel"
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-2">
      <span className="w-6 text-right text-[11px] font-semibold text-slate-400">{index + 1}.</span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">{type.label}</span>
      <button
        type="button"
        onClick={() => { setEditingId(type.id); setEditingValue(type.label); }}
        disabled={busy || editingId !== null}
        title="Edit"
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(type)}
        disabled={busy || editingId !== null}
        title="Delete"
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function ManageTypesCard() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');

  async function loadTypes() {
    setError('');
    try {
      const { data } = await api.get('/complaints/types');
      setTypes(Array.isArray(data.types) ? data.types : []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTypes();
  }, []);

  async function addAction(event) {
    event.preventDefault();
    const label = draft.trim();
    if (!label) {
      setPanelError('Enter a complaint type name first.');
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      await api.post('/complaints/types', { label });
      setDraft('');
      loadTypes();
    } catch (err) {
      setPanelError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(type, label) {
    setBusy(true);
    setPanelError('');
    try {
      await api.put(`/complaints/types/${type.id}`, { label });
      setEditingId(null);
      setEditingValue('');
      loadTypes();
    } catch (err) {
      setPanelError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAction(type) {
    if (!window.confirm(`Delete "${type.label}" from complaint types? Past complaints keep their original category.`)) return;
    setBusy(true);
    setPanelError('');
    try {
      await api.delete(`/complaints/types/${type.id}`);
      loadTypes();
    } catch (err) {
      setPanelError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const lockActions = busy || editingId !== null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <ListChecks className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-bold text-slate-900">Manage Complaint Types</h3>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
          {loading ? '—' : types.length}
        </span>
        <button
          onClick={loadTypes}
          disabled={loading}
          className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Reload
        </button>
      </div>

      <p className="px-5 pt-3 text-xs text-slate-500">
        Choices in the student complaint form's "Complaint type" dropdown. Add, rename, or remove them
        here — saved in the database and shown to students automatically.
      </p>

      {error && (
        <div className="mx-5 mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{String(error)}</div>
      )}

      <div className="p-5">
        <ol className="divide-y divide-slate-50 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-1">
          {types.map((type, index) => (
            <TypeRow
              key={type.id}
              type={type}
              index={index}
              busy={busy}
              editingId={editingId}
              editingValue={editingValue}
              setEditingId={setEditingId}
              setEditingValue={setEditingValue}
              onSaveEdit={saveEdit}
              onDelete={deleteAction}
            />
          ))}
          {!loading && !types.length && (
            <li className="py-2 text-xs text-slate-400">No complaint types yet — add one below.</li>
          )}
        </ol>

        <form onSubmit={addAction} className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Library Book Not Issued"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={busy || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </form>

        {panelError && <p className="mt-2 text-xs font-medium text-red-600">{panelError}</p>}
      </div>

      <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
        Deleting a type never removes complaints already submitted — they keep their original category.
      </p>
    </section>
  );
}

export function Complaints() {
  const [complaints, setComplaints] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Selected complaint detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [complaintDetails, setComplaintDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // Row-level and modal-level Approve / Reject feedback.
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [modalBusy, setModalBusy] = useState('');
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (search) params.q = search;
      if (categoryFilter) params.category = categoryFilter;
      if (priorityFilter) params.priority = priorityFilter;

      const res = await api.get('/admin/complaints', { params });
      setComplaints(res.data.complaints || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [page, categoryFilter, priorityFilter]);

  const openComplaint = async (complaint) => {
    setSelectedComplaint(complaint);
    setDetailModalOpen(true);
    setDetailLoading(true);
    setModalError('');
    setPreviewAttachment(null);
    try {
      const res = await api.get(`/admin/complaints/${complaint.id}`);
      setComplaintDetails(res.data);
    } catch (err) {
      alert(parseApiError(err).message);
    } finally {
      setDetailLoading(false);
    }
  };

  // Row action: Approve stores "resolved", Reject stores "rejected". The badge
  // flips immediately, the PATCH persists it (the server also notifies the
  // student), and a failed request rolls the row back to its previous status.
  const changeStatus = async (complaint, status) => {
    if (busyId || complaint.status === status) return;
    const previousStatus = complaint.status;
    setBusyId(complaint.id);
    setBusyAction(status);
    setNotice('');
    setActionError('');
    setComplaints((current) => current.map((c) => (c.id === complaint.id ? { ...c, status } : c)));

    try {
      await api.patch(`/admin/complaints/${complaint.id}/status`, {
        status,
        reason: status === 'resolved' ? 'Approved from the complaints list.' : 'Rejected from the complaints list.',
      });
      const label = status === 'resolved' ? 'Approved' : 'Rejected';
      setNotice(
        `${complaint.complaint_number || `Ticket #${complaint.id}`} marked ${label}. The student portal now shows this status.`,
      );
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setComplaints((current) => current.map((c) => (c.id === complaint.id ? { ...c, status: previousStatus } : c)));
      setActionError(parseApiError(err).message);
    } finally {
      setBusyId(null);
      setBusyAction('');
    }
  };

  // Modal action: same two outcomes as the row buttons. Approving an attendance
  // grievance also applies the requested correction, so the old "Approve
  // Correction Now" button is no longer needed.
  const handleModalDecision = async (status) => {
    if (!selectedComplaint || modalBusy) return;
    setModalBusy(status);
    setModalError('');
    try {
      if (status === 'resolved' && complaintDetails?.correction?.decision === 'pending') {
        const { session_id, student_user_id, requested_status } = complaintDetails.correction;
        await api.post('/admin/attendance/records/correct', {
          sessionId: session_id,
          studentId: student_user_id,
          status: requested_status,
          reason: `Approved attendance grievance ticket ${complaintDetails.complaint.complaint_number}`,
        });
      }

      await api.patch(`/admin/complaints/${selectedComplaint.id}/status`, {
        status,
        reason: status === 'resolved' ? 'Approved from the complaint details.' : 'Rejected from the complaint details.',
      });

      const res = await api.get(`/admin/complaints/${selectedComplaint.id}`);
      setComplaintDetails(res.data);
      setSelectedComplaint((current) => (current ? { ...current, status } : current));
      setComplaints((current) => current.map((c) => (c.id === selectedComplaint.id ? { ...c, status } : c)));

      const label = status === 'resolved' ? 'Approved' : 'Rejected';
      setNotice(
        `${selectedComplaint.complaint_number || `Ticket #${selectedComplaint.id}`} marked ${label}. The student portal now shows this status.`,
      );
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setModalError(parseApiError(err).message);
    } finally {
      setModalBusy('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Student Grievances & Complaints</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Resolve attendance discrepancies, QR scanner issues, and student support requests
          </p>
        </div>
      </div>

      {/* Manage Complaint Types — feeds the student form dropdown directly */}
      <ManageTypesCard />

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchComplaints()}
            placeholder="Search by ticket no, student name, or enrollment..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white"
        >
          <option value="">All Categories</option>
          <option value="attendance_marked_absent">Marked Absent Incorrectly</option>
          <option value="qr_not_scanning">QR Scanner Problem</option>
          <option value="attendance_not_recorded">Attendance Not Recorded</option>
          <option value="wrong_attendance_percentage">Wrong Percentage</option>
          <option value="technical_problem">Technical / App Issue</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white"
        >
          <option value="">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
      </div>

      {(notice || actionError) && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-4 text-sm ${
            actionError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {actionError ? (
            <AlertCircle className="h-4 w-4 text-rose-600" />
          ) : (
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          )}
          <span>{actionError || notice}</span>
        </div>
      )}

      {/* Complaints Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Ticket ID</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Loading grievance tickets...
                  </td>
                </tr>
              ) : complaints.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    No complaints matching criteria.
                  </td>
                </tr>
              ) : (
                complaints.map((c) => {
                  const rowBusy = busyId === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-blue-600 text-xs">{c.complaint_number || `CMP-${c.id}`}</span>
                          {c.lecture_number && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              Lec {c.lecture_number}
                            </span>
                          )}
                          {c.lecture_time && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                              {c.lecture_time}
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-slate-900 mt-0.5 line-clamp-1 max-w-xs">{c.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{new Date(c.created_at).toLocaleDateString()}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{c.student_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{c.enrollment_number}</div>
                        <div className="text-[10px] text-slate-500">{c.course} Sem {c.semester}</div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 capitalize">
                        {c.type_label || c.category?.replace(/_/g, ' ')}
                      </td>

                      <td className="py-3.5 px-4">
                        <ComplaintStatusBadge status={c.status} />
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openComplaint(c)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => changeStatus(c, 'resolved')}
                            disabled={busyId !== null || c.status === 'resolved'}
                            title={c.status === 'resolved' ? 'Already approved' : 'Approve this complaint'}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {rowBusy && busyAction === 'resolved' ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => changeStatus(c, 'rejected')}
                            disabled={busyId !== null || c.status === 'rejected'}
                            title={c.status === 'rejected' ? 'Already rejected' : 'Reject this complaint'}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-xs transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {rowBusy && busyAction === 'rejected' ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* DETAILED COMPLAINT REVIEW MODAL                                        */}
      {/* ====================================================================== */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => {
          // While the evidence preview is open, Escape/backdrop must close only the preview.
          if (previewAttachment) return;
          setDetailModalOpen(false);
        }}
        title={complaintDetails ? `${complaintDetails.complaint.complaint_number} · ${complaintDetails.complaint.title}` : 'Review Ticket'}
        maxWidth="max-w-4xl"
      >
        {detailLoading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Loading complaint details...</div>
        ) : complaintDetails ? (
          <div className="space-y-6 text-xs">
            {/* Complaint meta: when it was submitted and where it stands */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-slate-500">
                Submitted{' '}
                <span className="font-semibold text-slate-800">
                  {new Date(complaintDetails.complaint.created_at).toLocaleString([], {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </p>
              <ComplaintStatusBadge status={complaintDetails.complaint.status} />
            </div>

            {/* Attendance Correction Card if relevant */}
            {complaintDetails.correction && (
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="font-bold text-amber-900 text-sm flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-amber-600" />
                  Attendance Correction Requested
                </div>
                <div className="text-amber-800">
                  Subject: <strong>{complaintDetails.correction.subject}</strong> · Session Date:{' '}
                  <strong>{new Date(complaintDetails.correction.starts_at).toLocaleDateString()}</strong> · Current Status:{' '}
                  <span className="uppercase font-bold text-rose-700">{complaintDetails.correction.original_status}</span> → Requested:{' '}
                  <span className="uppercase font-bold text-emerald-700">{complaintDetails.correction.requested_status}</span>
                </div>
                <p className="text-amber-700">
                  Correction: <span className="font-bold capitalize">{complaintDetails.correction.decision}</span>
                  {complaintDetails.correction.decision === 'pending' && ' — approving this complaint also applies it.'}
                </p>
              </div>
            )}

            {/* Detailed Description */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
              <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Description by Student</h5>
              <p className="text-slate-700 leading-relaxed font-normal whitespace-pre-wrap">
                {complaintDetails.complaint.description || 'No description provided.'}
              </p>
            </div>

            {/* Attachments — click a previewable file to view it in-portal; everything can be
                downloaded (the server names it Student_Enrollment_Original.ext). */}
            {complaintDetails.attachments?.length > 0 && (
              <div className="space-y-2">
                <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Uploaded Evidence ({complaintDetails.attachments.length})
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {complaintDetails.attachments.map((att) => {
                    const kind = previewKind(att.mime_type);
                    const href = `${attachmentUrl(complaintDetails.complaint.id, att.id)}?download=1`;
                    return (
                      <div
                        key={att.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-2"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <Paperclip className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
                          <div className="min-w-0">
                            {kind ? (
                              <button
                                type="button"
                                onClick={() => setPreviewAttachment(att)}
                                title={`Preview ${att.original_filename}`}
                                className="block max-w-full truncate text-left font-semibold text-slate-700 hover:text-blue-700 hover:underline"
                              >
                                {att.original_filename}
                              </button>
                            ) : (
                              <div className="truncate font-semibold text-slate-700">{att.original_filename}</div>
                            )}
                            <div className="text-[10px] text-slate-400">
                              {formatBytes(Number(att.file_size) || 0)}
                              {kind === 'pdf' && ' · PDF'}
                              {kind === 'image' && ' · Image'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {kind && (
                            <button
                              type="button"
                              onClick={() => setPreviewAttachment(att)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs transition hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Eye className="h-3 w-3" /> Preview
                            </button>
                          )}
                          <a
                            href={href}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs transition hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Download className="h-3 w-3" /> Download
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Only Approve / Reject remain — both persist and reach the student portal */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              {modalError && <p className="mr-auto text-xs font-medium text-rose-600">{modalError}</p>}
              <button
                type="button"
                onClick={() => handleModalDecision('resolved')}
                disabled={Boolean(modalBusy) || complaintDetails.complaint.status === 'resolved'}
                title={complaintDetails.complaint.status === 'resolved' ? 'Already approved' : 'Approve this complaint'}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {modalBusy === 'resolved' ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleModalDecision('rejected')}
                disabled={Boolean(modalBusy) || complaintDetails.complaint.status === 'rejected'}
                title={complaintDetails.complaint.status === 'rejected' ? 'Already rejected' : 'Reject this complaint'}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 shadow-xs transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {modalBusy === 'rejected' ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                Reject
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* In-portal evidence viewer (images inline, PDFs/text in an embedded frame) */}
      {previewAttachment && complaintDetails && (
        <AttachmentPreview
          attachment={previewAttachment}
          complaintId={complaintDetails.complaint.id}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}

export default Complaints;
