'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import {
  Button, Card, Callout, EmptyState, IconButton, Modal, Pagination,
  SearchInput, Segment, SkeletonRows, StatusBadge, Th, Icons as I, useToast,
} from '@/components/ui';
import { dbLabel, formatDate, timeAgo } from '@/lib/format';
import { apiFetch } from '@/lib/apiClient';

const PAGE_SIZE = 25;

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'processing', label: 'Running' },
  { value: 'terminated', label: 'Stopped' },
];

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { if (!loading && !user) router.push('/'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const data = await apiFetch('/api/jobs');
        if (!cancelled) setJobs(data.jobs || []);
      } catch {
        try {
          const list = JSON.parse(localStorage.getItem('blasthub-jobs') || '[]');
          const local = list.map((j) => ({ ...j, ...JSON.parse(localStorage.getItem(`blasthub-job-${j.id}`) || '{}') }));
          if (!cancelled) {
            setJobs(local);
            if (local.length) setNotice('Showing searches cached in this browser.');
          }
        } catch { /* nothing cached */ }
      } finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((j) => status === 'all' || (j.status || 'processing') === status)
      .filter((j) => !q
        || j.id?.toLowerCase().includes(q)
        || (j.config?.database || '').toLowerCase().includes(q)
        || (j.fileNames || []).some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortBy === 'createdAt') return (new Date(a.createdAt || 0) - new Date(b.createdAt || 0)) * dir;
        if (sortBy === 'totalFiles') return ((a.totalFiles || 0) - (b.totalFiles || 0)) * dir;
        return String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? '')) * dir;
      });
  }, [jobs, query, status, sortBy, sortDir]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset paging when the filters change. Adjusting state during render is the
  // supported pattern for this; an effect would cause a cascading re-render.
  const filterKey = `${query}|${status}|${sortBy}|${sortDir}`;
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey);
  if (seenFilterKey !== filterKey) {
    setSeenFilterKey(filterKey);
    setPage(0);
  }

  const onSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('desc'); }
  };

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
      } catch { /* ignore */ }
      toast('Search deleted');
    } catch {
      setJobs(previous);
      toast('Could not delete that search', { tone: 'error' });
    }
  }

  return (
    <AppShell
      title="History"
      crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'History' }]}
      actions={<Button as={Link} href="/search" variant="primary" size="sm"><I.Plus /> New search</Button>}
    >
      <div className="page-head">
        <div>
          <h2 className="page-title">Search <strong>history</strong></h2>
          <p className="page-lede">Every BLAST run on this account, newest first.</p>
        </div>
      </div>

      {notice && <Callout tone="warning" title="Offline cache">{notice}</Callout>}

      <div className="row between g-4 wrap">
        <SearchInput
          placeholder="Filter by job id, database or filename…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter searches"
          style={{ minWidth: 300 }}
        />
        <Segment options={FILTERS} value={status} onChange={setStatus} label="Filter by status" />
      </div>

      {busy ? (
        <SkeletonRows rows={8} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={I.History}
            title={jobs.length === 0 ? 'No searches yet' : 'Nothing matches those filters'}
            desc={jobs.length === 0
              ? 'Your BLAST runs will be listed here once you start one.'
              : 'Try a different search term, or clear the status filter.'}
            action={jobs.length === 0
              ? <Button as={Link} href="/search" variant="primary"><I.Plus /> Run your first search</Button>
              : <Button variant="secondary" onClick={() => { setQuery(''); setStatus('all'); }}>Clear filters</Button>}
          />
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 820 }}>
            <caption className="sr-only">All BLAST searches</caption>
            <thead>
              <tr>
                <Th col="id" label="Search" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <th>Database</th>
                <th>Task</th>
                <Th col="totalFiles" label="Files" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <th>Status</th>
                <Th col="createdAt" label="Started" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link href={`/search/${job.id}`} className="cell-strong">
                      <span className="mono">{job.id}</span>
                    </Link>
                  </td>
                  <td>{dbLabel(job.config?.database)}</td>
                  <td className="cell-muted mono">{job.config?.task || 'megablast'}</td>
                  <td className="num">{job.totalFiles || 0}</td>
                  <td><StatusBadge status={job.status} /></td>
                  <td className="cell-muted" title={formatDate(job.createdAt)}>{timeAgo(job.createdAt)}</td>
                  <td>
                    <div className="row g-1">
                      <Button as={Link} href={`/search/${job.id}`} variant="ghost" size="sm">Open</Button>
                      <IconButton label={`Delete ${job.id}`} size="sm" onClick={() => setConfirmDelete(job)}>
                        <I.Trash />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
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
