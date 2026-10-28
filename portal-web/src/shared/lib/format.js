const locale = 'en-IN';

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDay = (value) =>
  value ? new Date(value).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

export const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : '—';

export const formatDob = (value) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null;

export const formatPercent = (value) => (value == null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1)}%`);

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
