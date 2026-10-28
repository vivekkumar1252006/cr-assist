import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { formatDate, formatTime } from '@shared/lib/format.js';
import { Modal } from '../components/Modal.jsx';

const EMPTY_FORM = { id: null, title: '', description: '' };

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50';

/**
 * Manage Notices — admin creates global notices and publishes them to every student by
 * in-app notification and email.
 * Drafts stay private until published; publishing delivers them to all student accounts.
 */
export default function ManageNotices() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Create / Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/notices', { params: { limit: 100 } });
      setNotices(res.data?.notices || []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-hide the success banner.
  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(t);
  }, [success]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(notice) {
    setForm({ id: notice.id, title: notice.title, description: notice.description });
    setFormErrors({});
    setFormError('');
    setFormOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!form.title.trim()) errors.title = 'Notice title is required.';
    if (!form.description.trim()) errors.description = 'Notice description is required.';
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const payload = { title: form.title.trim(), description: form.description.trim() };
      if (form.id) {
        await api.put(`/admin/notices/${form.id}`, payload);
        setSuccess('Notice updated successfully.');
      } else {
        await api.post('/admin/notices', payload);
        setSuccess('Notice saved as a draft. Publish it to send it to every student by email and notification.');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      const parsed = parseApiError(err);
      setFormError(parsed.message);
      setFormErrors(parsed.errors || {});
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublish(notice) {
    setBusyId(notice.id);
    setError('');
    try {
      // Publishing also emails every student, so allow more than the default 15 s.
      const res = await api.put(
        `/admin/notices/${notice.id}/publish`,
        { is_published: !notice.isPublished },
        { timeout: 120000 },
      );
      const message =
        res.data?.message || (notice.isPublished ? 'Notice unpublished.' : 'Notice published to all students.');
      // Publishing still succeeds when SMTP fails; surface delivery problems as a warning.
      if (res.data?.email?.status === 'failed' || res.data?.email?.status === 'partial') setError(message);
      else setSuccess(message);
      load();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/admin/notices/${deleteTarget.id}`);
      setSuccess('Notice deleted permanently.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(parseApiError(err).message);
    } finally {
      setDeleting(false);
    }
  }

  const publishedCount = notices.filter((n) => n.isPublished).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Manage Notices</h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              Broadcast
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Create announcements and publish them to every student&apos;s notification bell and email inbox.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Create Notice
          </button>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="font-medium">{success}</span>
          </div>
          <button onClick={() => setSuccess('')} className="text-xs font-bold text-emerald-700 underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={load} className="text-xs font-bold underline">
            Retry
          </button>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total notices</p>
              <p className="text-xl font-extrabold text-slate-900">{notices.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Published</p>
              <p className="text-xl font-extrabold text-slate-900">{publishedCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <EyeOff className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Drafts</p>
              <p className="text-xl font-extrabold text-slate-900">{notices.length - publishedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notices list */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading && !notices.length ? (
          <div className="py-16 text-center text-sm text-slate-500">Loading notices...</div>
        ) : notices.length === 0 ? (
          <div className="py-16 text-center">
            <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No notices yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Click &quot;Create Notice&quot; to write your first announcement for students.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notices.map((notice) => (
              <li key={notice.id} className="p-5 transition hover:bg-slate-50/60">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{notice.title}</h4>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          notice.isPublished
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {notice.isPublished ? (
                          <>
                            <Send className="h-3 w-3" /> Published
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3" /> Draft
                          </>
                        )}
                      </span>
                    </div>

                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                      {notice.description.length > 220
                        ? `${notice.description.slice(0, 220)}…`
                        : notice.description}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        Created {formatDate(notice.createdAt)}, {formatTime(notice.createdAt)}
                      </span>
                      {notice.isPublished && notice.publishedAt && (
                        <span className="font-semibold text-emerald-700">
                          Sent {formatDate(notice.publishedAt)}, {formatTime(notice.publishedAt)}
                        </span>
                      )}
                      {notice.isPublished && (
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                          <Users className="h-3 w-3" />
                          {notice.readCount}/{notice.recipientCount} read
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      onClick={() => togglePublish(notice)}
                      disabled={busyId === notice.id}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-xs transition disabled:opacity-60 ${
                        notice.isPublished
                          ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {notice.isPublished ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5" /> Unpublish
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" /> Publish
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(notice)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-xs transition hover:bg-blue-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => {
                        setDeleteTarget(notice);
                        setDeleteError('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-xs transition hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------ Create / Edit modal ------------------------------ */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'Edit Notice' : 'Create Notice'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle className="h-4.5 w-4.5 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label htmlFor="notice-title" className="mb-1.5 block text-xs font-bold text-slate-700">
              Notice Title
            </label>
            <input
              id="notice-title"
              type="text"
              className={inputClass}
              placeholder="e.g. Mid-Semester Exam Schedule Released"
              value={form.title}
              maxLength={150}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
            {formErrors.title ? (
              <p className="mt-1 text-xs font-semibold text-rose-600">{formErrors.title}</p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">{form.title.length}/150 characters</p>
            )}
          </div>

          <div>
            <label htmlFor="notice-description" className="mb-1.5 block text-xs font-bold text-slate-700">
              Notice Description
            </label>
            <textarea
              id="notice-description"
              rows={6}
              className={`${inputClass} resize-y`}
              placeholder="Write the full announcement. Every student will see this when they open the notice."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            {formErrors.description && (
              <p className="mt-1 text-xs font-semibold text-rose-600">{formErrors.description}</p>
            )}
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p className="text-xs leading-5 text-blue-800">
              Saving keeps the notice as a <strong>draft</strong>. Use the <strong>Publish</strong> button
              in the list to send it to every student&apos;s notification bell and registered email address.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BellRing className="h-3.5 w-3.5" />
              )}
              {form.id ? 'Save Changes' : 'Save Draft'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------ Delete confirmation ------------------------------ */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Notice"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="text-sm text-rose-800">
              <p className="font-bold">This permanently removes the notice.</p>
              <p className="mt-1 text-xs leading-5">
                It will disappear from every student&apos;s notification list. This cannot be undone.
              </p>
            </div>
          </div>

          {deleteTarget && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Notice</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{deleteTarget.title}</p>
            </div>
          )}

          {deleteError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {deleteError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:opacity-60"
            >
              {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>

      {/* Screen-reader live region */}
      <div className="sr-only" role="status" aria-live="polite">
        {success || error}
      </div>
      <X className="hidden" aria-hidden="true" />
    </div>
  );
}
