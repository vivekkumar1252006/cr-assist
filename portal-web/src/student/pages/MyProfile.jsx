import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen, CalendarDays, Camera, FlaskConical, GraduationCap, Hash, IdCard, Loader2, Lock, Mail, Pencil, Phone, Save, Trash2,
  UserRound, Users, X,
} from 'lucide-react';
import { useStudent } from '@/student/components/StudentLayout.jsx';
import { Avatar, Card, ErrorState, PageHeader, Skeleton, btnPrimary, btnSecondary } from '@/student/components/common.jsx';
import { Alert, TextInput } from '@shared/components/ui.jsx';
import { useAuth } from '../../shared/context/AuthContext.jsx';
import { api, parseApiError } from '@shared/lib/api.js';
import { formatDate, formatDob } from '@shared/lib/format.js';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const today = new Date().toISOString().slice(0, 10);

function Detail({ icon: Icon, label, value, muted }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-slate-100">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`break-words text-sm font-semibold ${muted ? 'text-slate-400' : 'text-navy-900'}`}>{value}</p>
      </div>
    </div>
  );
}

function PhotoControls({ profile, onUpdated }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Choose a JPG, PNG or WebP image.' });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setMessage({ type: 'error', text: 'Photo must be 2 MB or smaller.' });
      return;
    }
    const body = new FormData();
    body.append('photo', file);
    setBusy('upload');
    setMessage(null);
    try {
      const { data } = await api.post('/student/profile/photo', body);
      onUpdated(data.profile);
      setMessage({ type: 'success', text: data.message });
    } catch (err) {
      setMessage({ type: 'error', text: parseApiError(err).message });
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setBusy('remove');
    setMessage(null);
    try {
      const { data } = await api.delete('/student/profile/photo');
      onUpdated(data.profile);
      setMessage({ type: 'success', text: data.message });
    } catch (err) {
      setMessage({ type: 'error', text: parseApiError(err).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <Avatar name={profile.fullName} src={profile.photoUrl} size="lg" className="shadow-lg ring-teal-50" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(busy)}
          className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-teal-600 text-white shadow-md ring-4 ring-white transition hover:bg-teal-500 disabled:opacity-70"
          aria-label={profile.photoUrl ? 'Change profile photo' : 'Upload profile photo'}
        >
          {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFile} tabIndex={-1} />
      <div className="mt-3 flex gap-3 text-xs font-semibold">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)} className="text-teal-700 hover:underline disabled:opacity-60">
          {profile.photoUrl ? 'Change photo' : 'Upload photo'}
        </button>
        {profile.photoUrl && (
          <button type="button" onClick={handleRemove} disabled={Boolean(busy)} className="inline-flex items-center gap-1 text-red-600 hover:underline disabled:opacity-60">
            {busy === 'remove' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Remove
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">JPG, PNG or WebP · max 2 MB</p>
      {message && <div className="mt-3 w-full text-left"><Alert type={message.type}>{message.text}</Alert></div>}
    </div>
  );
}

function EditForm({ profile, onCancel, onSaved }) {
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({
    fullName: profile.fullName,
    email: profile.email,
    enrollmentNumber: profile.enrollmentNumber,
    studentId: profile.studentId,
    mobile: profile.mobile ?? '',
    dob: profile.dob ?? '',
    course: profile.course,
    academicYear: profile.academicYear,
    semester: profile.semester,
    group: profile.group,
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/student/profile', form);
      await refreshUser();
      onSaved(data.profile, data.message);
    } catch (err) {
      const { message, errors: fieldErrors } = parseApiError(err);
      setErrors(fieldErrors);
      setServerError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Alert type="error">{serverError}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput className="sm:col-span-2" label="Full Name" icon={UserRound} value={form.fullName} onChange={update('fullName')} error={errors.fullName} autoComplete="name" required />
        <TextInput className="sm:col-span-2" label="Email" type="email" icon={Mail} value={form.email} onChange={update('email')} error={errors.email} autoComplete="email" required />
        <TextInput label="Enrollment Number" icon={Hash} value={form.enrollmentNumber} onChange={update('enrollmentNumber')} error={errors.enrollmentNumber} placeholder="e.g. 0111IT251014" required />
        <TextInput label="Student ID" icon={IdCard} value={form.studentId} onChange={update('studentId')} error={errors.studentId} placeholder="e.g. 25-26STU25695" required />
        <TextInput label="Mobile Number" type="tel" inputMode="numeric" maxLength={14} icon={Phone} value={form.mobile} onChange={update('mobile')} error={errors.mobile} placeholder="10-digit mobile number" autoComplete="tel-national" required />
        <TextInput label="Date of Birth" type="date" max={today} icon={CalendarDays} value={form.dob} onChange={update('dob')} error={errors.dob} required />
        <TextInput label="Course / Branch" icon={BookOpen} value={form.course} onChange={update('course')} error={errors.course} placeholder="e.g. IT, CSE, ECE" required />
        <TextInput label="Academic Year" icon={GraduationCap} value={form.academicYear} onChange={update('academicYear')} error={errors.academicYear} placeholder="e.g. Second Year" required />
        <TextInput label="Semester" type="number" inputMode="numeric" min="1" max="8" icon={GraduationCap} value={form.semester} onChange={update('semester')} error={errors.semester} placeholder="1-8" required />
        <TextInput label="Group" icon={Users} value={form.group} onChange={update('group')} error={errors.group} placeholder="A or B" required />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className={btnSecondary} disabled={saving}>
          <X className="h-4 w-4" /> Cancel
        </button>
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

export default function MyProfile() {
  const { profile, profileError, profileLoading, reloadProfile, setProfile } = useStudent();
  const [params, setParams] = useSearchParams();
  const editing = params.get('edit') === '1';
  const [notice, setNotice] = useState('');

  const setEditing = (on) => setParams(on ? { edit: '1' } : {}, { replace: true });
  useEffect(() => {
    if (editing) setNotice('');
  }, [editing]);

  if (profileError) return <ErrorState message={profileError} onRetry={reloadProfile} />;
  if (profileLoading || !profile) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="My Profile"
        subtitle="Your personal and academic details."
        actions={
          !editing && (
            <button onClick={() => setEditing(true)} className={btnPrimary}>
              <Pencil className="h-4 w-4" /> Edit Profile
            </button>
          )
        }
      />
      {notice && <div className="mb-4"><Alert type="success">{notice}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <PhotoControls profile={profile} onUpdated={setProfile} />
          <div className="mt-5 border-t border-slate-100 pt-5 text-center">
            <h2 className="text-lg font-bold text-navy-900">{profile.fullName}</h2>
            <p className="text-sm text-slate-500">{profile.courseName}</p>
            {profile.isDemo && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                <FlaskConical className="h-3 w-3" /> Demo account
              </span>
            )}
            <p className="mt-3 text-xs text-slate-400">Member since {formatDate(profile.memberSince)}</p>
          </div>
        </Card>

        <Card title={editing ? 'Edit Profile' : 'Details'} icon={editing ? Pencil : IdCard} className="lg:col-span-2">
          {editing ? (
            <EditForm
              profile={profile}
              onCancel={() => setEditing(false)}
              onSaved={(p, message) => {
                setProfile(p);
                setNotice(message);
                setEditing(false);
              }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Detail icon={UserRound} label="Full Name" value={profile.fullName} />
              <Detail icon={Mail} label="Email" value={profile.email} />
              <Detail icon={Hash} label="Enrollment Number" value={profile.enrollmentNumber} />
              <Detail icon={IdCard} label="Student ID" value={profile.studentId} />
              <Detail icon={BookOpen} label="Course / Branch" value={`${profile.courseName} (${profile.course})`} />
              <Detail icon={GraduationCap} label="Academic Year · Semester" value={`${profile.academicYear} · Semester ${profile.semester}`} />
              <Detail icon={Users} label="Group" value={`Group ${profile.group}`} />
              <Detail icon={Phone} label="Mobile Number" value={profile.mobile || 'Not added yet'} muted={!profile.mobile} />
              <Detail icon={CalendarDays} label="Date of Birth" value={formatDob(profile.dob) || 'Not added yet'} muted={!profile.dob} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
