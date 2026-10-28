import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  UploadCloud,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  FileBox,
  RefreshCw,
  Clock,
  User,
  HardDrive,
  Info,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { Modal } from '../components/Modal.jsx';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ManageApk() {
  const [apk, setApk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Form states
  const [appName, setAppName] = useState('Class Representative Assist');
  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState('1');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  // Upload status states
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false);

  async function fetchLatestApk() {
    setLoading(true);
    setFetchError('');
    try {
      const res = await api.get('/apk/latest');
      setApk(res.data?.apk || null);
    } catch (err) {
      setFetchError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLatestApk();
  }, []);

  function handleFileSelection(selectedFile) {
    setUploadError('');
    setSuccessMessage('');
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.apk') || selectedFile.size === 0) {
      setUploadError('Invalid file type. Please select a valid Android .apk file.');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (selectedFile.size > 150 * 1024 * 1024) {
      setUploadError('The selected APK file exceeds the 150 MB maximum size limit.');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFile(selectedFile);
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) {
      setUploadError('Please select an .apk file to upload.');
      return;
    }

    if (!versionName.trim()) {
      setUploadError('Please specify the version name (e.g. 1.0.0).');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadError('');
    setSuccessMessage('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('appName', appName.trim());
    formData.append('versionName', versionName.trim());
    formData.append('versionCode', versionCode.trim() || '1');
    formData.append('releaseNotes', releaseNotes.trim());

    try {
      const res = await api.post('/apk/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      setSuccessMessage(res.data?.message || 'APK uploaded and published successfully!');
      setApk(res.data?.apk || null);

      // Reset form
      setFile(null);
      setVersionName('');
      setReleaseNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(parseApiError(err).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete('/apk');
      setApk(null);
      setDeleteModalOpen(false);
      setSuccessMessage('APK release has been permanently deleted.');
    } catch (err) {
      setDeleteError(parseApiError(err).message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setUploadError('');
    try {
      const res = await api.get('/apk/download', { responseType: 'blob', timeout: 0 });
      const objectUrl = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${apk.appName.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${apk.versionName.replace(/[^a-zA-Z0-9._-]/g, '_')}.apk`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      let message = parseApiError(err).message;
      if (err.response?.data instanceof Blob) {
        try {
          const body = JSON.parse(await err.response.data.text());
          message = body.message || message;
        } catch {
          // Keep the fallback for a non-JSON server response.
        }
      }
      setUploadError(message);
    } finally {
      setDownloading(false);
    }
  }

  const fieldClass =
    'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Manage APK Release</h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              Android
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Upload, replace, and manage the official mobile APK for students to download.
          </p>
        </div>

        <button
          onClick={fetchLatestApk}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            className="text-xs font-bold text-emerald-700 underline hover:text-emerald-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {fetchError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{fetchError}</span>
          </div>
          <button onClick={fetchLatestApk} className="text-xs font-bold underline">
            Retry
          </button>
        </div>
      )}

      {/* Current APK Information Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Current Published APK</h3>
              <p className="text-xs text-slate-500">Live package distributed to students</p>
            </div>
          </div>

          {apk?.isAvailable && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live in Student Portal
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-500 mb-2" />
            Checking latest release status...
          </div>
        ) : apk ? (
          <div className="mt-5 space-y-6">
            {!apk.isAvailable && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This release record exists, but the APK file is missing from server storage.
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  App Name
                </div>
                <div className="mt-1 font-bold text-slate-900 truncate">{apk.appName}</div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Layers className="h-4 w-4 text-indigo-500" />
                  Version
                </div>
                <div className="mt-1 font-bold text-slate-900">
                  v{apk.versionName}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    (Code: {apk.versionCode || 1})
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <HardDrive className="h-4 w-4 text-emerald-500" />
                  File Size
                </div>
                <div className="mt-1 font-bold text-slate-900">{formatBytes(apk.fileSize)}</div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Uploaded At
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-900">
                  {formatDate(apk.uploadedAt)}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <FileBox className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-700">Package filename:</span>
                <span className="font-mono text-slate-600">{apk.fileName}</span>
              </div>
              {apk.uploaderName && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <User className="h-3.5 w-3.5" />
                  <span>Published by {apk.uploaderName}</span>
                </div>
              )}
            </div>

            {apk.releaseNotes && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Release Notes
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{apk.releaseNotes}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading || !apk.isAvailable}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {downloading ? 'Downloading...' : 'Download Current APK'}
              </button>

              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                <Trash2 className="h-4 w-4" />
                Delete APK
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
            <FileBox className="mx-auto h-10 w-10 text-slate-300" />
            <h4 className="mt-3 text-sm font-bold text-slate-800">No APK uploaded yet</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Students currently see a placeholder in the student portal. Upload an APK file below to publish it.
            </p>
          </div>
        )}
      </div>

      {/* Upload / Replace Form Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">
                {apk ? 'Replace Existing APK' : 'Upload New APK'}
              </h3>
              <p className="text-xs text-slate-500">
                {apk
                  ? 'Uploading a new file will automatically replace the existing version on disk.'
                  : 'Publish the latest Android APK build for student portal users.'}
              </p>
            </div>
          </div>
        </div>

        {uploadError && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
              <span>{uploadError}</span>
            </div>
            <button
              onClick={() => setUploadError('')}
              className="text-xs font-bold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleUpload} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                App Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={150}
                disabled={uploading}
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Class Representative Assist"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Version Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={50}
                disabled={uploading}
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g. 1.0.0 or 2.1.4"
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Version Code <span className="text-slate-400 font-normal">(Integer)</span>
              </label>
              <input
                type="number"
                min="1"
                max="4294967295"
                step="1"
                disabled={uploading}
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value)}
                placeholder="1"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Changelog / Release Notes
              </label>
              <input
                type="text"
                maxLength={60000}
                disabled={uploading}
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="What's new in this build (bug fixes, performance, UI updates)"
                className={fieldClass}
              />
            </div>
          </div>

          {/* File Picker / Drag and Drop Area */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Select APK File (.apk) <span className="text-rose-500">*</span>
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) {
                  handleFileSelection(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/50'
                  : file
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-slate-300 bg-slate-50/50 hover:border-blue-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".apk"
                disabled={uploading}
                onChange={(e) => handleFileSelection(e.target.files?.[0])}
                className="hidden"
              />

              {file ? (
                <div className="flex flex-col items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-3">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-900">{file.name}</p>
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    {formatBytes(file.size)} · Ready to upload
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="mt-3 text-xs font-semibold text-rose-600 hover:text-rose-800"
                  >
                    Choose different file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-3">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    Click to browse or drag and drop your APK file here
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Strictly accepts <strong>.apk</strong> files only (Max 150 MB). Package contents are verified on upload.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Upload Progress Bar */}
          {uploading && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                <span>Uploading APK package...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full bg-blue-600 transition-all duration-200 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-blue-700">
                Please do not close or navigate away from this page until the upload finishes.
              </p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={uploading || !file}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Uploading ({uploadProgress}%)
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" />
                  {apk ? 'Upload & Replace APK' : 'Publish APK Release'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => !deleting && setDeleteModalOpen(false)}
        title="Delete APK Release"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Confirm Deletion</h4>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete the published APK? Students will no longer be able to
                download the app until a new APK is uploaded.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              {deleteError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3">
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
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Yes, Delete APK
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
export default ManageApk;

