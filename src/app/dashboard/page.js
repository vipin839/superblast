'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import {
  Button, Card, Callout, EmptyState, IconButton, Modal, Skeleton,
  SkeletonRows, Sparkline, StatusBadge, Tile, Icons as I, useToast,
} from '@/components/ui';
import { dbLabel, timeAgo } from '@/lib/format';
import { apiFetch } from '@/lib/apiClient';

/** Searches per day for the last 14 days — derived from real job timestamps. */
function activitySeries(jobs) {
  const days = 14;
  const buckets = new Array(days).fill(0);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  for (const j of jobs) {
    if (!j.createdAt) continue;
    const d = new Date(j.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const idx = days - 1 - Math.round((start - d) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx]++;
  }
  return buckets;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { if (!loading && !user) router.push('/'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fromLocal = () => {
      try {
        const list = JSON.parse(localStorage.getItem('blasthub-jobs') || '[]');
        return list.map((j) => ({ ...j, ...JSON.parse(localStorage.getItem(`blasthub-job-${j.id}`) || '{}') }));
      } catch { return []; }
    };

    (async () => {
      setJobsLoading(true);
      try {
        const data = await apiFetch('/api/jobs');
        if (!cancelled) setJobs(data.jobs || []);
      } catch {
        const local = fromLocal();
        if (!cancelled) {
          setJobs(local);
          if (local.length) setNotice('Showing searches cached in this browser. New runs will sync once the connection returns.');
        }
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const stats = useMemo(() => ({
    total: jobs.length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    processing: jobs.filter((j) => j.status === 'processing').length,
    files: jobs.reduce((s, j) => s + (j.totalFiles || 0), 0),
  }), [jobs]);

  const recent = useMemo(
    () => [...jobs].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6),
    [jobs],
  );

  const series = useMemo(() => activitySeries(jobs), [jobs]);
  const hasActivity = series.some((v) => v > 0);

  async function doDelete(job) {
    setConfirmDelete(null);
    const previous = jobs;
    setJobs((v) => v.filter((j) => j.id !== job.id));
    try {
      await apiFetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      try {
        const list = JSON.parse(localStorage.getItem('blasthub-jobs') || '[]');
        localStorage.setItem('blasthub-jobs', JSON.stringify(list.filter((j) => j.id !== job.id)));
        localStorage.removeItem(`blasthub-job-${job.id}`);
      } catch { /* cache miss is fine */ }
      toast('Search deleted');
    } catch {
      setJobs(previous);
      toast('Could not delete that search', { tone: 'error', desc: 'It is still in your history. Try again.' });
    }
  }

  if (loading || !user) {
    return (
      <AppShell title="Dashboard">
        <div className="stack g-5">
          <Skeleton style={{ height: 38, width: '32%' }} />
          <div className="metric-row">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 104, borderRadius: 'var(--r-lg)' }} />)}
          </div>
          <SkeletonRows rows={4} />
        </div>
      </AppShell>
    );
  }

  const firstName = user.displayName?.split(' ')[0] || 'Researcher';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <AppShell
      title="Dashboard"
      actions={<Button as={Link} href="/search" variant="primary"><I.Plus /> New search</Button>}
    >
      <div className="page-head">
        <div>
          <h2 className="page-title">{greeting}, <strong>{firstName}</strong></h2>
          <p className="page-lede">
            {stats.processing > 0
              ? `${stats.processing} search${stats.processing > 1 ? 'es' : ''} still running.`
              : 'Pick up where you left off, or start a new sequence analysis.'}
          </p>
        </div>
      </div>

      {notice && <Callout tone="warning" title="Offline cache">{notice}</Callout>}

      <div className="grid-main">
        <Card inverse pad="lg" className="stack g-5">
          <div className="row between g-4 wrap">
            <div>
              <div className="card-title">Search activity</div>
              <div className="card-sub">Last 14 days</div>
            </div>
            <span className="badge"><I.Database /> blastn engine</span>
          </div>

          {jobsLoading ? (
            <Skeleton style={{ height: 64, borderRadius: 'var(--r-md)' }} />
          ) : hasActivity ? (
            <Sparkline
              points={series}
              label={`Searches per day over the last 14 days. Most recent day: ${series[series.length - 1]}.`}
            />
          ) : (
            <p className="muted t-sm" style={{ padding: 'var(--s-5) 0' }}>
              No searches in the last 14 days. Your activity trend appears here once you run one.
            </p>
          )}

          <div className="tile-row">
            <Tile label="Total searches" value={stats.total} />
            <Tile label="Completed" value={stats.completed} />
            <Tile label="Running" value={stats.processing} />
            <Tile label="Files processed" value={stats.files} />
          </div>
        </Card>

        <div className="stack g-4">
          <Card pad className="stack g-4">
            <div className="card-title">Quick actions</div>
            <div className="stack g-2">
              <Button as={Link} href="/search" variant="primary" className="btn-block"><I.Upload /> Upload FASTA files</Button>
              <Button as={Link} href="/history" variant="secondary" className="btn-block"><I.History /> Browse all searches</Button>
            </div>
          </Card>

          <Card pad className="stack g-3">
            <div className="card-title">Reference databases</div>
            <p className="hint">Three are pre-indexed and available immediately.</p>
            <div className="stack g-2">
              {['drosophila', 'ecoli', 'viruses'].map((d) => (
                <div key={d} className="row between g-3">
                  <span className="t-sm" style={{ fontWeight: 600 }}>{dbLabel(d)}</span>
                  <span className="badge badge-success"><I.Check /> Ready</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="section-head">
        <div>
          <h3 className="section-title">Recent searches</h3>
          <p className="section-desc">Your six most recent runs.</p>
        </div>
        {jobs.length > 6 && (
          <Button as={Link} href="/history" variant="ghost" size="sm">View all <I.ChevronRight /></Button>
        )}
      </div>

      {jobsLoading ? (
        <SkeletonRows rows={4} />
      ) : recent.length === 0 ? (
        <Card>
          <EmptyState
            icon={I.Beaker}
            title="No searches yet"
            desc="Upload a FASTA file and run it against a reference database. Your results will collect here."
            action={<Button as={Link} href="/search" variant="primary"><I.Plus /> Run your first search</Button>}
          />
        </Card>
      ) : (
        <div className="stack g-2">
          {recent.map((job) => (
            <Card key={job.id} className="row between g-4 wrap" style={{ padding: 'var(--s-4) var(--s-5)' }}>
              <Link href={`/search/${job.id}`} className="row g-4 grow" style={{ minWidth: 0 }}>
                <span className="file-icon"><I.Beaker /></span>
                <span className="stack" style={{ minWidth: 0 }}>
                  <span className="file-name">blastn · {dbLabel(job.config?.database)}</span>
                  <span className="file-meta">
                    <span className="mono">{job.id}</span>
                    <span className="sep" />
                    <span>{job.totalFiles || 0} file{job.totalFiles === 1 ? '' : 's'}</span>
                    <span className="sep" />
                    <span>{timeAgo(job.createdAt)}</span>
                  </span>
                </span>
              </Link>

              <div className="row g-3" style={{ flex: '0 0 auto' }}>
                <StatusBadge status={job.status} />
                <IconButton label={`Delete search ${job.id}`} size="sm" onClick={() => setConfirmDelete(job)}>
                  <I.Trash />
                </IconButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this search?"
        desc={confirmDelete ? `${confirmDelete.id} and its results will be removed. This cannot be undone.` : ''}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => doDelete(confirmDelete)}><I.Trash /> Delete</Button>
          </>
        }
      />
    </AppShell>
  );
}
