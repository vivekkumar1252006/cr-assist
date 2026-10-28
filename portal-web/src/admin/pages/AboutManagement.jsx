import React, { useEffect, useState, useRef } from 'react';
import {
  Sparkles,
  Code2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Mail,
  Phone,
  Layers,
  UploadCloud,
  X,
  User,
  Info,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { Modal } from '../components/Modal.jsx';

const EMPTY_APP_CARD = {
  id: null,
  title: '',
  subtitle: '',
  badge: 'Core Platform',
  description: '',
  features: [
    { title: 'Fast QR Attendance', description: 'Time-rotating QR code system for live lectures.' },
    { title: 'Attendance Grievance Desk', description: 'Submit complaints with attached evidence.' },
  ],
  sortOrder: 1,
};

const EMPTY_DEVELOPER = {
  id: null,
  name: '',
  role: 'App & Portal Developer',
  email: '',
  phone: '',
  bio: '',
  sortOrder: 1,
  photo: null,
};

export function AboutManagement() {
  const [appCards, setAppCards] = useState([]);
  const [developers, setDevelopers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // App Card Modal States
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [appForm, setAppForm] = useState(EMPTY_APP_CARD);
  const [appSubmitting, setAppSubmitting] = useState(false);
  const [appModalError, setAppModalError] = useState('');

  // Developer Modal States
  const [devModalOpen, setDevModalOpen] = useState(false);
  const [devForm, setDevForm] = useState(EMPTY_DEVELOPER);
  const [devPhotoPreview, setDevPhotoPreview] = useState('');
  const [devSubmitting, setDevSubmitting] = useState(false);
  const [devModalError, setDevModalError] = useState('');
  const photoInputRef = useRef(null);

  // Delete Confirmation Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'app'|'dev', id, name }
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/about');
      setAppCards(res.data?.appCards || []);
      setDevelopers(res.data?.developers || []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // --------------------------------------------------------------------------
  // App Card Handlers
  // --------------------------------------------------------------------------
  function openCreateAppCard() {
    setAppForm(EMPTY_APP_CARD);
    setAppModalError('');
    setAppModalOpen(true);
  }

  function openEditAppCard(card) {
    setAppForm({
      id: card.id,
      title: card.title,
      subtitle: card.subtitle || '',
      badge: card.badge || '',
      description: card.description,
      features: Array.isArray(card.features) ? card.features : [],
      sortOrder: card.sortOrder || 1,
    });
    setAppModalError('');
    setAppModalOpen(true);
  }

  function handleAddFeature() {
    setAppForm((prev) => ({
      ...prev,
      features: [...prev.features, { title: '', description: '' }],
    }));
  }

  function handleFeatureChange(index, field, value) {
    setAppForm((prev) => {
      const updated = [...prev.features];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, features: updated };
    });
  }

  function handleRemoveFeature(index) {
    setAppForm((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index),
    }));
  }

  async function handleAppCardSubmit(e) {
    e.preventDefault();
    if (!appForm.title.trim()) {
      setAppModalError('Card title is required.');
      return;
    }
    if (!appForm.description.trim()) {
      setAppModalError('Card description is required.');
      return;
    }

    setAppSubmitting(true);
    setAppModalError('');

    try {
      if (appForm.id) {
        // Update
        const res = await api.put(`/about/app-cards/${appForm.id}`, appForm);
        setAppCards((prev) => prev.map((c) => (c.id === appForm.id ? res.data.card : c)));
        setSuccessMessage('About App card updated successfully.');
      } else {
        // Create
        const res = await api.post('/about/app-cards', appForm);
        setAppCards((prev) => [...prev, res.data.card]);
        setSuccessMessage('About App card added successfully.');
      }
      setAppModalOpen(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setAppModalError(parseApiError(err).message);
    } finally {
      setAppSubmitting(false);
    }
  }

  // --------------------------------------------------------------------------
  // Developer Handlers
  // --------------------------------------------------------------------------
  function openCreateDeveloper() {
    setDevForm(EMPTY_DEVELOPER);
    setDevPhotoPreview('');
    setDevModalError('');
    setDevModalOpen(true);
  }

  function openEditDeveloper(dev) {
    setDevForm({
      id: dev.id,
      name: dev.name,
      role: dev.role,
      email: dev.email,
      phone: dev.phone,
      bio: dev.bio || '',
      sortOrder: dev.sortOrder || 1,
      photo: null,
      photoUrl: dev.photoUrl,
    });
    setDevPhotoPreview(dev.photoUrl || '');
    setDevModalError('');
    setDevModalOpen(true);
  }

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setDevModalError('Please choose a valid image file (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setDevModalError('Image file must be under 5 MB.');
      return;
    }

    setDevForm((prev) => ({ ...prev, photo: file }));
    const url = URL.createObjectURL(file);
    setDevPhotoPreview(url);
  }

  async function handleDeveloperSubmit(e) {
    e.preventDefault();
    if (!devForm.name.trim()) {
      setDevModalError('Developer name is required.');
      return;
    }
    if (!devForm.email.trim()) {
      setDevModalError('Email address is required.');
      return;
    }
    if (!devForm.phone.trim()) {
      setDevModalError('Phone number is required.');
      return;
    }

    setDevSubmitting(true);
    setDevModalError('');

    try {
      const formData = new FormData();
      formData.append('name', devForm.name.trim());
      formData.append('role', devForm.role.trim());
      formData.append('email', devForm.email.trim());
      formData.append('phone', devForm.phone.trim());
      formData.append('bio', devForm.bio.trim());
      formData.append('sortOrder', devForm.sortOrder || 1);
      if (devForm.photo) {
        formData.append('photo', devForm.photo);
      }

      if (devForm.id) {
        // Update
        const res = await api.put(`/about/developers/${devForm.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setDevelopers((prev) => prev.map((d) => (d.id === devForm.id ? res.data.developer : d)));
        setSuccessMessage('Developer profile updated successfully.');
      } else {
        // Create
        const res = await api.post('/about/developers', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setDevelopers((prev) => [...prev, res.data.developer]);
        setSuccessMessage('Developer profile added successfully.');
      }
      setDevModalOpen(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setDevModalError(parseApiError(err).message);
    } finally {
      setDevSubmitting(false);
    }
  }

  // --------------------------------------------------------------------------
  // Delete Handlers
  // --------------------------------------------------------------------------
  function confirmDelete(type, id, name) {
    setDeleteTarget({ type, id, name });
    setDeleteError('');
    setDeleteModalOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');

    try {
      if (deleteTarget.type === 'app') {
        await api.delete(`/about/app-cards/${deleteTarget.id}`);
        setAppCards((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setSuccessMessage('About App card deleted successfully.');
      } else if (deleteTarget.type === 'dev') {
        await api.delete(`/about/developers/${deleteTarget.id}`);
        setDevelopers((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        setSuccessMessage('Developer profile deleted successfully.');
      }
      setDeleteModalOpen(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setDeleteError(parseApiError(err).message);
    } finally {
      setDeleting(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
              About Page Management
            </h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              Live Portal
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Manage About App cards (portal description, key features) and Developer profiles.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            className="text-xs font-bold text-emerald-700 underline"
          >
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
          <button onClick={loadData} className="text-xs font-bold underline">
            Retry
          </button>
        </div>
      )}

      {/* ====================================================================
          SECTION 1: ABOUT APP CARDS
         ==================================================================== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">About App Cards</h3>
              <p className="text-xs text-slate-500">
                Portal introduction, purpose, and key feature highlights
              </p>
            </div>
          </div>

          <button
            onClick={openCreateAppCard}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Add App Card
          </button>
        </div>

        {loading && !appCards.length ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading App cards...</div>
        ) : appCards.length === 0 ? (
          <div className="py-8 text-center">
            <Info className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No About App cards found</p>
            <p className="text-xs text-slate-500 mt-1">
              Click &quot;Add App Card&quot; above to create one.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            {appCards.map((card) => (
              <div
                key={card.id}
                className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-slate-900 text-base">{card.title}</h4>
                      {card.badge && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                          {card.badge}
                        </span>
                      )}
                    </div>
                    {card.subtitle && (
                      <p className="text-xs font-semibold text-blue-700 mt-0.5">{card.subtitle}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditAppCard(card)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5 text-blue-600" /> Edit
                    </button>
                    <button
                      onClick={() => confirmDelete('app', card.id, card.title)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-2xs hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Delete
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {card.description}
                </p>

                {/* Features list */}
                {card.features && card.features.length > 0 && (
                  <div className="rounded-xl border border-slate-200/60 bg-white p-3.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                      Key Features ({card.features.length})
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {card.features.map((feat, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-bold text-slate-900">• {feat.title}:</span>{' '}
                          <span className="text-slate-600">{feat.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ====================================================================
          SECTION 2: ABOUT DEVELOPER PROFILES
         ==================================================================== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Developer Profiles</h3>
              <p className="text-xs text-slate-500">
                Manage developer profiles, photo, contact information, and role
              </p>
            </div>
          </div>

          <button
            onClick={openCreateDeveloper}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Add Developer
          </button>
        </div>

        {loading && !developers.length ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading developers...</div>
        ) : developers.length === 0 ? (
          <div className="py-8 text-center">
            <User className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No developer profiles yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Click &quot;Add Developer&quot; to publish developer details.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {developers.map((dev) => (
              <div
                key={dev.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5 flex flex-col justify-between space-y-4"
              >
                <div className="flex items-start gap-4">
                  {/* Photo / Avatar */}
                  <div className="shrink-0">
                    {dev.hasPhoto && dev.photoUrl ? (
                      <img
                        src={dev.photoUrl}
                        alt={dev.name}
                        className="h-16 w-16 rounded-2xl object-cover border border-slate-200 shadow-xs"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xl border border-indigo-200">
                        {dev.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-slate-900 text-base truncate">{dev.name}</h4>
                    <p className="text-xs font-semibold text-indigo-700 mt-0.5">{dev.role}</p>

                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{dev.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{dev.phone}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {dev.bio && (
                  <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-200/60 pt-2.5">
                    {dev.bio}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-slate-200/60 pt-3">
                  <button
                    onClick={() => openEditDeveloper(dev)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5 text-indigo-600" /> Edit
                  </button>
                  <button
                    onClick={() => confirmDelete('dev', dev.id, dev.name)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-2xs hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ====================================================================
          MODAL 1: ADD / EDIT APP CARD
         ==================================================================== */}
      <Modal
        isOpen={appModalOpen}
        onClose={() => !appSubmitting && setAppModalOpen(false)}
        title={appForm.id ? 'Edit About App Card' : 'Add About App Card'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleAppCardSubmit} className="space-y-4">
          {appModalError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              {appModalError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Card Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={appForm.title}
                onChange={(e) => setAppForm({ ...appForm, title: e.target.value })}
                placeholder="e.g. Class Representative Assist"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Badge / Tag
              </label>
              <input
                type="text"
                value={appForm.badge}
                onChange={(e) => setAppForm({ ...appForm, badge: e.target.value })}
                placeholder="e.g. Core Platform / Version 2.0"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Subtitle
            </label>
            <input
              type="text"
              value={appForm.subtitle}
              onChange={(e) => setAppForm({ ...appForm, subtitle: e.target.value })}
              placeholder="e.g. Official College ERP & Attendance Management Portal"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={appForm.description}
              onChange={(e) => setAppForm({ ...appForm, description: e.target.value })}
              placeholder="Describe the portal, its purpose, target audience, and workflow..."
              className={inputClass}
            />
          </div>

          {/* Key Features Sub-Form */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Key Features
              </label>
              <button
                type="button"
                onClick={handleAddFeature}
                className="text-xs font-bold text-blue-600 hover:text-blue-800"
              >
                + Add Feature
              </button>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {appForm.features.map((feat, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5"
                >
                  <div className="flex-1 space-y-1.5">
                    <input
                      type="text"
                      placeholder="Feature Title (e.g. Fast QR Attendance)"
                      value={feat.title}
                      onChange={(e) => handleFeatureChange(idx, 'title', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Short description..."
                      value={feat.description}
                      onChange={(e) => handleFeatureChange(idx, 'description', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(idx)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={appSubmitting}
              onClick={() => setAppModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={appSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {appSubmitting ? 'Saving...' : appForm.id ? 'Save Changes' : 'Create Card'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ====================================================================
          MODAL 2: ADD / EDIT DEVELOPER PROFILE
         ==================================================================== */}
      <Modal
        isOpen={devModalOpen}
        onClose={() => !devSubmitting && setDevModalOpen(false)}
        title={devForm.id ? 'Edit Developer Profile' : 'Add Developer Profile'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleDeveloperSubmit} className="space-y-4">
          {devModalError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              {devModalError}
            </div>
          )}

          {/* Profile Picture Upload */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Profile Picture
            </label>
            <div className="flex items-center gap-4">
              {devPhotoPreview ? (
                <img
                  src={devPhotoPreview}
                  alt="Preview"
                  className="h-16 w-16 rounded-2xl object-cover border border-slate-200 shadow-xs"
                />
              ) : (
                <div className="h-16 w-16 rounded-2xl bg-indigo-50 text-indigo-500 border border-indigo-200 flex items-center justify-center">
                  <User className="h-7 w-7" />
                </div>
              )}

              <div className="space-y-1">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  <UploadCloud className="h-3.5 w-3.5 text-indigo-600" />
                  {devPhotoPreview ? 'Change Photo' : 'Upload Photo'}
                </button>
                <p className="text-[11px] text-slate-400">JPG, PNG, or WebP (Max 5 MB)</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Developer Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={devForm.name}
                onChange={(e) => setDevForm({ ...devForm, name: e.target.value })}
                placeholder="e.g. Arun Singh"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Role / Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={devForm.role}
                onChange={(e) => setDevForm({ ...devForm, role: e.target.value })}
                placeholder="e.g. App & Portal Developer"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={devForm.email}
                onChange={(e) => setDevForm({ ...devForm, email: e.target.value })}
                placeholder="e.g. arunsingh2364@gmail.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={devForm.phone}
                onChange={(e) => setDevForm({ ...devForm, phone: e.target.value })}
                placeholder="e.g. 9425357841"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Bio / Summary
            </label>
            <textarea
              rows={3}
              value={devForm.bio}
              onChange={(e) => setDevForm({ ...devForm, bio: e.target.value })}
              placeholder="Short bio about the developer..."
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={devSubmitting}
              onClick={() => setDevModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={devSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {devSubmitting ? 'Saving...' : devForm.id ? 'Save Changes' : 'Create Profile'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ====================================================================
          MODAL 3: DELETE CONFIRMATION
         ==================================================================== */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => !deleting && setDeleteModalOpen(false)}
        title="Confirm Deletion"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Are you sure?</h4>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                You are about to delete{' '}
                <strong className="text-slate-800">{deleteTarget?.name}</strong>. This item will be
                permanently removed from the database and the student portal.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              {deleteError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDeleteConfirm}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
export default AboutManagement;

