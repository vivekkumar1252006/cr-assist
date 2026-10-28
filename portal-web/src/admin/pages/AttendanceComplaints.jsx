import React, { useEffect, useState } from 'react';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  Download,
  Loader2,
  Save,
  Filter,
  ListChecks,
  ListOrdered,
  Pencil,
  Plus,
  Trash2,
  X,
  Eye,
  Check,
  XCircle,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { Modal } from '../components/Modal.jsx';

const PAGE_SIZE = 20;

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const EMPTY_FILTERS = { date: '', enrollment: '', department: '' };

// The three department codes the panel filters on, mapped to course codes in SQL.
const DEPARTMENTS = [
  { value: 'CS', label: 'CS (CSE)' },
  { value: 'IT', label: 'IT' },
  { value: 'EC', label: 'EC (ECE)' },
];

const hasAnyFilter = (filters) => Boolean(filters.date || filters.enrollment.trim() || filters.department);

function formatSubmittedAt(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Date-only display, e.g. "27 Oct 2026". Parsing with T00:00 keeps the calendar day stable in every timezone. */
function formatDateOnly(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
    icon: CheckCircle2,
  },
  // Legacy value from before the Approve/Reject buttons — same outcome as approved.
  resolved: {
    label: 'Approved',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
    icon: CheckCircle2,
  },
  in_review: {
    label: 'In Review',
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20',
    icon: RefreshCw,
  },
  rejected: {
    label: 'Rejected',
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
    icon: AlertCircle,
  },
};

