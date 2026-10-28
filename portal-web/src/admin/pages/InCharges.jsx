import React, { useEffect, useState } from 'react';
import { Mail, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { Modal } from '../components/Modal.jsx';
import { InchargePhoto } from '../components/InchargePhoto.jsx';

const EMPTY_FORM = { name: '', designation: '', email: '', phone: '', photo: null };
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function InCharges() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');

  async function loadContacts() {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/incharges');
      setContacts(data.contacts ?? []);
    } catch (err) {
      setLoadError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (!form.photo) {
      setPhotoPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(form.photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form.photo]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(contact) {
    setEditing(contact);
    setForm({ name: contact.name, designation: contact.designation, email: contact.email, phone: contact.phone, photo: null });
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  }

  function closeForm() {
    if (!saving) setFormOpen(false);
  }

  function updateField(event) {
    const { name, value, files } = event.target;
    if (name === 'photo') {
      const selected = files?.[0] ?? null;
      setForm((current) => ({ ...current, photo: selected }));
      setFieldErrors((current) => ({ ...current, photo: '' }));
      setFormError('');
      return;
    }
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
    setFormError('');
  }

  function validate() {
    const next = {};
    if (form.name.trim().length < 2 || form.name.trim().length > 100) next.name = 'Enter a name between 2 and 100 characters.';
    if (form.designation.trim().length < 2 || form.designation.trim().length > 100) next.designation = 'Enter a designation between 2 and 100 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    const phoneDigits = form.phone.replace(/\D/g, '').length;
    if (form.phone.trim().length > 30 || phoneDigits < 7 || phoneDigits > 15 || !/^[+\d\s().-]+$/.test(form.phone.trim())) {
      next.phone = 'Enter a valid phone number with 7 to 15 digits.';
    }
    if (!editing && !form.photo) next.photo = 'Choose a profile picture.';
    if (form.photo && !['image/jpeg', 'image/png', 'image/webp'].includes(form.photo.type)) next.photo = 'Choose a JPG, PNG or WebP image.';
    if (form.photo && form.photo.size > MAX_PHOTO_BYTES) next.photo = 'Profile picture must be 2 MB or smaller.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function saveContact(event) {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;
    setSaving(true);
    const body = new FormData();
    body.append('name', form.name.trim());
    body.append('designation', form.designation.trim());
    body.append('email', form.email.trim());
    body.append('phone', form.phone.trim());
    if (form.photo) body.append('photo', form.photo);

    try {
      if (editing) await api.put(`/incharges/${editing.id}`, body);
      else await api.post('/incharges', body);
      setFormOpen(false);
      await loadContacts();
    } catch (err) {
      setFormError(parseApiError(err).message);
      setFieldErrors(err.response?.data?.errors ?? {});
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/incharges/${deleteTarget.id}`);
      setContacts((current) => current.filter((contact) => contact.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(parseApiError(err).message);
    } finally {
      setDeleting(false);
    }
  }

  const fieldClass = 'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Manage In-Charge</h2>
          <p className="mt-1 text-xs text-slate-500">Manage the contacts shown in student Help &amp; Support.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add Contact
        </button>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{loadError}</span>
          <button onClick={loadContacts} className="font-semibold underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading in-charge contacts…</div>
      ) : contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <UserRound className="mx-auto h-8 w-8 text-blue-400" />
          <p className="mt-3 text-sm font-semibold text-slate-800">No in-charge contacts yet</p>
          <p className="mt-1 text-xs text-slate-500">Add a contact to display it on the student Help &amp; Support page.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((contact) => (
            <article key={contact.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <InchargePhoto contact={contact} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold text-slate-900">{contact.name}</h3>
                  <p className="mt-0.5 text-xs font-medium text-blue-700">{contact.designation}</p>
                </div>
              </div>
              <div className="mt-5 space-y-2 text-sm text-slate-600">
                <p className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-blue-500" /><span className="break-all">{contact.email}</span></p>
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-blue-500" />{contact.phone}</p>
              </div>
              <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
                <button onClick={() => openEdit(contact)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={() => { setDeleteError(''); setDeleteTarget(contact); }} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal isOpen={formOpen} onClose={closeForm} title={editing ? 'Edit In-Charge Contact' : 'Add In-Charge Contact'} maxWidth="max-w-xl">
        <form onSubmit={saveContact} className="space-y-4" noValidate>
          {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{formError}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              Name
              <input name="name" value={form.name} onChange={updateField} maxLength={100} required className={`${fieldClass} mt-1.5`} />
              {fieldErrors.name && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.name}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Designation
              <input name="designation" value={form.designation} onChange={updateField} maxLength={100} required className={`${fieldClass} mt-1.5`} />
              {fieldErrors.designation && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.designation}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Email
              <input name="email" type="email" value={form.email} onChange={updateField} maxLength={254} required className={`${fieldClass} mt-1.5`} />
              {fieldErrors.email && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.email}</span>}
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Phone number
              <input name="phone" type="tel" value={form.phone} onChange={updateField} maxLength={30} required className={`${fieldClass} mt-1.5`} />
              {fieldErrors.phone && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.phone}</span>}
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-700">
            Profile picture {editing ? '(optional)' : ''}
            {editing && !form.photo && <InchargePhoto contact={editing} size="mt-2 h-14 w-14 text-base" />}
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={updateField} required={!editing} className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
            {photoPreview && <img src={photoPreview} alt="Selected profile preview" className="mt-3 h-16 w-16 rounded-full object-cover ring-4 ring-blue-50" />}
            <span className="mt-1 block font-normal text-slate-500">JPG, PNG or WebP · maximum 2 MB</span>
            {fieldErrors.photo && <span className="mt-1 block font-medium text-rose-600">{fieldErrors.photo}</span>}
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closeForm} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Contact'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} title="Delete In-Charge Contact" maxWidth="max-w-md">
        <p className="text-sm leading-relaxed text-slate-600">
          Delete <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>? This contact will no longer appear on the student Help &amp; Support page.
        </p>
        {deleteError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{deleteError}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={deleteContact} disabled={deleting} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">{deleting ? 'Deleting…' : 'Delete Contact'}</button>
        </div>
      </Modal>
    </div>
  );
}

export default InCharges;
