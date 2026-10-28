import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  CheckCircle,
  Edit2,
  Mail,
  Phone,
  Plus,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { Modal } from '../components/Modal.jsx';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  password: '',
  department: 'Computer Science',
  designation: 'Assistant Professor',
  mobile: '',
  officeRoom: '',
  accountStatus: 'active',
};

const ACCOUNT_STATUSES = ['active', 'suspended', 'rejected'];

const fieldClass =
  'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

function StatusPill({ status }) {
  const active = status === 'active';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {active ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status || 'unknown'}
    </span>
  );
}

export function Faculty() {
  const [faculty, setFaculty] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  async function loadFaculty() {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/admin/faculty');
      setFaculty(data.faculty ?? []);
    } catch (err) {
      setLoadError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFaculty();
  }, []);

  const departments = useMemo(
    () => [...new Set(faculty.map((member) => member.department).filter(Boolean))].sort(),
    [faculty],
  );

  const visibleFaculty = useMemo(() => {
    const term = search.trim().toLowerCase();
    return faculty.filter((member) => {
      if (departmentFilter && member.department !== departmentFilter) return false;
      if (!term) return true;
      return [member.fullName, member.email, member.department, member.designation]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [faculty, search, departmentFilter]);

  const activeCount = faculty.filter((member) => member.accountStatus === 'active').length;
  const sessionTotal = faculty.reduce((sum, member) => sum + Number(member.totalSessions || 0), 0);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(member) {
    setEditing(member);
    setForm({
      fullName: member.fullName || '',
      email: member.email || '',
      password: '',
      department: member.department || '',
      designation: member.designation || '',
      mobile: member.mobile || '',
      officeRoom: member.officeRoom || '',
      accountStatus: member.accountStatus || 'active',
    });
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  }

  function closeForm() {
    if (!saving) setFormOpen(false);
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
    setFormError('');
  }

  function validate() {
    const next = {};
    const name = form.fullName.trim();
    if (name.length < 2 || name.length > 100) next.fullName = 'Enter a name between 2 and 100 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!editing && form.password.length < 6) next.password = 'Password must be at least 6 characters.';
    if (editing && form.password && form.password.length < 6) next.password = 'Password must be at least 6 characters.';
    if (!form.department.trim()) next.department = 'Department is required.';
    if (!form.designation.trim()) next.designation = 'Designation is required.';
    if (form.mobile.trim() && !/^[+\d\s().-]{7,20}$/.test(form.mobile.trim())) {
      next.mobile = 'Enter a valid mobile number.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function saveFaculty(event) {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;
    setSaving(true);

    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      department: form.department.trim(),
      designation: form.designation.trim(),
      mobile: form.mobile.trim(),
      officeRoom: form.officeRoom.trim(),
    };
    if (editing) payload.accountStatus = form.accountStatus;
    if (form.password) payload.password = form.password;

    try {
      if (editing) {
        await api.put(`/admin/faculty/${editing.id}`, payload);
      } else {
        await api.post('/admin/faculty', payload);
      }
      setFormOpen(false);
      await loadFaculty();
    } catch (err) {
      const parsed = parseApiError(err);
      setFormError(parsed.message);
      setFieldErrors(parsed.errors ?? {});
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(member) {
    const nextStatus = member.accountStatus === 'active' ? 'suspended' : 'active';
    setFormError('');
    try {
      await api.put(`/admin/faculty/${member.id}`, {
        fullName: member.fullName,
        email: member.email,
        department: member.department || '',
        designation: member.designation || '',
        mobile: member.mobile || '',
        officeRoom: member.officeRoom || '',
        accountStatus: nextStatus,
      });
      setFaculty((current) =>
        current.map((item) => (item.id === member.id ? { ...item, accountStatus: nextStatus } : item)),
      );
    } catch (err) {
      setLoadError(parseApiError(err).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Faculty Management</h2>
          <p className="mt-1 text-xs text-slate-500">
            Create faculty accounts and keep their department details up to date.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Add Faculty
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total faculty', value: faculty.length, icon: Users, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Active accounts', value: activeCount, icon: CheckCircle, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Sessions conducted', value: sessionTotal, icon: Briefcase, tone: 'text-amber-600 bg-amber-50' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="text-xl font-extrabold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{loadError}</span>
          <button onClick={loadFaculty} className="font-semibold underline">Retry</button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email or designation"
            className={`${fieldClass} pl-10`}
          />
        </div>
        <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className={`${fieldClass} sm:w-64`}>
          <option value="">All departments</option>
          {departments.map((department) => (
            <option key={department} value={department}>{department}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading faculty…
        </div>
      ) : visibleFaculty.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Users className="mx-auto h-8 w-8 text-blue-400" />
          <p className="mt-3 text-sm font-semibold text-slate-800">
            {faculty.length === 0 ? 'No faculty accounts yet' : 'No faculty match your filters'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {faculty.length === 0
              ? 'Add a faculty member to give them access to the faculty portal.'
              : 'Try a different search term or department.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50/70 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Faculty</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Assigned classes</th>
                  <th className="px-5 py-3">Sessions</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleFaculty.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{member.fullName}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <Mail className="h-3 w-3" /> {member.email}
                      </p>
                      {member.mobile && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <Phone className="h-3 w-3" /> {member.mobile}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{member.department}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{member.designation}</p>
                      {member.officeRoom && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <Building2 className="h-3 w-3" /> {member.officeRoom}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[16rem] px-5 py-4 text-xs text-slate-600">
                      {member.assignedClasses || <span className="text-slate-400">Not assigned</span>}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-800">{member.totalSessions ?? 0}</td>
                    <td className="px-5 py-4"><StatusPill status={member.accountStatus} /></td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(member)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => toggleStatus(member)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                            member.accountStatus === 'active'
                              ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {member.accountStatus === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {visibleFaculty.length} of {faculty.length} faculty member{faculty.length === 1 ? '' : 's'}
          </div>
        </div>
      )}

      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={editing ? 'Edit Faculty Member' : 'Add Faculty Member'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={saveFaculty} className="space-y-4" noValidate>
          {formError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
              {formError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              Full name
              <input name="fullName" value={form.fullName} onChange={updateField} maxLength={100} required className={`${fieldClass} mt-1.5`} />
              {fieldErrors.fullName && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.fullName}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Email
              <input name="email" type="email" value={form.email} onChange={updateField} maxLength={254} required className={`${fieldClass} mt-1.5`} />
              {fieldErrors.email && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.email}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {editing ? 'New password (optional)' : 'Temporary password'}
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={updateField}
                minLength={6}
                required={!editing}
                autoComplete="new-password"
                className={`${fieldClass} mt-1.5`}
              />
              <span className="mt-1 block font-normal text-slate-500">
                {editing ? 'Leave blank to keep the current password.' : 'At least 6 characters.'}
              </span>
              {fieldErrors.password && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.password}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Department
              <input name="department" value={form.department} onChange={updateField} maxLength={50} required className={`${fieldClass} mt-1.5`} />
              {fieldErrors.department && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.department}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Designation
              <input name="designation" value={form.designation} onChange={updateField} maxLength={50} required className={`${fieldClass} mt-1.5`} />
              {fieldErrors.designation && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.designation}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Mobile
              <input name="mobile" type="tel" value={form.mobile} onChange={updateField} maxLength={20} className={`${fieldClass} mt-1.5`} />
              {fieldErrors.mobile && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.mobile}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Office room
              <input name="officeRoom" value={form.officeRoom} onChange={updateField} maxLength={50} className={`${fieldClass} mt-1.5`} />
            </label>
            {editing && (
              <label className="text-xs font-semibold text-slate-700">
                Account status
                <select name="accountStatus" value={form.accountStatus} onChange={updateField} className={`${fieldClass} mt-1.5`}>
                  {ACCOUNT_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closeForm} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Faculty'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Faculty;
