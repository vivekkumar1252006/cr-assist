import { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Send,
  Paperclip,
  X,
  FileText,
  Clock,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ClipboardList,
  FileCheck,
  ShieldAlert,
} from 'lucide-react';
import { Alert } from '../../components/ui.jsx';
import { Card, PageHeader, btnPrimary, Skeleton } from '../../components/student/common.jsx';
import { api, parseApiError } from '../../lib/api.js';

const LECTURE_TIMES = [
  '09:00 AM – 10:00 AM',
  '10:00 AM – 11:00 AM',
  '11:00 AM – 12:00 PM',
  '12:00 PM – 1:00 PM',
  '01:30 PM – 02:30 PM',
  '02:30 PM – 03:30 PM',
  '03:30 PM – 04:30 PM',
];

const LECTURES = ['1/7', '2/7', '3/7', '4/7', '5/7', '6/7', '7/7'];

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending Review',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
    icon: Clock,
  },
  in_review: {
    label: 'In Review',
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20',
    icon: RefreshCw,
  },
  resolved: {
    label: 'Resolved',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
    icon: AlertCircle,
  },
};

export default function AttendanceComplaint() {
  // Form states
  const [lectureTime, setLectureTime] = useState('');
  const [lectureNumber, setLectureNumber] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Complaints history states
  const [complaints, setComplaints] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [complaintsError, setComplaintsError] = useState('');

  async function loadComplaints() {
    setLoadingComplaints(true);
    setComplaintsError('');
    try {
      const res = await api.get('/student/attendance-complaints');
      setComplaints(res.data?.complaints || []);
    } catch (err) {
      setComplaintsError(parseApiError(err).message);
    } finally {
      setLoadingComplaints(false);
    }
  }

  useEffect(() => {
    loadComplaints();
  }, []);

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    const currentTotal = files.length + selected.length;
    if (currentTotal > 5) {
      setErrors((prev) => ({ ...prev, files: 'You can upload a maximum of 5 files in total.' }));
      return;
    }

    const invalidSize = selected.find((f) => f.size > 10 * 1024 * 1024);
    if (invalidSize) {
      setErrors((prev) => ({ ...prev, files: `File "${invalidSize.name}" exceeds the 10 MB size limit.` }));
      return;
    }

    setErrors((prev) => ({ ...prev, files: '' }));
    setFiles((prev) => [...prev, ...selected]);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(indexToRemove) {
    setFiles((prev) => prev.filter((_, i) => i !== indexToRemove));
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!lectureTime) nextErrors.lectureTime = 'Select a lecture time.';
    if (!lectureNumber) nextErrors.lectureNumber = 'Select a lecture number.';
    if (!description.trim()) nextErrors.description = 'Description is required.';
    else if (description.trim().length > 5000) nextErrors.description = 'Description must be 5000 characters or fewer.';

    setErrors(nextErrors);
    setServerError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('lectureTime', lectureTime);
      formData.append('lectureNumber', lectureNumber);
      formData.append('description', description.trim());

      files.forEach((file) => {
        formData.append('files', file);
      });

      await api.post('/student/attendance-complaints', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSubmitted(true);
      // Clear form after successful submission
      setLectureTime('');
      setLectureNumber('');
      setDescription('');
      setFiles([]);
      setErrors({});

      // Refresh complaints list immediately
      loadComplaints();
    } catch (err) {
      const parsed = parseApiError(err);
      setErrors(parsed.errors || {});
      setServerError(parsed.message);
    } finally {
      setSubmitting(false);
    }
  }

  const controlClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:bg-slate-50';

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        title="Attendance Complaint"
        subtitle="Submit an issue about your lecture attendance and track resolution in real time."
      />

      {/* 1. Complaint Submission Form Card */}
      <Card title="Submit New Complaint" icon={CalendarClock} className="mx-auto max-w-4xl">
        {submitted && (
          <div className="mb-5">
            <Alert type="success">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" />
                Attendance complaint submitted successfully! Your submission has been recorded in the database.
              </span>
            </Alert>
          </div>
        )}

        {serverError && (
          <div className="mb-5">
            <Alert type="error">{serverError}</Alert>
          </div>
        )}

        <form onSubmit={submit} noValidate className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="lecture-time" className="mb-1.5 block text-sm font-medium text-navy-900">
                Lecture Time <span className="text-red-500">*</span>
              </label>
              <select
                id="lecture-time"
                value={lectureTime}
                disabled={submitting}
                onChange={(event) => {
                  setLectureTime(event.target.value);
                  setErrors((current) => ({ ...current, lectureTime: '' }));
                }}
                aria-invalid={Boolean(errors.lectureTime)}
                className={`${controlClass} ${
                  errors.lectureTime ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''
                }`}
                required
              >
                <option value="">Select lecture time</option>
                {LECTURE_TIMES.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              {errors.lectureTime && (
                <p className="mt-1.5 text-xs font-medium text-red-600">{errors.lectureTime}</p>
              )}
            </div>

            <div>
              <label htmlFor="lecture-number" className="mb-1.5 block text-sm font-medium text-navy-900">
                Lecture Number <span className="text-red-500">*</span>
              </label>
              <select
                id="lecture-number"
                value={lectureNumber}
                disabled={submitting}
                onChange={(event) => {
                  setLectureNumber(event.target.value);
                  setErrors((current) => ({ ...current, lectureNumber: '' }));
                }}
                aria-invalid={Boolean(errors.lectureNumber)}
                className={`${controlClass} ${
                  errors.lectureNumber ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''
                }`}
                required
              >
                <option value="">Select lecture number</option>
                {LECTURES.map((lecture) => (
                  <option key={lecture} value={lecture}>
                    Lecture {lecture}
                  </option>
                ))}
              </select>
              {errors.lectureNumber && (
                <p className="mt-1.5 text-xs font-medium text-red-600">{errors.lectureNumber}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="attendance-description" className="mb-1.5 block text-sm font-medium text-navy-900">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="attendance-description"
              rows={4}
              maxLength={5000}
              disabled={submitting}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrors((current) => ({ ...current, description: '' }));
              }}
              aria-invalid={Boolean(errors.description)}
              placeholder="Explain the attendance issue you are experiencing (e.g. scanner did not register, technical glitch, present in class)."
              className={`${controlClass} resize-y ${
                errors.description ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''
              }`}
              required
            />
            <div className="mt-1.5 flex justify-between gap-3">
              {errors.description ? (
                <p className="text-xs font-medium text-red-600">{errors.description}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-slate-400">{description.length}/5000</p>
            </div>
          </div>

          {/* Attach Evidence / Files */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy-900">
              Attach Evidence / Files <span className="text-xs font-normal text-slate-400">(Optional, Max 5 files, 10MB each)</span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                disabled={submitting || files.length >= 5}
                accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload-input"
              />
              <button
                type="button"
                disabled={submitting || files.length >= 5}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-teal-500 hover:bg-teal-50/40 hover:text-teal-700 disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4 text-slate-500" />
                {files.length >= 5 ? 'Max files reached (5/5)' : 'Choose Files / Screenshots'}
              </button>

              <span className="text-xs text-slate-400">Supported: Images, PDF, DOC, DOCX</span>
            </div>

            {errors.files && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.files}</p>}

            {/* Selected files list */}
            {files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {files.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-xs"
                  >
                    <FileText className="h-3.5 w-3.5 text-teal-600" />
                    <span className="font-medium max-w-[180px] truncate">{file.name}</span>
                    <span className="text-[11px] text-slate-400">({formatBytes(file.size)})</span>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => removeFile(idx)}
                      className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={submitting}
              className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <Send className="h-4 w-4" /> {submitting ? 'Submitting Complaint…' : 'Submit Complaint'}
            </button>
          </div>
        </form>
      </Card>

      {/* 2. My Submitted Complaints Section */}
      <Card
        title="My Submitted Complaints"
        icon={ClipboardList}
        className="mx-auto max-w-4xl"
        action={
          <button
            onClick={loadComplaints}
            disabled={loadingComplaints}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingComplaints ? 'animate-spin text-teal-600' : ''}`} />
            Refresh
          </button>
        }
      >
        {complaintsError && (
          <div className="mb-4">
            <Alert type="error">{complaintsError}</Alert>
          </div>
        )}

        {loadingComplaints && !complaints.length ? (
          <div className="space-y-4 py-3">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : complaints.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 mb-3">
              <CalendarClock className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-navy-900">No attendance complaints yet</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Any complaint you submit using the form above will be saved in the database and displayed here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Complaints ({complaints.length})
              </span>
              <span className="text-xs text-slate-400">Synced with portal database</span>
            </div>

            {complaints.map((item) => {
              const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-slate-300"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-lg bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-900">
                        {item.lectureTime}
                      </span>
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        Lecture {item.lectureNumber}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusCfg.badge}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDateTime(item.submittedAt)}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mt-3.5">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Attached Files Section */}
                  {item.attachments && item.attachments.length > 0 && (
                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5" />
                        Attached Files ({item.attachments.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.attachments.map((file, idx) => (
                          <a
                            key={idx}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-2xs hover:bg-blue-50/60 hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5 text-blue-500" />
                            <span className="max-w-[200px] truncate">{file.originalName}</span>
                            {file.size ? (
                              <span className="text-[10px] text-slate-400">({formatBytes(file.size)})</span>
                            ) : null}
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Admin Remarks if present */}
                  {item.adminRemarks && (
                    <div className="mt-3.5 rounded-xl border border-teal-200 bg-teal-50/50 p-3 text-xs text-teal-900">
                      <span className="font-bold">Admin Remarks:</span> {item.adminRemarks}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
