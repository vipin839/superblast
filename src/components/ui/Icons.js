'use client';

/**
 * One icon set for the whole application.
 * 24x24 stroke icons, currentColor, sized by CSS (`svg { width: … }`).
 * Hand-authored so BLASTHub carries no icon-library dependency.
 */

function Svg({ children, filled = false, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ── Brand ── */
export const Helix = (p) => (
  <Svg {...p}>
    <path d="M6 3c0 5 12 5 12 9s-12 4-12 9" />
    <path d="M18 3c0 5-12 5-12 9s12 4 12 9" />
    <path d="M8.5 7h7M8.5 17h7M7 12h10" />
  </Svg>
);

/* ── Navigation ── */
export const Grid = (p) => (
  <Svg {...p}><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></Svg>
);
export const Search = (p) => (<Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>);
export const History = (p) => (<Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3.5 2" /></Svg>);
export const Settings = (p) => (<Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1.9a2 2 0 1 1 0-4H2a1.7 1.7 0 0 0 1.5-2.6 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3.5h.1A1.7 1.7 0 0 0 10.2 2v-.2a2 2 0 1 1 4 0V2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4H22a1.7 1.7 0 0 0-1.6 1.1Z" /></Svg>
);

/* ── Actions ── */
export const Plus = (p) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>);
export const Upload = (p) => (<Svg {...p}><path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" /><path d="m8 8 4-4 4 4" /><path d="M12 4v12" /></Svg>);
export const Download = (p) => (<Svg {...p}><path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" /><path d="m8 11 4 4 4-4" /><path d="M12 3v12" /></Svg>);
export const Trash = (p) => (<Svg {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></Svg>);
export const X = (p) => (<Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>);
export const Check = (p) => (<Svg {...p}><path d="m20 6-11 11-5-5" /></Svg>);
export const Copy = (p) => (<Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>);
export const Refresh = (p) => (<Svg {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></Svg>);
export const Stop = (p) => (<Svg {...p}><rect x="5" y="5" width="14" height="14" rx="3" /></Svg>);
export const Filter = (p) => (<Svg {...p}><path d="M3 5h18l-7 8v6l-4 2v-8Z" /></Svg>);
export const External = (p) => (<Svg {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></Svg>);
export const LogOut = (p) => (<Svg {...p}><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" /><path d="m16 16 4-4-4-4" /><path d="M20 12H9" /></Svg>);

/* ── Chevrons ── */
export const ChevronRight = (p) => (<Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>);
export const ChevronLeft = (p) => (<Svg {...p}><path d="m15 6-6 6 6 6" /></Svg>);
export const ChevronDown = (p) => (<Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>);
export const ChevronsLeft = (p) => (<Svg {...p}><path d="m11 6-6 6 6 6M18 6l-6 6 6 6" /></Svg>);
export const ChevronsRight = (p) => (<Svg {...p}><path d="m13 6 6 6-6 6M6 6l6 6-6 6" /></Svg>);
export const Menu = (p) => (<Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>);
export const SortAsc = (p) => (<Svg {...p}><path d="m6 15 6-6 6 6" /></Svg>);
export const SortDesc = (p) => (<Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>);
export const SortNone = (p) => (<Svg {...p}><path d="m7 10 5-5 5 5M7 14l5 5 5-5" /></Svg>);

/* ── Domain ── */
export const File = (p) => (<Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></Svg>);
export const Database = (p) => (<Svg {...p}><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /><path d="M4 11.5v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></Svg>);
export const Beaker = (p) => (<Svg {...p}><path d="M9 3v6.2L4.4 17A2 2 0 0 0 6.1 20h11.8a2 2 0 0 0 1.7-3L15 9.2V3" /><path d="M8 3h8" /><path d="M6.5 14h11" /></Svg>);
export const Sparkle = (p) => (<Svg {...p}><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11l5.6-1.9Z" /><path d="M18.5 4v3M20 5.5h-3" /></Svg>);
export const Chart = (p) => (<Svg {...p}><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m7 15 3.5-4 3 2.5L19 7" /></Svg>);
export const Align = (p) => (<Svg {...p}><path d="M4 7h16M4 12h10M4 17h16" /></Svg>);
export const Table = (p) => (<Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></Svg>);
export const Clock = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>);
export const Shield = (p) => (<Svg {...p}><path d="M12 3 5 6v5.5c0 4.3 2.9 8.3 7 9.5 4.1-1.2 7-5.2 7-9.5V6Z" /><path d="m9.5 12 1.8 1.8 3.4-3.6" /></Svg>);
export const Cloud = (p) => (<Svg {...p}><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19Z" /></Svg>);
export const Doc = (p) => (<Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></Svg>);
export const Sheet = (p) => (<Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9.5h18M3 15h18M9 4v16M15 4v16" /></Svg>);
export const Braces = (p) => (<Svg {...p}><path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" /><path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" /></Svg>);

/* ── Status ── */
export const Alert = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></Svg>);
export const Info = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16.5v-5M12 8h.01" /></Svg>);
export const CheckCircle = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></Svg>);
export const Sun = (p) => (<Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>);
export const Moon = (p) => (<Svg {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></Svg>);

/* ── Third-party ── */
export const Google = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);
export const Github = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
    <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
  </svg>
);
export const Linkedin = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
  </svg>
);
export const Mail = (p) => (<Svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></Svg>);
