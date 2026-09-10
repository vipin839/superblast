'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { IconButton, Menu, MenuItem, Icons as I } from '@/components/ui';
import { usePref, writePref } from '@/lib/prefs';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: I.Grid },
  { href: '/search', label: 'New Search', icon: I.Plus },
  { href: '/history', label: 'History', icon: I.History },
];

const NAV_FOOT = [
  { href: '/settings', label: 'Settings', icon: I.Settings },
];

function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/**
 * The one shell every signed-in route renders inside.
 * Desktop: floating sidebar card + sticky topbar.
 * Below 1024px: the sidebar becomes a slide-over, not a squeezed rail.
 */
export default function AppShell({ title, crumbs, actions, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  // Sidebar state lives in localStorage, read through an external store so
  // there is no setState-in-effect and no flash on navigation.
  const collapsed = usePref('blasthub-sidebar', 'open') === 'collapsed';
  const toggleCollapsed = () => writePref('blasthub-sidebar', collapsed ? 'open' : 'collapsed');

  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  // Escape closes the mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const isActive = (href) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  const navLink = (item) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className="nav-item"
        aria-current={isActive(item.href) ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        onClick={closeMobile}
      >
        <Icon />
        <span className="nav-text">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="shell" data-collapsed={collapsed ? 'true' : 'false'}>
      <a href="#main" className="skip-link">Skip to content</a>

      {mobileOpen && <div className="scrim only-sm" onClick={closeMobile} />}

      <nav className="sidebar" data-open={mobileOpen ? 'true' : 'false'} aria-label="Main">
        <div className="sidebar-brand">
          <Link href="/dashboard" className="brand-mark" aria-label="BLASTHub home" onClick={closeMobile}><I.Helix /></Link>
          <span className="brand-word">BLAST<em>Hub</em></span>
        </div>

        <div className="sidebar-scroll">
          <div className="nav-group">
            <div className="nav-label">Analysis</div>
            {NAV.map(navLink)}
          </div>
          <div className="nav-group">
            <div className="nav-label">Account</div>
            {NAV_FOOT.map(navLink)}
          </div>
        </div>

        <div className="sidebar-foot">
          <Menu
            align="left"
            trigger={
              <button type="button" className="user-chip" aria-haspopup="menu">
                {user?.photoURL
                  ? <img className="avatar" src={user.photoURL} alt="" />
                  : <span className="avatar">{initials(user?.displayName, user?.email)}</span>}
                <span className="user-meta">
                  <span className="user-name">{user?.displayName || 'Researcher'}</span>
                  <span className="user-sub">{user?.email || ''}</span>
                </span>
              </button>
            }
          >
            <MenuItem icon={I.Settings} onClick={() => router.push('/settings')}>Settings</MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={I.LogOut} danger onClick={signOut}>Sign out</MenuItem>
          </Menu>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <IconButton
            className="only-sm"
            label="Open navigation"
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
          >
            <I.Menu />
          </IconButton>

          <IconButton
            className="hide-sm"
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleCollapsed}
          >
            {collapsed ? <I.ChevronsRight /> : <I.ChevronsLeft />}
          </IconButton>

          <div className="topbar-lead">
            {crumbs?.length > 0 && (
              <nav className="crumb" aria-label="Breadcrumb">
                {crumbs.map((c, i) => (
                  <span key={c.href || c.label} className="row g-2">
                    {i > 0 && <I.ChevronRight />}
                    {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
                  </span>
                ))}
              </nav>
            )}
            <h1 className="topbar-title">{title}</h1>
          </div>

          {actions && <div className="topbar-actions">{actions}</div>}
        </header>

        <main id="main" className="page">{children}</main>
      </div>
    </div>
  );
}
