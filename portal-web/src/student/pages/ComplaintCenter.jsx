import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays, CheckCircle2, ClipboardList, Info, Loader2, Paperclip, Send,
} from 'lucide-react';
import { useStudent } from '@/student/components/StudentLayout.jsx';
import { Card, ErrorState, StatusBadge, btnPrimary, btnSecondary } from '@/student/components/common.jsx';
import { Alert, Field, SelectInput, TextInput } from '@shared/components/ui.jsx';
import { ConfirmDialog } from '@shared/components/Modal.jsx';
import FilePicker from '@shared/components/FilePicker.jsx';
import { api, parseApiError } from '@shared/lib/api.js';
import { useApi } from '@shared/lib/useApi.js';
import { uploadAttachments } from '@shared/lib/uploads.js';
import { useToast } from '../../shared/context/ToastContext.jsx';
import { formatTime } from '@shared/lib/format.js';
import { ATTENDANCE_STATUS_LABEL, LIMITS, MAX_FILES } from '@shared/lib/complaints.js';

const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const emptyForm = {
  title: '', typeId: '', description: '',
  attendanceDate: '', attendanceSessionId: '', requestedCorrection: '',
};

function TextArea({ label, value, onChange, error, max, rows = 4, required, hint, placeholder }) {
  return (
    <Field label={label} error={error} hint={hint ?? `${value.length}/${max} characters`} required={required}>
      {(id, describedBy) => (
        <textarea
          id={id}
          rows={rows}
          maxLength={max}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 ${
            error ? 'border-red-300 focus:ring-red-100' : 'border-slate-200 focus:border-teal-500 focus:ring-teal-100'
          }`}
        />
      )}
    </Field>
  );
}

function validate(f, type) {
  const e = {};
  const len = (key, label, required = true) => {
    const [min, max] = LIMITS[key];
    const n = f[key].trim().length;
    if (required && !n) e[key] = `${label} is required`;
    else if (n && (n < min || n > max)) e[key] = `${label} must be ${min}–${max} characters`;
  };
  len('title', 'Complaint title');
  // Detailed description is optional — only the 5000-character cap applies.
  len('description', 'Detailed description', false);
  if (!f.typeId) e.typeId = 'Select a complaint type';
  // Behaviour flags come from the database-backed type itself.
  if (type?.readsSession && type?.sessionRequired) {
    if (!f.attendanceDate) e.attendanceDate = 'Select the attendance date';
    if (!f.attendanceSessionId) e.attendanceSessionId = 'Select the class session';
    if (!f.requestedCorrection) e.requestedCorrection = 'Select the correction you are requesting';
  }
  return e;
}

export default function ComplaintCenter() {
  const { profileError, reloadProfile } = useStudent();
  const [params] = useSearchParams();
  const { toast } = useToast();

  // Database-backed complaint type list (admins manage it on /admin/complaints).
  const typesQuery = useApi('/complaints/types');

  const [form, setForm] = useState(() => ({
    ...emptyForm,
    attendanceDate: /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date') : '',
    attendanceSessionId: /^\d+$/.test(params.get('session') ?? '') ? params.get('session') : '',
  }));
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState('form'); // form | submitting | uploading | done
  const [created, setCreated] = useState(null);

  const types = typesQuery.data?.types ?? [];
  const selectedType = useMemo(
    () => types.find((t) => String(t.id) === String(form.typeId)) ?? null,
    [types, form.typeId],
  );
  // Attendance-section behaviour comes from the selected type's database flags.
  const isAttendance = Boolean(selectedType?.readsSession);
  const needsSession = Boolean(selectedType?.readsSession && selectedType?.sessionRequired);
  const sessions = useApi(isAttendance && form.attendanceDate ? `/student/attendance?date=${form.attendanceDate}&limit=50` : null);
  const selectedSession = useMemo(
    () => sessions.data?.items.find((s) => String(s.sessionId) === String(form.attendanceSessionId)) ?? null,
    [sessions.data, form.attendanceSessionId],
  );

  // Deep-links like /student/complaints/new?category=qr_not_scanning&date=…&session=…
  // preselect the matching database type (once the list arrives).
  const presetCategory = params.get('category') ?? '';
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current || !typesQuery.data?.types?.length) return;
    presetApplied.current = true;
    const match = typesQuery.data.types.find((t) => t.categoryKey === presetCategory);
    if (match) setForm((f) => ({ ...f, typeId: String(match.id) }));
  }, [typesQuery.data, presetCategory]);

  // Drop a selected session that isn't on the chosen date.
  useEffect(() => {
    if (sessions.data && form.attendanceSessionId && !selectedSession) setForm((f) => ({ ...f, attendanceSessionId: '' }));
  }, [sessions.data, form.attendanceSessionId, selectedSession]);

  const update = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({
      ...f,
      [key]: value,
      // Changing the type or date clears attendance fields that may no longer apply.
      ...(key === 'attendanceDate' && { attendanceSessionId: '' }),
      ...(key === 'typeId' && { attendanceDate: '', attendanceSessionId: '', requestedCorrection: '' }),
    }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  function review(e) {
    e.preventDefault();
    const next = validate(form, selectedType);
    setErrors(next);
    setServerError('');
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setConfirmOpen(true);
  }

  const updateFile = (id, patch) => setFiles((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  async function submit() {
    setPhase('submitting');
    try {
      const payload = { ...form };
      if (!isAttendance) {
        payload.attendanceDate = '';
        payload.attendanceSessionId = '';
        payload.requestedCorrection = '';
      }
      const { data } = await api.post('/complaints', payload);
      setCreated(data.complaint);
      setConfirmOpen(false);
      if (files.length) {
        setPhase('uploading');
        const failed = await uploadAttachments(data.complaint.id, files, updateFile);
        if (failed) toast(`${failed} attachment(s) failed to upload — retry below.`, 'error', 8000);
      }
      setPhase('done');
      toast(data.message, 'success', 8000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const { message, errors: fieldErrors } = parseApiError(err);
      setConfirmOpen(false);
      setPhase('form');
      setErrors(fieldErrors);
      setServerError(message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function retryUploads() {
    setPhase('uploading');
    const failed = await uploadAttachments(created.id, files, updateFile);
    setPhase('done');
    toast(failed ? `${failed} attachment(s) still failed.` : 'All attachments uploaded.', failed ? 'error' : 'success');
  }

  function startOver() {
    setForm(emptyForm);
    setFiles([]);
    setCreated(null);
    setErrors({});
    setPhase('form');
  }

  const header = (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">Problem &amp; Complaint Center</h1>
        <p className="mt-1 text-sm text-slate-500">Report an issue, upload supporting evidence, and track its resolution.</p>
      </div>
    </>
  );

  if (phase === 'done' || (phase === 'uploading' && created)) {
    const failed = files.filter((f) => f.status === 'error').length;
    return (
      <div className="animate-fade-up">
        {header}
        <Card>
          <div className="flex flex-col items-center py-4 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
              {phase === 'uploading' ? <Loader2 className="h-8 w-8 animate-spin" /> : <CheckCircle2 className="h-8 w-8" />}
            </span>
            <h2 className="mt-4 text-xl font-bold text-navy-900">
              {phase === 'uploading' ? 'Uploading attachments…' : 'Complaint submitted'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Your complaint ID is <span className="font-mono font-bold text-teal-700">{created.complaintNumber}</span>.
              {created.assigned ? ' It has been sent to your class incharge.' : ' It will be assigned to an authorized staff member.'}
            </p>
          </div>
          {files.length > 0 && (
            <div className="mt-4">
              <FilePicker items={files} onChange={setFiles} disabled onRetry={retryUploads} />
              {failed > 0 && phase === 'done' && (
                <button onClick={retryUploads} className={`${btnPrimary} mt-3`}><Paperclip className="h-4 w-4" /> Retry {failed} failed upload(s)</button>
              )}
            </div>
          )}
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link to={`/student/complaints/${created.id}`} className={btnPrimary}>View complaint</Link>
            <Link to="/student/complaints" className={btnSecondary}>My Complaints</Link>
            <button onClick={startOver} className={btnSecondary}>Submit another</button>
          </div>
        </Card>
      </div>
    );
  }

  if (profileError) return <ErrorState message={profileError} onRetry={reloadProfile} />;
  const sessionOptions = (sessions.data?.items ?? []).map((s) => ({
    value: String(s.sessionId),
    label: `${formatTime(s.startsAt)} · ${s.subject} (${ATTENDANCE_STATUS_LABEL[s.status]})`,
  }));

  return (
    <div className="animate-fade-up">
      {header}
      <form id="complaint-form" onSubmit={review} noValidate className="space-y-6">
        {serverError && <Alert type="error">{serverError}</Alert>}

        <Card title="Complaint details" icon={ClipboardList}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput className="sm:col-span-2" label="Complaint title" maxLength={LIMITS.title[1]} value={form.title} onChange={update('title')} error={errors.title} hint={`${form.title.length}/${LIMITS.title[1]} characters`} placeholder="e.g. Marked absent in Data Structures on 14 Oct" required />
            <SelectInput
              className="sm:col-span-2"
              label="Complaint type"
              placeholder={typesQuery.loading ? 'Loading complaint types…' : 'Select the type of issue'}
              options={types.map((t) => ({ value: String(t.id), label: t.label }))}
              disabled={typesQuery.loading}
              value={form.typeId}
              onChange={update('typeId')}
              error={errors.typeId ?? typesQuery.error ?? undefined}
              required
            />
          </div>
        </Card>

        {isAttendance && (
          <Card title="Attendance details" icon={CalendarDays} className="animate-fade-up">
            <div className="mb-4 flex gap-2 rounded-xl bg-navy-50 p-3 text-xs text-navy-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              You can&apos;t change attendance yourself. Your class incharge or an administrator will verify this request before any record is corrected.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Attendance date" type="date" max={todayIst()} value={form.attendanceDate} onChange={update('attendanceDate')} error={errors.attendanceDate} required={needsSession} />
              <SelectInput
                label="Class / attendance session"
                placeholder={!form.attendanceDate ? 'Select a date first' : sessions.loading ? 'Loading classes…' : sessionOptions.length ? (needsSession ? 'Select the class' : 'No specific class') : 'No classes on this date'}
                allowEmpty={!needsSession}
                options={sessionOptions}
                disabled={!form.attendanceDate || sessions.loading}
                value={form.attendanceSessionId}
                onChange={update('attendanceSessionId')}
                error={errors.attendanceSessionId ?? sessions.error}
                required={needsSession}
              />
              <div>
                <p className="mb-1.5 text-sm font-medium text-navy-900">Current attendance status</p>
                <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5">
                  {selectedSession ? <StatusBadge status={selectedSession.status} /> : <span className="text-sm text-slate-400">Select a class</span>}
                </div>
              </div>
              {needsSession && (
                <SelectInput
                  label="Requested correction"
                  placeholder="Mark me as…"
                  options={[{ value: 'present', label: 'Present' }, { value: 'late', label: 'Late' }].filter((o) => o.value !== selectedSession?.status)}
                  value={form.requestedCorrection}
                  onChange={update('requestedCorrection')}
                  error={errors.requestedCorrection}
                  required
                />
              )}
            </div>
          </Card>
        )}

        <Card title="Description" icon={Info}>
          <div className="space-y-4">
            <TextArea
              label={
                <span>
                  {isAttendance ? 'Detailed description & reason for the complaint' : 'Detailed description'}
                  <span className="text-xs font-normal text-slate-400"> (optional — helps staff resolve faster)</span>
                </span>
              }
              rows={6}
              max={LIMITS.description[1]}
              value={form.description}
              onChange={update('description')}
              error={errors.description}
              placeholder={isAttendance ? 'Explain what happened in class, why the record is wrong, and who can confirm you were present.' : 'Describe the issue, when it started and what you have already tried.'}
            />
          </div>
        </Card>

        <Card title="Supporting attachments" icon={Paperclip}>
          <FilePicker items={files} onChange={setFiles} maxFiles={MAX_FILES} addButtonLabel="Add File" />
          <p className="mt-3 text-xs text-slate-500">Attachments are stored privately and are visible only to you and authorized staff.</p>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to="/student/complaints" className={btnSecondary}>Cancel</Link>
          <button type="submit" className={btnPrimary}><Send className="h-4 w-4" /> Review &amp; Submit</button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Submit this complaint?"
        confirmLabel="Submit complaint"
        busy={phase === 'submitting'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submit}
      >
        <dl className="space-y-2">
          <div><dt className="text-xs text-slate-500">Title</dt><dd className="font-medium text-navy-900">{form.title}</dd></div>
          {selectedType && (
            <div><dt className="text-xs text-slate-500">Complaint type</dt><dd className="font-medium text-navy-900">{selectedType.label}</dd></div>
          )}
          {selectedSession && (
            <div><dt className="text-xs text-slate-500">Class</dt><dd className="font-medium text-navy-900">{selectedSession.subject} · {form.attendanceDate} {formatTime(selectedSession.startsAt)}{form.requestedCorrection ? ` → request ${form.requestedCorrection}` : ''}</dd></div>
          )}
          <div><dt className="text-xs text-slate-500">Attachments</dt><dd className="font-medium text-navy-900">{files.length ? `${files.length} file(s)` : 'None'}</dd></div>
        </dl>
        <p className="mt-3 text-xs">You won&apos;t be able to edit these details after submitting, but you can add follow-up messages and files while it is open.</p>
      </ConfirmDialog>
    </div>
  );
}
