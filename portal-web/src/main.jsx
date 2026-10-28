import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRouter from './routes/index.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);

/* --- Intro splash controller ---------------------------------------------- */
// index.html paints an opaque splash the moment the page opens (so nothing behind
// it can flash) and counts time from first paint via window.__SPLASH_START.
// We keep it up for ~2s, then fade it out over the app. The splash only exists on
// a full page load/refresh; SPA navigations between routes never show it again.
const SPLASH_DURATION_MS = 2000;
const splash = document.getElementById('app-loading');

if (splash) {
  const shownFor = performance.now() - (window.__SPLASH_START ?? performance.now());
  const remaining = Math.max(0, SPLASH_DURATION_MS - shownFor);

  window.setTimeout(() => {
    splash.classList.add('splash-hide');
    // Unlock page scrolling as soon as the fade begins.
    document.documentElement.classList.remove('splash-loading');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    // Safety net in case the transitionend event never fires.
    window.setTimeout(() => splash.remove(), 900);
  }, remaining);
}
