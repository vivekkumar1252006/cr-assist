import { useEffect, useRef, useState } from 'react';
import { Check, Mail, Phone } from 'lucide-react';

function resolvePhotoUrl(rawUrl) {
  if (!rawUrl) return null;
  if (/^(https?:)?\/\//i.test(rawUrl) || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  return rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
}

export default function InchargeContactCard({ contact }) {
  const [imgError, setImgError] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => {
    setImgError(false);
  }, [contact?.photoUrl]);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  async function copyContact(value) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        let copied;
        try {
          input.select();
          copied = document.execCommand('copy');
        } finally {
          input.remove();
        }
        if (!copied) throw new Error('Clipboard copy was not successful.');
      }
      setCopyStatus('Copied successfully!');
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopyStatus(''), 2500);
    } catch {
      setCopyStatus('Unable to copy. Please copy the contact details manually.');
    }
  }

  const photoSrc = resolvePhotoUrl(contact?.photoUrl);
  const initials = contact?.name
    ? contact.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : 'IC';

  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm shadow-navy-900/[0.03]">
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
        <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-blue-100 to-navy-100 text-2xl font-bold text-navy-700 ring-4 ring-navy-50">
          {photoSrc && !imgError ? (
            <img
              src={photoSrc}
              alt={`${contact.name} profile`}
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            initials
          )}
        </span>
        <div className="mt-4 min-w-0 flex-1 sm:mt-1">
          <h2 className="text-xl font-bold text-navy-900">{contact.name}</h2>
          <p className="mt-1 text-sm font-medium text-blue-700">{contact.designation}</p>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600 sm:justify-start">
            <Mail className="h-4 w-4 shrink-0 text-navy-500" />
            <span className="break-all">{contact.email}</span>
          </p>
          <p className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-600 sm:justify-start">
            <Phone className="h-4 w-4 shrink-0 text-navy-500" />
            <span>{contact.phone}</span>
          </p>
          <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => copyContact(contact.phone)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 focus:outline-none focus:ring-4 focus:ring-navy-100"
            >
              <Phone className="h-4 w-4" /> Call
            </button>
            <button
              type="button"
              onClick={() => copyContact(contact.email)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-800 transition hover:bg-navy-50 focus:outline-none focus:ring-4 focus:ring-navy-100"
            >
              <Mail className="h-4 w-4" /> Email
            </button>
          </div>
          <p className="mt-3 min-h-5 text-sm font-medium text-emerald-700" role="status" aria-live="polite">
            {copyStatus && (
              <>
                {copyStatus === 'Copied successfully!' && <Check className="mr-1 inline h-4 w-4 align-text-bottom" />}
                {copyStatus}
              </>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}
