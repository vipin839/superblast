'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMounted } from '@/lib/prefs';
import * as I from './Icons';

/* ═══════════════════════════════════════════════════════════
   Primitives. One component per job — the whole app uses these.
   ═══════════════════════════════════════════════════════════ */

const cx = (...a) => a.filter(Boolean).join(' ');

/* ── Button ────────────────────────────────────────────── */
export function Button({ variant = 'secondary', size, as: As = 'button', className, children, ...rest }) {
  return (
    <As className={cx('btn', `btn-${variant}`, size && `btn-${size}`, className)} {...rest}>
      {children}
    </As>
  );
}

export function IconButton({ label, variant, size, as: As = 'button', className, children, ...rest }) {
  return (
    <As
      className={cx('icon-btn', variant && `icon-btn-${variant}`, size && `icon-btn-${size}`, className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </As>
  );
}

/* ── Field / Input / Select ────────────────────────────── */
export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="err-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ className, ...rest }) {
  return <input className={cx('input', className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return <select className={cx('select', className)} {...rest}>{children}</select>;
}

export function SearchInput({ className, ...rest }) {
  return (
    <div className={cx('search-pill', className)}>
      <I.Search />
      <input type="search" className="input" {...rest} />
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segment({ options, value, onChange, label }) {
  return (
    <div className="segment" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          title={typeof o.label === 'string' ? o.label : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Card ──────────────────────────────────────────────── */
export function Card({ inverse = false, pad, className, children, ...rest }) {
  return (
    <div
      className={cx(inverse ? 'card-inv' : 'card', pad && (pad === 'lg' ? 'card-pad-lg' : 'card-pad'), className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, sub, actions, bordered = false }) {
  return (
    <div className={cx('card-head', bordered && 'bordered')}>
      <div style={{ minWidth: 0 }}>
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {actions && <div className="row g-2" style={{ flex: '0 0 auto' }}>{actions}</div>}
    </div>
  );
}

/* ── Metrics ───────────────────────────────────────────── */
export function Metric({ label, value, unit, foot, icon: Icon }) {
  return (
    <div className="metric">
      <div className="metric-label">{Icon && <Icon />}{label}</div>
      <div className="metric-value">{value}{unit && <small> {unit}</small>}</div>
      {foot && <div className="metric-foot">{foot}</div>}
    </div>
  );
}

export function Tile({ label, value }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}

/* ── Badge / StatusBadge ───────────────────────────────── */
export function Badge({ tone, className, children, ...rest }) {
  return <span className={cx('badge', tone && `badge-${tone}`, className)} {...rest}>{children}</span>;
}

/**
 * Status is never colour-only: each state carries a distinct glyph and word.
 */
const STATUS = {
  completed:   { tone: 'success', text: 'Completed',  glyph: 'check' },
  processing:  { tone: 'warning', text: 'Processing', glyph: 'dot' },
  failed:      { tone: 'error',   text: 'Failed',     glyph: 'alert' },
  terminated:  { tone: 'outline', text: 'Stopped',    glyph: 'stop' },
  queued:      { tone: 'info',    text: 'Queued',     glyph: 'clock' },
};

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.processing;
  return (
    <span className={cx('badge', `badge-${s.tone}`)}>
      {s.glyph === 'check' && <I.Check />}
      {s.glyph === 'alert' && <I.Alert />}
      {s.glyph === 'stop' && <I.Stop />}
      {s.glyph === 'clock' && <I.Clock />}
      {s.glyph === 'dot' && <span className="dot" />}
      {s.text}
    </span>
  );
}

/* ── Tabs ──────────────────────────────────────────────── */
export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.key === value);
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(tabs[(i + 1) % tabs.length].key); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(tabs[(i - 1 + tabs.length) % tabs.length].key); }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={value === t.key}
          tabIndex={value === t.key ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.key)}
        >
          {t.icon && <t.icon />}
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── Stepper ───────────────────────────────────────────── */
export function Stepper({ steps, current }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={s} className="step" data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
            <span className="step-dot">{state === 'done' ? <I.Check /> : i + 1}</span>
            <span className="step-name">{s}</span>
            {i < steps.length - 1 && <span className="step-rule" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Progress ──────────────────────────────────────────── */
export function Progress({ value, indeterminate = false, label }) {
  return (
    <div
      className={cx('progress', indeterminate && 'progress-indet')}
      role="progressbar"
      aria-label={label}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar" style={{ width: indeterminate ? undefined : `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/* ── States ────────────────────────────────────────────── */
export function EmptyState({ icon: Icon = I.Beaker, title, desc, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon /></div>
      <div className="empty-title">{title}</div>
      {desc && <p className="empty-desc">{desc}</p>}
      {action}
    </div>
  );
}

export function Callout({ tone = 'info', title, children, action }) {
  const Icon = tone === 'error' ? I.Alert : tone === 'warning' ? I.Alert : tone === 'accent' ? I.Sparkle : I.Info;
  return (
    <div className={cx('callout', `callout-${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon />
      <div className="grow">
        {title && <div className="callout-title">{title}</div>}
        <div>{children}</div>
        {action && <div style={{ marginTop: 'var(--s-3)' }}>{action}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className, style }) {
  return <div className={cx('skeleton', className)} style={style} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div className="stack g-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="sk-row" />)}
    </div>
  );
}

/* ── Tooltip ───────────────────────────────────────────── */
export function Tooltip({ text, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && <span role="tooltip" id={id} className="tip-bubble">{text}</span>}
    </span>
  );
}

/* ── Focus trap + Escape, shared by Modal and Drawer ───── */
function useDismissable(open, onClose, ref) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const node = ref.current;
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(node?.querySelectorAll(sel) || []);
    focusables()[0]?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [open, onClose, ref]);
}

function Portal({ children }) {
  // useMounted is backed by useSyncExternalStore, so no setState-in-effect.
  return useMounted() ? createPortal(children, document.body) : null;
}

/* ── Modal ─────────────────────────────────────────────── */
export function Modal({ open, onClose, title, desc, children, actions }) {
  const ref = useRef(null);
  useDismissable(open, onClose, ref);
  if (!open) return null;
  return (
    <Portal>
      <div className="scrim" onClick={onClose} />
      <div className="modal-wrap">
        <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
          <div>
            <h2 style={{ fontSize: 'var(--t-lg)' }}>{title}</h2>
            {desc && <p className="hint" style={{ marginTop: 'var(--s-2)' }}>{desc}</p>}
          </div>
          {children}
          {actions && <div className="modal-actions">{actions}</div>}
        </div>
      </div>
    </Portal>
  );
}

/* ── Drawer ────────────────────────────────────────────── */
export function Drawer({ open, onClose, title, sub, children }) {
  const ref = useRef(null);
  useDismissable(open, onClose, ref);
  if (!open) return null;
  return (
    <Portal>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--t-lg)' }}>{title}</h2>
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}><I.X /></IconButton>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </Portal>
  );
}

/* ── Menu (click-outside dropdown) ─────────────────────── */
export function Menu({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      {open && (
        <div
          className="menu"
          role="menu"
          style={align === 'right' ? { right: 0, top: 'calc(100% + 6px)' } : { left: 0, top: 'calc(100% + 6px)' }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ danger, icon: Icon, children, ...rest }) {
  return (
    <button type="button" role="menuitem" className={cx('menu-item', danger && 'danger')} {...rest}>
      {Icon && <Icon />}{children}
    </button>
  );
}

/* ── Toasts ────────────────────────────────────────────── */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((title, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems((v) => [...v, { id, title, desc: opts.desc, tone: opts.tone || 'success' }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), opts.duration || 4200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} className={cx('toast', `toast-${t.tone}`)} role="status">
            {t.tone === 'error' ? <I.Alert /> : <I.CheckCircle />}
            <div className="toast-body">
              <div>{t.title}</div>
              {t.desc && <div className="toast-desc">{t.desc}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ── Pagination ────────────────────────────────────────── */
export function Pagination({ page, pageCount, total, pageSize, onPage }) {
  if (pageCount <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="pagination">
      <span className="pagination-info">{from}–{to} of {total.toLocaleString()}</span>
      <div className="row g-2">
        <IconButton label="First page" size="sm" disabled={page === 0} onClick={() => onPage(0)}><I.ChevronsLeft /></IconButton>
        <IconButton label="Previous page" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}><I.ChevronLeft /></IconButton>
        <span className="pagination-info nowrap">Page {page + 1} / {pageCount}</span>
        <IconButton label="Next page" size="sm" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}><I.ChevronRight /></IconButton>
        <IconButton label="Last page" size="sm" disabled={page >= pageCount - 1} onClick={() => onPage(pageCount - 1)}><I.ChevronsRight /></IconButton>
      </div>
    </div>
  );
}

/* ── Sortable table header ─────────────────────────────── */
export function Th({ col, label, sortBy, sortDir, onSort, align }) {
  const active = sortBy === col;
  const Icon = !active ? I.SortNone : sortDir === 'asc' ? I.SortAsc : I.SortDesc;
  return (
    <th aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined} style={align ? { textAlign: align } : undefined}>
      <button type="button" onClick={() => onSort(col)}>{label}<Icon /></button>
    </th>
  );
}

/* ── Minimal line chart (real data only) ───────────────── */
export function Sparkline({ points, height = 64, label }) {
  if (!points || points.length < 2) return null;
  const w = 320, h = height, pad = 6;
  const max = Math.max(...points), min = Math.min(...points);
  const span = max - min || 1;
  const xy = points.map((v, i) => [
    pad + (i / (points.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / span) * (h - pad * 2),
  ]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${d} L${xy[xy.length - 1][0].toFixed(1)} ${h - pad} L${xy[0][0].toFixed(1)} ${h - pad} Z`;
  const [ex, ey] = xy[xy.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="series-area" d={area} />
      <path className="series" d={d} />
      <circle className="endpoint" cx={ex} cy={ey} r="3" />
    </svg>
  );
}

export function BarList({ items, max }) {
  const top = max || Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="stack g-3">
      {items.map((i) => (
        <div key={i.label} className="bar-row">
          <span className="bar-name" style={{ flexBasis: '38%' }} title={i.label}>{i.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(i.value / top) * 100}%` }} /></span>
          <span className="bar-val">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

export { I as Icons };
