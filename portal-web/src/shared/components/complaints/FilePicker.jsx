import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, FileText, FolderOpen, Loader2, Plus, RotateCcw, UploadCloud, X } from 'lucide-react';
import CameraCapture, { canUseLiveCamera } from './CameraCapture.jsx';
import { ACCEPT_ATTR, MAX_FILE_BYTES, checkFile, formatBytes } from '../../lib/complaints.js';

let nextId = 1;
/** Wraps a File for the picker list. status: ready | uploading | done | error */
export const makeItem = (file) => ({
  id: nextId++,
  file,
  previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
  status: 'ready',
  progress: 0,
  error: null,
});

/**
 * Evidence picker: drag & drop, "Choose files" (existing files, multiple) and "Take photo"
 * (new photo from the camera) — kept as two clearly separate actions.
 */
export default function FilePicker({ items, onChange, maxFiles = 10, maxBytes = MAX_FILE_BYTES, disabled = false, onRetry, addButtonLabel }) {
  const fileInput = useRef(null);
  const captureInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Revoke preview URLs when items are removed/unmounted.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl)), []);

  function add(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const problems = [];
    const accepted = [];
    for (const f of files) {
      const err = checkFile(f, maxBytes);
      if (err) problems.push(err);
      else if (items.length + accepted.length >= maxFiles) problems.push(`${f.name}: you can attach at most ${maxFiles} files.`);
      else accepted.push(makeItem(f));
    }
    setErrors(problems);
    if (accepted.length) onChange([...items, ...accepted]);
  }

  function remove(id) {
    const item = items.find((i) => i.id === id);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    onChange(items.filter((i) => i.id !== id));
  }

  function takePhoto() {
    if (canUseLiveCamera()) setCameraOpen(true);
    else captureInput.current?.click(); // mobile fallback: opens the native camera app
  }

  const full = items.length >= maxFiles;
  const btn =
    'inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-5 text-center transition ${
          dragging ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-slate-50/60'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <UploadCloud className="mx-auto h-8 w-8 text-teal-600" />
        <p className="mt-2 text-sm font-semibold text-navy-900">
          {items.length ? 'Add more evidence' : 'Drag & drop files here'}
        </p>
        <p className="text-xs text-slate-500">
          JPEG, PNG, WebP or PDF · up to {formatBytes(maxBytes)} each · max {maxFiles} files
        </p>
        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <button type="button" disabled={disabled || full} onClick={() => fileInput.current?.click()} className={`${btn} border-slate-200 bg-white text-navy-800 hover:bg-slate-50`}>
            {addButtonLabel ? <Plus className="h-4 w-4" /> : items.length ? <Plus className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
            {addButtonLabel ?? (items.length ? 'Add More Files' : 'Choose Existing Files')}
          </button>
          <button type="button" disabled={disabled || full} onClick={takePhoto} className={`${btn} border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100`}>
            <Camera className="h-4 w-4" /> Take New Photo
          </button>
        </div>
        <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <input ref={captureInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
          {errors.map((e) => (
            <li key={e} className="flex gap-1.5"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}</li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileText className="h-6 w-6 text-red-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-navy-900" title={item.file.name}>{item.file.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(item.file.size)}</p>
                {item.status === 'uploading' && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-teal-500 transition-[width]" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
                {item.status === 'done' && <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Uploaded</p>}
                {item.status === 'error' && <p className="mt-1 text-xs font-medium text-red-700">{item.error}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                {item.status === 'uploading' ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-teal-700"><Loader2 className="h-3.5 w-3.5 animate-spin" />{item.progress}%</span>
                ) : item.status === 'error' && onRetry ? (
                  <button type="button" onClick={() => onRetry(item.id)} className="rounded-lg p-1 text-teal-700 hover:bg-teal-50" aria-label={`Retry ${item.file.name}`}>
                    <RotateCcw className="h-4 w-4" />
                  </button>
                ) : null}
                {item.status !== 'uploading' && item.status !== 'done' && !disabled && (
                  <button type="button" onClick={() => remove(item.id)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${item.file.name}`}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => add([file])}
        onUnavailable={() => captureInput.current?.click()}
      />
    </div>
  );
}