// ---------------------------------------------------------------------------
// Complaint Form Options — manage the Lecture Time / Lecture Number dropdowns
// that students see in the attendance complaint form. Options live in the
// complaint_options table (see database/migrations/012_complaint_dropdown_options.sql).
// ---------------------------------------------------------------------------
function OptionsPanel({ type, title, Icon, isLectureNumber, options, loading, onChanged }) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');

  const displayLabel = (label) => (isLectureNumber ? `Lecture ${label}` : label);
  const placeholder = isLectureNumber ? 'e.g. 5/7' : 'e.g. 09:00 AM – 10:00 AM';

  async function addAction(event) {
    event.preventDefault();
    const label = draft.trim();
    if (!label) {
      setPanelError('Enter an option first.');
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      await api.post('/admin/complaint-options', { optionType: type, label });
      setDraft('');
      onChanged();
    } catch (err) {
      setPanelError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(option) {
    const label = editingValue.trim();
    if (!label) {
      setPanelError('Option text cannot be empty.');
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      await api.put(`/admin/complaint-options/${option.id}`, { label });
      setEditingId(null);
      setEditingValue('');
      onChanged();
    } catch (err) {
      setPanelError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAction(option) {
    if (!window.confirm(`Delete "${displayLabel(option.label)}" from the dropdown options?`)) return;
    setBusy(true);
    setPanelError('');
    try {
      await api.delete(`/admin/complaint-options/${option.id}`);
      onChanged();
    } catch (err) {
      setPanelError(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const lockActions = busy || editingId !== null;

  return (
    <div className="p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-blue-600" />
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <span className="ml-auto rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
          {options.length}
        </span>
      </div>

      <ol className="mt-3 divide-y divide-slate-50 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-1">
        {options.map((option, index) => {
          const isEditing = editingId === option.id;
          return (
            <li key={option.id} className="flex items-center gap-2 py-2">
              <span className="w-6 text-right text-[11px] font-semibold text-slate-400">{index + 1}.</span>
              {isEditing ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit(option);
                      } else if (e.key === 'Escape') {
                        setEditingId(null);
                        setEditingValue('');
                      }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(option)}
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
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                    {displayLabel(option.label)}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setEditingId(option.id); setEditingValue(option.label); }}
                    disabled={lockActions}
                    title="Edit"
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAction(option)}
                    disabled={lockActions}
                    title="Delete"
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          );
        })}
        {!loading && !options.length && (
          <li className="py-2 text-xs text-slate-400">No options yet — add one below.</li>
        )}
      </ol>

      <form onSubmit={addAction} className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
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
  );
}

function ManageOptionsCard() {
  const [options, setOptions] = useState({ lectureTimes: [], lectureNumbers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadOptions() {
    setError('');
    try {
      const { data } = await api.get('/admin/complaint-options');
      setOptions({
        lectureTimes: Array.isArray(data.lectureTimes) ? data.lectureTimes : [],
        lectureNumbers: Array.isArray(data.lectureNumbers) ? data.lectureNumbers : [],
      });
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  const totalOptions = options.lectureTimes.length + options.lectureNumbers.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <ListChecks className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-bold text-slate-900">Complaint Form Options</h3>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
          {loading ? '—' : totalOptions}
        </span>
        <button
          onClick={loadOptions}
          disabled={loading}
          className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Reload
        </button>
      </div>

      <p className="px-5 pt-3 text-xs text-slate-500">
        Lecture Time and Lecture Number choices offered in the student attendance complaint form. Add, rename, or
        remove them here — saved in the database and shown to students automatically.
      </p>

      {error && (
        <div className="mx-5 mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      <div className="grid md:grid-cols-2 md:divide-x divide-slate-100">
        <OptionsPanel
          type="lecture_time"
          title="Lecture Times"
          Icon={Clock}
          options={options.lectureTimes}
          loading={loading}
          onChanged={loadOptions}
        />
        <OptionsPanel
          type="lecture_number"
          title="Lecture Numbers"
          Icon={ListOrdered}
          isLectureNumber
          options={options.lectureNumbers}
          loading={loading}
          onChanged={loadOptions}
        />
      </div>

      <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
        Deleting an option never changes complaints already submitted. If every option of a list is deleted, the
        built-in defaults are restored automatically so students can always submit.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Download Report — exports every complaint submitted inside a date range to a
// formatted .xlsx generated by the admin API (GET /admin/attendance-complaints/report).
// ---------------------------------------------------------------------------
function DownloadReportCard() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  function updateDate(setter) {
    return (event) => {
      setter(event.target.value);
      setReportError('');
      setReportSuccess('');
    };
  }

  async function downloadReport(event) {
    event.preventDefault();
    setReportError('');
    setReportSuccess('');

    if (!fromDate || !toDate) {
      setReportError('Choose both a From date and a To date before downloading.');
      return;
    }
    if (fromDate > toDate) {
      setReportError('The From date must be on or before the To date.');
      return;
    }

    setBusy(true);
    try {
      const response = await api.get('/admin/attendance-complaints/report', {
        params: { from: fromDate, to: toDate },
        responseType: 'blob',
        // Large ranges can take a little longer than a normal API call.
        timeout: 60000,
      });

      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: XLSX_MIME_TYPE });

      // Prefer the filename the server chose; fall back to the same pattern.
      const disposition = response.headers?.['content-disposition'] || '';
      const filenameMatch = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
      const filename = filenameMatch?.[1]
        ? decodeURIComponent(filenameMatch[1])
        : `attendance-complaints_${fromDate}_to_${toDate}.xlsx`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setReportSuccess(`Report downloaded: ${filename}`);
    } catch (err) {
      // Errors from a blob request arrive as a Blob containing the JSON body,
      // so parse it to surface the server's message (invalid range, no records…).
      let message = parseApiError(err).message;
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          if (parsed?.message) message = parsed.message;
        } catch {
          /* keep the generic message */
        }
      }
      setReportError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-blue-50/40 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
          <FileSpreadsheet className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">Download Report</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Export attendance complaints by lecture date to a formatted Excel file.
          </p>
        </div>
      </div>

      <form
        onSubmit={downloadReport}
        className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label htmlFor="report-from-date" className="flex min-w-0 flex-col gap-1 sm:w-44">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">From date</span>
          <input
            id="report-from-date"
            type="date"
            value={fromDate}
            onChange={updateDate(setFromDate)}
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label htmlFor="report-to-date" className="flex min-w-0 flex-col gap-1 sm:w-44">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">To date</span>
          <input
            id="report-to-date"
            type="date"
            value={toDate}
            onChange={updateDate(setToDate)}
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? 'Preparing report…' : 'Download Report'}
        </button>
      </form>

      {reportError && (
        <div
          role="alert"
          className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
          <span>{reportError}</span>
        </div>
      )}

      {reportSuccess && (
        <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>{reportSuccess}</span>
        </div>
      )}

      <p className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11px] text-slate-400">
        Both dates are inclusive — only complaints whose lecture date falls inside the range are exported. The file
        lists student name, enrollment number, lecture date, lecture time, lecture number, description and complaint
        status.
      </p>
    </section>
  );
}

export function AttendanceComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters: `filterDraft` is what the inputs show, `filters` is what has been
  // applied to the request. A short debounce keeps typing in the enrollment box
  // from firing a request on every keystroke.
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const filtersActive = hasAnyFilter(filters);
  const draftActive = hasAnyFilter(filterDraft);

  // Enrollment order: ascending by the numeric tail is the default view.
  const [sortBy, setSortBy] = useState('enrollment_asc');

  // Row action state: which complaint is being saved and what the admin clicked.
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  // Details modal: the selected complaint (the button only appears when a description exists).
  const [detailId, setDetailId] = useState(null);

  const detailItem = complaints.find((c) => c.id === detailId) || null;
  const busy = busyId !== null;

  async function loadComplaints() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/attendance-complaints', {
        params: {
          page,
          limit: PAGE_SIZE,
          sort: sortBy,
          ...(filters.date ? { date: filters.date } : {}),
          ...(filters.enrollment.trim() ? { enrollment: filters.enrollment.trim() } : {}),
          ...(filters.department ? { department: filters.department } : {}),
        },
      });
      setComplaints(data.complaints ?? []);
      setPages(data.pages ?? 1);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  // Apply the draft filters after a short pause, and always restart at page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      const changed =
        filters.date !== filterDraft.date ||
        filters.enrollment !== filterDraft.enrollment ||
        filters.department !== filterDraft.department;
      if (changed) {
        setPage(1);
        setFilters(filterDraft);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [filterDraft, filters]);

  useEffect(() => {
    loadComplaints();
  }, [page, filters, sortBy]);

  function clearFilters() {
    setFilterDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function openDetails(item) {
    setDetailId(item.id);
    setUpdateSuccess('');
  }

  function closeDetails() {
    setDetailId(null);
  }

  /**
   * Approve / Reject. The badge flips immediately, the PATCH persists the change,
   * and the server's copy of the row replaces the optimistic one (or is rolled
   * back if the request fails).
   */
  async function changeStatus(item, status) {
    if (busy || item.status === status) return;
    const previousStatus = item.status;
    setBusyId(item.id);
    setBusyAction(status);
    setError('');
    setUpdateSuccess('');
    setComplaints((current) => current.map((c) => (c.id === item.id ? { ...c, status } : c)));

    try {
      const { data } = await api.patch(`/admin/attendance-complaints/${item.id}/status`, { status });
      if (data?.complaint) {
        setComplaints((current) => current.map((c) => (c.id === item.id ? data.complaint : c)));
      }
      setUpdateSuccess(
        `Complaint #${item.id} marked ${STATUS_CONFIG[status]?.label ?? status}. The student portal now shows this status.`
      );
      setTimeout(() => setUpdateSuccess(''), 4000);
    } catch (err) {
      setComplaints((current) =>
        current.map((c) => (c.id === item.id ? { ...c, status: previousStatus } : c))
      );
      setError(parseApiError(err).message);
    } finally {
      setBusyId(null);
      setBusyAction('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Attendance Complaints</h2>
          <p className="mt-1 text-xs text-slate-500">
            Student-submitted attendance issues, lecture details, attached proof, and resolution status.
          </p>
        </div>
        <button
          onClick={loadComplaints}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:self-auto shadow-xs"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <DownloadReportCard />

      <ManageOptionsCard />

      {updateSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{updateSuccess}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <button onClick={loadComplaints} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <ClipboardList className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Submitted reports</h3>
          {filtersActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              <Filter className="h-3 w-3" /> Filtered
            </span>
          )}
          <span className="ml-auto rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
            {total}
          </span>
        </div>

        {/* Filters and enrollment sort: date, enrollment number, department (CS / IT / EC) */}
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-0 flex-col gap-1 sm:w-44">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Date</span>
            <input
              type="date"
              value={filterDraft.date}
              onChange={(e) => setFilterDraft((f) => ({ ...f, date: e.target.value }))}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:w-56">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Enrollment number
            </span>
            <input
              type="text"
              autoComplete="off"
              value={filterDraft.enrollment}
              onChange={(e) => setFilterDraft((f) => ({ ...f, enrollment: e.target.value }))}
              placeholder="e.g. 0111IT251014"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:w-44">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Department</span>
            <select
              value={filterDraft.department}
              onChange={(e) => setFilterDraft((f) => ({ ...f, department: e.target.value }))}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:w-56">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="enrollment_asc">Enrollment: low → high</option>
              <option value="enrollment_desc">Enrollment: high → low</option>
            </select>
          </label>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!draftActive}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        </div>

        {loading && !complaints.length ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading attendance complaints…</div>
        ) : !complaints.length ? (
          <div className="px-6 py-12 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-blue-400" />
            <p className="mt-3 text-sm font-semibold text-slate-800">
              {filtersActive ? 'No reports match these filters' : 'No attendance complaints yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {filtersActive
                ? 'Try a different date, enrollment number or department.'
                : 'When students submit attendance complaints, they will appear here.'}
            </p>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-xs font-semibold text-blue-700 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {complaints.map((item) => {
              const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              const rowBusy = busyId === item.id;
              const rowAction = rowBusy ? busyAction : '';

              return (
                <article
                  key={item.id}
                  className={`grid gap-4 p-5 transition-opacity md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] ${
                    loading ? 'opacity-60' : ''
                  }`}
                >
                  {/* Left: Student info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900">{item.student_name}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{item.enrollment_number}</p>
                  </div>

                  {/* Right: Complaint details & Actions */}
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                          {item.lecture_time}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Lecture {item.lecture_number}
                        </span>
                        {item.incident_date && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                            {formatDateOnly(item.incident_date)}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusCfg.badge}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                          Submitted {formatSubmittedAt(item.submitted_at)}
                        </span>
                      </div>
                    </div>

                    {/* Attached files */}
                    {item.attachments && item.attachments.length > 0 && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                          <Paperclip className="h-3.5 w-3.5" />
                          Attached Evidence ({item.attachments.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.attachments.map((file, idx) => (
                            <a
                              key={idx}
                              href={`/api/admin/attendance-complaints/file/${file.storedName}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-2xs hover:bg-blue-50/60 hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5 text-blue-500" />
                              <span className="max-w-[200px] truncate">{file.originalName}</span>
                              {file.size && (
                                <span className="text-[10px] text-slate-400">({formatBytes(file.size)})</span>
                              )}
                              <ExternalLink className="h-3 w-3 text-slate-400" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Admin Remarks display if present */}
                    {item.admin_remarks && (
                      <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-xs text-teal-900">
                        <span className="font-bold">Admin Remarks:</span> {item.admin_remarks}
                      </div>
                    )}

                    {/* Per-report actions */}
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      {item.description?.trim() && (
                        <button
                          type="button"
                          onClick={() => openDetails(item)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Details
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => changeStatus(item, 'approved')}
                        disabled={busy || item.status === 'approved'}
                        title={item.status === 'approved' ? 'Already approved' : 'Approve this complaint'}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {rowAction === 'approved' ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {rowAction === 'approved' ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => changeStatus(item, 'rejected')}
                        disabled={busy || item.status === 'rejected'}
                        title={item.status === 'rejected' ? 'Already rejected' : 'Reject this complaint'}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 shadow-xs transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {rowAction === 'rejected' ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {rowAction === 'rejected' ? 'Rejecting…' : 'Reject'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
            <p className="text-slate-500">
              Page {page} of {pages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((current) => current - 1)}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= pages || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Details modal — only the description the student submitted */}
      <Modal
        isOpen={Boolean(detailItem)}
        onClose={closeDetails}
        title="Complaint Description"
        maxWidth="max-w-2xl"
      >
        {detailItem && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
            {detailItem.description}
          </p>
        )}
      </Modal>
    </div>
  );
}

export default AttendanceComplaints;
