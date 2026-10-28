import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2, Megaphone, X } from 'lucide-react';
import { api } from '@shared/lib/api.js';
import { useApi } from '@shared/lib/useApi.js';
import { formatDate, formatTime } from '@shared/lib/format.js';

const POLL_MS = 30_000;

/**
 * Notification bell: regular per-user notifications plus published global notices.
 * Clicking a notice title just marks it read (no popup); global notices can be
 * dismissed from this student's list only via the row's dismiss button.
 */
export default function NotificationBell({ tone = 'light' }) {
  // `api` baseURL is "/api", so these resolve to /api/student/notices.
  const { data, loading, error, reload, setData } = useApi('/student/notices');
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const ref = useRef(null);

  // Background refresh so a newly published notice shows up without a reload.
  useEffect(() => {
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const patchItem = (id, patch) =>
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((n) => (n.id === id ? { ...n, ...patch } : n)) } : prev,
    );

  /** Marks the clicked item read — no popup, the list stays open. */
  async function openItem(n) {
    if (n.read) return;
    setBusyId(n.id);
    try {
      await api.post(`/student/notices/${n.id}/read`, { read: true });
      patchItem(n.id, { read: true });
    } catch (_) {
      // Non-fatal; the badge refreshes on the next poll.
    } finally {
      setBusyId(null);
    }
  }

  async function dismissItem(n) {
    setBusyId(n.id);
    try {
      await api.post(`/student/notices/${n.id}/dismiss`);
      setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.id !== n.id) } : prev));
    } catch (_) {
      reload();
    } finally {
      setBusyId(null);
    }
  }

  async function markAll() {
    setBusyId(-1);
    try {
      await api.post('/student/notices/read-all');
      setData((prev) =>
        prev
          ? { ...prev, unread: 0, regularUnread: 0, globalUnread: 0, items: prev.items.map((n) => ({ ...n, read: true })) }
          : prev,
      );
    } catch (_) {
      reload();
    } finally {
      setBusyId(null);
    }
  }

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];
  const btnCls = tone === 'dark' ? 'text-navy-100 hover:bg-white/10' : 'text-navy-800 hover:bg-slate-100';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) reload();
        }}
        className={`relative rounded-lg p-2 transition ${btnCls}`}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-navy-900">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAll}
                disabled={busyId === -1}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline disabled:opacity-60"
              >
                {busyId === -1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && !data ? (
              <div className="grid place-items-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              </div>
            ) : error ? (
              <p className="px-4 py-6 text-center text-sm text-red-700">{error}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={`${n.kind}-${n.id}`} className="group/item flex items-start gap-1">
                    <button
                      onClick={() => openItem(n)}
                      className={`min-w-0 flex-1 px-4 py-3 text-left transition hover:bg-slate-50 ${n.read ? '' : 'bg-teal-50/40'}`}
                    >
                      <p className="flex items-start gap-2 text-sm font-semibold text-navy-900">
                        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" aria-label="Unread" />}
                        <span className="min-w-0 flex-1">
                          {n.title}
                          {n.kind === 'notice' && (
                            <span className="ml-1.5 inline-flex items-center align-middle rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                              <Megaphone className="mr-0.5 h-2.5 w-2.5" />
                              Notice
                            </span>
                          )}
                        </span>
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.message}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDate(n.publishedAt || n.createdAt)} · {formatTime(n.publishedAt || n.createdAt)}
                      </p>
                    </button>

                    {n.dismissible && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissItem(n);
                        }}
                        disabled={busyId === n.id}
                        aria-label="Dismiss notice"
                        className="mt-3 mr-2 shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover/item:opacity-100 disabled:opacity-40"
                      >
                        {busyId === n.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
