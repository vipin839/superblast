'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import {
  Button, Card, Callout, Field, Input, Modal, Segment, Switch, Tabs, Icons as I, useToast,
} from '@/components/ui';
import { DATABASES } from '@/lib/format';
import { removePref, usePref, writePref } from '@/lib/prefs';

const TABS = [
  { key: 'profile', label: 'Profile', icon: I.Settings },
  { key: 'appearance', label: 'Appearance', icon: I.Sun },
  { key: 'defaults', label: 'Search defaults', icon: I.Beaker },
  { key: 'data', label: 'Data', icon: I.Database },
];

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState('profile');
  const [confirmClear, setConfirmClear] = useState(false);

  // Preferences live in this browser only — nothing here is sent to the server.
  // Read through an external store so there is no setState-in-effect.
  const theme = usePref('blasthub-theme', 'system');
  const compact = usePref('blasthub-compact', 'false') === 'true';
  const storedDefaults = usePref('blasthub-defaults', '');

  const savedDefaults = useMemo(() => {
    try { return storedDefaults ? JSON.parse(storedDefaults) : null; } catch { return null; }
  }, [storedDefaults]);

  const [draft, setDraft] = useState(null);
  const defaults = draft ?? savedDefaults ?? { database: 'drosophila', task: 'megablast', evalue: '0.01', maxTargetSeqs: '50' };
  const setDefaults = (fn) => setDraft(typeof fn === 'function' ? fn(defaults) : fn);

  useEffect(() => { if (!loading && !user) router.push('/'); }, [user, loading, router]);

  // Syncing the DOM to state is exactly what an effect is for — no setState here.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  function changeTheme(value) {
    writePref('blasthub-theme', value);
    toast(`Theme set to ${value}`);
  }

  function saveDefaults() {
    writePref('blasthub-defaults', JSON.stringify(defaults));
    setDraft(null);
    toast('Search defaults saved');
  }

  function clearLocal() {
    setConfirmClear(false);
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('blasthub-job'));
      keys.forEach(removePref);
      removePref('blasthub-jobs');
      toast('Local cache cleared', { desc: `${keys.length} cached item(s) removed. Cloud history is untouched.` });
    } catch { toast('Could not clear the cache', { tone: 'error' }); }
  }

  if (loading || !user) {
    return <AppShell title="Settings"><div className="skeleton" style={{ height: 260, borderRadius: 'var(--r-lg)' }} /></AppShell>;
  }

  return (
    <AppShell title="Settings" crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]}>
      <div className="page-head">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-lede">Your account, appearance and search defaults.</p>
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Settings sections" />

      {tab === 'profile' && (
        <div className="grid-2">
          <Card pad="lg" className="stack g-5">
            <div className="card-title">Account</div>
            <div className="row g-4">
              {user.photoURL
                ? <img className="avatar" src={user.photoURL} alt="" style={{ width: 52, height: 52, flexBasis: 52 }} />
                : <span className="avatar" style={{ width: 52, height: 52, flexBasis: 52 }}>{(user.displayName || user.email || '?')[0].toUpperCase()}</span>}
              <div className="stack">
                <div style={{ fontWeight: 700 }}>{user.displayName || 'Researcher'}</div>
                <div className="hint">{user.email}</div>
              </div>
            </div>
            <Callout tone="info">
              Your name, email and picture come from your Google account. Change them in your Google
              profile and they update here on your next sign-in.
            </Callout>
            <div><Button variant="danger" onClick={signOut}><I.LogOut /> Sign out</Button></div>
          </Card>

          <Card pad="lg" className="stack g-4">
            <div className="card-title">Authentication</div>
            <div className="stack g-3 t-sm">
              <div className="row between g-3"><span className="muted">Provider</span><span style={{ fontWeight: 600 }}>Google</span></div>
              <div className="row between g-3"><span className="muted">User ID</span><span className="mono t-xs">{user.uid}</span></div>
              <div className="row between g-3"><span className="muted">Email verified</span>
                <span className={`badge badge-${user.emailVerified ? 'success' : 'warning'}`}>
                  {user.emailVerified ? <I.Check /> : <I.Alert />}{user.emailVerified ? 'Verified' : 'Unverified'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'appearance' && (
        <div className="grid-2">
          <Card pad="lg" className="stack g-5">
            <div>
              <div className="card-title">Theme</div>
              <p className="hint">System follows your operating system setting.</p>
            </div>
            <Segment options={THEMES} value={theme} onChange={changeTheme} label="Theme" />
          </Card>

          <Card pad="lg" className="stack g-4">
            <div className="card-title">Density</div>
            <div className="row between g-4">
              <div className="stack" style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>Compact tables</span>
                <span className="hint">Fit more hits on screen at once.</span>
              </div>
              <Switch
                checked={compact}
                label="Compact tables"
                onChange={(v) => {
                  writePref('blasthub-compact', String(v));
                  toast(v ? 'Compact tables on' : 'Compact tables off');
                }}
              />
            </div>
          </Card>
        </div>
      )}

      {tab === 'defaults' && (
        <Card pad="lg" className="stack g-5" style={{ maxWidth: 620 }}>
          <div>
            <div className="card-title">Default search parameters</div>
            <p className="hint">Pre-fills the new-search form. Stored in this browser.</p>
          </div>

          <Field label="Database" htmlFor="d-db">
            <select id="d-db" className="select" value={defaults.database} onChange={(e) => setDefaults((d) => ({ ...d, database: e.target.value }))}>
              {DATABASES.filter((d) => d.ready).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>

          <Field label="Task" htmlFor="d-task">
            <select id="d-task" className="select" value={defaults.task} onChange={(e) => setDefaults((d) => ({ ...d, task: e.target.value }))}>
              <option value="megablast">megablast</option>
              <option value="dc-megablast">dc-megablast</option>
              <option value="blastn">blastn</option>
            </select>
          </Field>

          <Field label="E-value threshold" htmlFor="d-ev">
            <Input id="d-ev" value={defaults.evalue} onChange={(e) => setDefaults((d) => ({ ...d, evalue: e.target.value }))} />
          </Field>

          <Field label="Max target sequences" htmlFor="d-mt" hint="Between 1 and 500.">
            <Input id="d-mt" type="number" min="1" max="500" value={defaults.maxTargetSeqs} onChange={(e) => setDefaults((d) => ({ ...d, maxTargetSeqs: e.target.value }))} />
          </Field>

          <div><Button variant="primary" onClick={saveDefaults}><I.Check /> Save defaults</Button></div>
        </Card>
      )}

      {tab === 'data' && (
        <div className="grid-2">
          <Card pad="lg" className="stack g-4">
            <div className="card-title">Browser cache</div>
            <p className="hint">
              BLASTHub keeps a copy of each search in this browser so results open instantly and survive
              a dropped connection. Clearing it does not touch your cloud history.
            </p>
            <div><Button variant="secondary" onClick={() => setConfirmClear(true)}><I.Trash /> Clear local cache</Button></div>
          </Card>

          <Card pad="lg" className="stack g-4">
            <div className="card-title">Retention</div>
            <div className="stack g-3 t-sm">
              <div className="row between g-3"><span className="muted">Temporary query files</span><span style={{ fontWeight: 600 }}>Deleted after 1 hour</span></div>
              <div className="row between g-3"><span className="muted">Search history</span><span style={{ fontWeight: 600 }}>Until you delete it</span></div>
              <div className="row between g-3"><span className="muted">Sequence data</span><span style={{ fontWeight: 600 }}>Not sent to third parties</span></div>
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear the local cache?"
        desc="Cached search results in this browser will be removed. Your cloud history is unaffected and results will reload from the server."
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="danger" onClick={clearLocal}><I.Trash /> Clear cache</Button>
          </>
        }
      />
    </AppShell>
  );
}
