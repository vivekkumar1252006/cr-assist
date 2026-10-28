import React, { useEffect, useState } from 'react';
import { Building2, Plus, Loader2, CheckCircle, AlertCircle, Pencil, Trash2 } from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { Modal } from '../components/Modal.jsx';

// Mirrors the server rules so bad input is caught before the request.
const CODE_RE = /^[A-Z0-9]{2,20}$/;

function validate({ code, name }) {
  const next = {};
  if (!code.trim()) next.code = 'Department code is required.';
  else if (!CODE_RE.test(code.trim().toUpperCase())) next.code = 'Code must be 2–20 letters or digits (e.g. CSE, MBA).';
  if (!name.trim()) next.name = 'Department name is required.';
  else if (name.trim().length > 100) next.name = 'Department name must be 100 characters or fewer.';
  return next;
}

export function ClassesDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({ code: '', name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ code: '', name: '' });
  const [editErrors, setEditErrors] = useState({});
  const [editError, setEditError] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const fetchDepartments = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/departments');
      setDepartments(res.data.departments || []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    const errors = validate(form);
    if (Object.keys(errors).length) {
      setFormError(errors.code || errors.name);
      return;
    }

    // Client-side duplicate check against the currently loaded list.
    const code = form.code.trim().toUpperCase();
    if (departments.some((d) => d.code === code)) {
      setFormError(`A department with code "${code}" already exists.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/admin/departments', { code, name: form.name.trim() });
      setSuccess(res.data.message || 'Department added successfully.');
      setForm({ code: '', name: '' });
      fetchDepartments(true);
    } catch (err) {
      setFormError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (d) => {
    setEditTarget(d);
    setEditForm({ code: d.code, name: d.name });
    setEditErrors({});
    setEditError(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError(null);

    const errors = validate(editForm);
    setEditErrors(errors);
    if (Object.keys(errors).length) return;

    const code = editForm.code.trim().toUpperCase();
    // Reject a code that belongs to a different department.
    if (departments.some((d) => d.id !== editTarget.id && d.code === code)) {
      setEditErrors({ code: `A department with code "${code}" already exists.` });
      return;
    }

    setSavingEdit(true);
    try {
      const res = await api.put(`/admin/departments/${editTarget.id}`, { code, name: editForm.name.trim() });
      setSuccess(res.data.message || 'Department updated successfully.');
      setEditTarget(null);
      fetchDepartments(true);
    } catch (err) {
      setEditError(parseApiError(err).message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await api.delete(`/admin/departments/${deleteTarget.id}`);
      setSuccess(res.data.message || 'Department deleted successfully.');
      setDeleteTarget(null);
      fetchDepartments(true);
    } catch (err) {
      setDeleteError(parseApiError(err).message);
    } finally {
      setDeleting(false);
    }
  };

  const fieldClass = (hasError) =>
    `w-full px-3 py-2 rounded-xl border ${hasError ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Departments</h2>
        <p className="text-xs text-slate-500 mt-0.5">Add the academic departments offered by the college.</p>
      </div>

      {/* Add Department */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-600" />
          Add Department
        </h3>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-3 items-end">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Department Code *</label>
              <input
                type="text"
                required
                maxLength={20}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. MBA"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 uppercase"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Department Name *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Master of Business Administration"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'Adding...' : 'Add Department'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Department List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900 text-sm">All Departments</h3>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {departments.length} {departments.length === 1 ? 'Department' : 'Departments'}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" />
            Loading departments...
          </div>
        ) : error ? (
          <div className="py-10 text-center text-rose-600 text-xs font-medium">{error}</div>
        ) : departments.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs">
            No departments yet. Add your first department above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {departments.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl p-4 border border-slate-200 hover:border-blue-300 transition-colors"
              >
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-extrabold text-xs">
                  {d.code}
                </span>
                <h4 className="font-bold text-slate-900 text-xs mt-2" title={d.name}>
                  {d.name}
                </h4>

                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => openEdit(d)}
                    title="Edit Department"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => {
                      setDeleteTarget(d);
                      setDeleteError(null);
                    }}
                    title="Delete Department"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ====================================================================== */}
      {/* EDIT DEPARTMENT MODAL                                                   */}
      {/* ====================================================================== */}
      <Modal
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit Department"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Department Code *</label>
            <input
              type="text"
              required
              maxLength={20}
              value={editForm.code}
              onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
              placeholder="e.g. MBA"
              className={`${fieldClass(editErrors.code)} uppercase`}
            />
            {editErrors.code && <p className="mt-1 text-[11px] font-semibold text-rose-600">{editErrors.code}</p>}
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Department Name *</label>
            <input
              type="text"
              required
              maxLength={100}
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="e.g. Master of Business Administration"
              className={fieldClass(editErrors.name)}
            />
            {editErrors.name && <p className="mt-1 text-[11px] font-semibold text-rose-600">{editErrors.name}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ====================================================================== */}
      {/* DELETE DEPARTMENT CONFIRMATION                                          */}
      {/* ====================================================================== */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Department"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-sm text-rose-800">
              <p className="font-bold">This will remove the department.</p>
              <p className="mt-1 text-xs leading-5">This cannot be undone.</p>
            </div>
          </div>

          {deleteTarget && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-extrabold text-[11px]">
                {deleteTarget.code}
              </span>
              <p className="font-bold text-slate-900 mt-2">{deleteTarget.name}</p>
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
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ClassesDepartments;
