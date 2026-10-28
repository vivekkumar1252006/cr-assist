import React, { useEffect, useState } from 'react';

function resolvePhotoUrl(rawUrl) {
  if (!rawUrl) return null;
  if (/^(https?:)?\/\//i.test(rawUrl) || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  return rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
}

export function InchargePhoto({ contact, size = 'h-20 w-20' }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [contact?.photoUrl]);

  const photoSrc = resolvePhotoUrl(contact?.photoUrl);
  const initials = contact?.name
    ? contact.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : 'IC';

  return (
    <div className={`${size} grid shrink-0 place-items-center overflow-hidden rounded-full bg-blue-100 text-xl font-bold text-blue-700 ring-4 ring-blue-50`}>
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
    </div>
  );
}
