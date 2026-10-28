import React, { useEffect } from 'react';
import { Download, FileQuestion, X } from 'lucide-react';
import { formatBytes } from '@shared/lib/complaints.js';

// Formats the browser can render on its own inside the portal. SVG is deliberately
// excluded: it can carry scripts, so it is offered as a download only.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
const TEXT_TYPES = ['text/plain', 'text/csv'];

/** Returns 'image' | 'pdf' | 'text' for previewable MIME types, otherwise null. */
export function previewKind(mimeType) {
  const mime = String(mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (IMAGE_TYPES.includes(mime)) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (TEXT_TYPES.includes(mime)) return 'text';
  return null;
}

export const attachmentUrl = (complaintId, attachmentId) => `/api/complaints/${complaintId}/attachments/${attachmentId}`;

/**
 * Full-screen in-portal viewer for an uploaded evidence file. Images render inline,
 * PDFs and plain text render in an embedded frame. Files that cannot be previewed
 * never reach this component — the caller shows a Download button instead.
 */
export function AttachmentPreview({ attachment, complaintId, onClose }) {
  const kind = previewKind(attachment.mime_type);
  const url = attachmentUrl(complaintId, attachment.id);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-900" title={attachment.original_filename}>
              {attachment.original_filename}
            </h3>
            <p className="text-[11px] text-slate-500">
              {formatBytes(Number(attachment.file_size) || 0)} · Evidence preview
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`${url}?download=1`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-xs transition hover:bg-blue-50 hover:text-blue-700"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100/70 p-3">
          {kind === 'image' && (
            <img
              src={url}
              alt={attachment.original_filename}
              className="mx-auto max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-sm"
            />
          )}
          {(kind === 'pdf' || kind === 'text') && (
            <iframe
              src={url}
              title={attachment.original_filename}
              className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white"
            />
          )}
          {!kind && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <FileQuestion className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">This file can’t be previewed in the browser.</p>
              <a
                href={`${url}?download=1`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700"
              >
                <Download className="h-3.5 w-3.5" /> Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AttachmentPreview;
