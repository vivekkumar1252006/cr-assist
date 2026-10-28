/** Decorative college building + phone scanning a QR code. */
export default function CampusIllustration({ className = '' }) {
  return (
    <svg viewBox="0 0 420 300" className={className} role="img" aria-label="College campus with QR attendance">
      <defs>
        <linearGradient id="bldg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#d9e1f4" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="phone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>

      {/* ground */}
      <ellipse cx="200" cy="268" rx="190" ry="16" fill="#ffffff" opacity="0.08" />

      {/* trees */}
      <circle cx="40" cy="214" r="24" fill="#14b8a6" opacity="0.55" />
      <rect x="37" y="228" width="6" height="36" rx="2" fill="#5eead4" opacity="0.5" />
      <circle cx="356" cy="220" r="20" fill="#14b8a6" opacity="0.45" />
      <rect x="353" y="232" width="6" height="32" rx="2" fill="#5eead4" opacity="0.45" />

      {/* main building */}
      <polygon points="80,110 200,52 320,110" fill="#ffffff" opacity="0.95" />
      <polygon points="96,110 200,62 304,110" fill="#2dd4bf" opacity="0.9" />
      <rect x="80" y="110" width="240" height="12" fill="#ffffff" />
      <rect x="88" y="122" width="224" height="140" fill="url(#bldg)" />
      {[108, 148, 188, 228, 268].map((x) => (
        <rect key={x} x={x} y="132" width="14" height="120" rx="3" fill="#b3c3e8" opacity="0.85" />
      ))}
      <rect x="182" y="200" width="36" height="62" rx="18" fill="#182e63" />
      <circle cx="200" cy="90" r="10" fill="#ffffff" />
      <path d="M200 84v6l4 3" stroke="#182e63" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="76" y="258" width="248" height="8" rx="2" fill="#ffffff" opacity="0.9" />

      {/* phone with QR */}
      <g transform="translate(300 150) rotate(8)">
        <rect width="78" height="132" rx="14" fill="#0b1f4b" stroke="url(#phone)" strokeWidth="4" />
        <rect x="10" y="18" width="58" height="96" rx="6" fill="#ffffff" />
        <g fill="#0b1f4b">
          <rect x="17" y="34" width="16" height="16" rx="2" />
          <rect x="45" y="34" width="16" height="16" rx="2" />
          <rect x="17" y="62" width="16" height="16" rx="2" />
          <rect x="45" y="62" width="6" height="6" />
          <rect x="55" y="62" width="6" height="6" />
          <rect x="45" y="72" width="6" height="6" />
          <rect x="55" y="72" width="6" height="6" />
        </g>
        <rect x="14" y="56" width="50" height="2.5" rx="1" fill="#14b8a6">
          <animate attributeName="y" values="30;82;30" dur="2.6s" repeatCount="indefinite" />
        </rect>
        <rect x="18" y="92" width="42" height="12" rx="6" fill="#14b8a6" />
        <path d="M33 98l4 3 7-6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* graduation cap */}
      <g transform="translate(28 70) rotate(-10)">
        <polygon points="0,14 34,0 68,14 34,28" fill="#ffffff" opacity="0.9" />
        <path d="M14 20v14c0 6 40 6 40 0V20" fill="#5eead4" opacity="0.8" />
        <path d="M60 17v16" stroke="#2dd4bf" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
