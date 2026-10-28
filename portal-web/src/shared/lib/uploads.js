import { api, parseApiError } from './api.js';

/**
 * Uploads picker items one by one to a complaint, reporting per-file progress via
 * onUpdate(id, patch). Already-uploaded items are skipped. Returns the number that failed.
 */
export async function uploadAttachments(complaintId, items, onUpdate) {
  let failed = 0;
  for (const item of items) {
    if (item.status === 'done') continue;
    onUpdate(item.id, { status: 'uploading', progress: 0, error: null });
    const body = new FormData();
    body.append('file', item.file);
    try {
      await api.post(`/complaints/${complaintId}/attachments`, body, {
        timeout: 120000,
        onUploadProgress: (e) => e.total && onUpdate(item.id, { progress: Math.round((e.loaded / e.total) * 100) }),
      });
      onUpdate(item.id, { status: 'done', progress: 100 });
    } catch (err) {
      failed++;
      onUpdate(item.id, { status: 'error', error: parseApiError(err).message });
    }
  }
  return failed;
}
