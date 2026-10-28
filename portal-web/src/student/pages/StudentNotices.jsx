import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Loader2,
  Megaphone,
  RefreshCw,
  X,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { useApi } from '@shared/lib/useApi.js';
import { formatDate, formatTime } from '@shared/lib/format.js';
import { useStudent } from '@student/components/StudentLayout.jsx';

/** Student notice centre: read announcements, toggle read/unread, dismiss from own list. */
export default function StudentNotices() {
  const { data, loading, error, reload, setData } = useApi('/student/notices');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [openNotice, setOpenNotice] = useState(null);
  const navigate = useNavigate();
  const { profile } = useStudent?.() ?? {};

  const items = data?.items ?? [];

  // Optimistic local update helper: patches one item inside the cached list.
  const patchItem = useCallback((id, patch) => {
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((n) => (n.id === id ? { ...n, ...patch } : n)) } : prev,
    );
  }, [setData]);

  /** Opens a notice: shows the full text and marks it read in one go. */
  async function openItem(item) {
    setOpenNotice(item);
    if (item.read) return;
    setBusyId(item.id);
    try {
      await api.post(`/student/notices/${item.id}/read`, { read: true });
      patchItem(item.id, { read: true });
    } catch (_) {
      // Non-fatal: the notice is already open; badge refreshes on next poll.
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRead(item) {
    setBusyId(item.id);
    setActionError('');
    const next = !item.read;
    patchItem(item.id, { read: next }); // optimistic
    try {
      await api.post(`/student/notices/${item.id}/read`, { read: next });
      if (openNotice?.id === item.id) setOpenNotice((o) => (o ? { ...o, read: next } : o));
    } catch (err) {
      patchItem(item.id, { read: !next }); // rollback
      setActionError(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(item) {
    setBusyId(item.id);
    setActionError('');
    try {
      await api.post(`/student/notices/${item.id}/dismiss`);
      setOpenNotice((o) => (o?.id === item.id ? null : o));
      setData((prev) =>
        prev ? { ...prev, items: prev.items.filter((n) => n.id !== item.id) } : prev,
      );
      reload();
    } catch (err) {
      setActionError(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setBusyId(-1);
    setActionError('');
    try {
      await api.post('/student/notices/read-all');
      setData((prev) =>
        prev ? { ...prev, unread: 0, regularUnread: 0, globalUnread: 0, items: prev.items.map((n) => ({ ...n, read: true })) } : prev,
      );
    } catch (err) {
      setActionError(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  const unread = data?.unread ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Notices</h2>
            {unread > 0 && (
              <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white">
                {unread} unread
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Announcements and updates sent to every student.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              onClick={markAllRead}
              disabled={busyId === -1}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
            >
              {busyId === -1 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Mark all read
            </button>
          )}
          <button
            onClick={reload}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-xs">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{actionError}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={reload} className="text-xs font-bold underline">
            Retry
          </button>
        </div>
      )}

      {/* List */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading && !data ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Bell className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No notices yet</p>
            <p className="mt-1 text-xs text-slate-500">
              New announcements from the administration will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li
                key={`${n.kind}-${n.id}`}
                className={`p-5 transition hover:bg-slate-50/60 ${n.read ? '' : 'bg-blue-50/40'}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button onClick={() => openItem(n)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
                      )}
                      <h4 className="text-sm font-bold text-slate-900">{n.title}</h4>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          n.kind === 'notice'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {n.kind === 'notice' ? 'Notice' : 'Update'}
                      </span>
                    </div>

                    <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                      {n.message}
                    </p>

                    <p className="mt-2 text-[11px] text-slate-400">
                      {formatDate(n.publishedAt || n.createdAt)}, {formatTime(n.publishedAt || n.createdAt)}
                    </p>
                  </button>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      onClick={() => toggleRead(n)}
                      disabled={busyId === n.id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      {busyId === n.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : n.read ? (
                        <>
                          <BellOff className="h-3.5 w-3.5" /> Mark unread
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" /> Mark read
                        </>
                      )}
                    </button>

                    {n.dismissible && (
                      <button
                        onClick={() => dismiss(n)}
                        disabled={busyId === n.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-xs transition hover:bg-rose-50 disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" /> Dismiss
                      </button>
                    )}

                    {n.link && (
                      <button
                        onClick={() => navigate(n.link)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Detail modal — full notice text */}
      {openNotice && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setOpenNotice(null)}
          />
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <div
              className="relative w-full max-w-lg transform overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl sm:my-8"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={openNotice.title}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    <Megaphone className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{openNotice.title}</h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatDate(openNotice.publishedAt || openNotice.createdAt)},{' '}
                      {formatTime(openNotice.publishedAt || openNotice.createdAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpenNotice(null)}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-6">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{openNotice.message}</p>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                <button
                  onClick={() => toggleRead(openNotice)}
                  disabled={busyId === openNotice.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {openNotice.read ? 'Mark unread' : 'Mark read'}
                </button>
                {openNotice.dismissible && (
                  <button
                    onClick={() => dismiss(openNotice)}
                    disabled={busyId === openNotice.id}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:opacity-60"
                  >
                    Dismiss
                  </button>
                )}
                <button
                  onClick={() => setOpenNotice(null)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Greeting context */}
      {profile?.fullName && <p className="sr-only">Showing notices for {profile.fullName}</p>}
    </div>
  );
}
