'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import {
  BarList, Button, Card, Callout, Drawer, EmptyState, IconButton, Menu, MenuItem,
  Metric, Modal, Pagination, Progress, SearchInput, Segment, SkeletonRows,
  StatusBadge, Tabs, Th, Icons as I, useToast,
} from '@/components/ui';
import { dbLabel, formatDate, formatEvalue, identityClass } from '@/lib/format';
import { usePref } from '@/lib/prefs';
import { apiFetch, apiSend } from '@/lib/apiClient';

const POLL_INTERVAL = 4000;
const PAGE_SIZE = 50;
const ALIGN_WIDTH = 60;

/* ── Alignment renderer: 60 bp blocks, matches/mismatches/gaps marked ── */
function Alignment({ hit }) {
  const blocks = [];
  const { qseq = '', hseq = '', midline = '', qStart = 1, sStart = 1, queryStrand, hitStrand } = hit;
  const qStep = queryStrand === 'Minus' ? -1 : 1;
  const sStep = hitStrand === 'Minus' ? -1 : 1;

  let qPos = qStart;
  let sPos = sStart;

  for (let i = 0; i < qseq.length; i += ALIGN_WIDTH) {
    const q = qseq.slice(i, i + ALIGN_WIDTH);
    const h = hseq.slice(i, i + ALIGN_WIDTH);
    const m = midline.slice(i, i + ALIGN_WIDTH);
    const qGaps = (q.match(/-/g) || []).length;
    const sGaps = (h.match(/-/g) || []).length;
    const qEnd = qPos + qStep * (q.length - qGaps - 1);
    const sEnd = sPos + sStep * (h.length - sGaps - 1);

    blocks.push(
      <div className="aln-block" key={i}>
        <div className="aln-row">
          <span className="aln-tag">Query</span>
          <span className="aln-pos">{qPos}</span>
          <span className="aln-seq">
            {q.split('').map((c, k) => (
              <span key={k} className={c === '-' ? 'aln-gap' : m[k] === '|' ? 'aln-match' : 'aln-mis'}>{c}</span>
            ))}
          </span>
          <span className="aln-pos">{qEnd}</span>
        </div>
        <div className="aln-row">
          <span className="aln-tag" aria-hidden="true" />
          <span className="aln-pos" aria-hidden="true" />
          <span className="aln-seq aln-mid">{m}</span>
        </div>
        <div className="aln-row">
          <span className="aln-tag">Sbjct</span>
          <span className="aln-pos">{sPos}</span>
          <span className="aln-seq">
            {h.split('').map((c, k) => (
              <span key={k} className={c === '-' ? 'aln-gap' : m[k] === '|' ? 'aln-match' : 'aln-mis'}>{c}</span>
            ))}
          </span>
          <span className="aln-pos">{sEnd}</span>
        </div>
      </div>,
    );

    qPos = qEnd + qStep;
    sPos = sEnd + sStep;
  }

  return <div className="aln">{blocks}</div>;
}

/* ── Very small Markdown subset for the AI write-up ── */
function renderAnalysis(md) {
  return md.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
    if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
    if (/^[-*]\s/.test(line)) return <li key={i}>{line.slice(2)}</li>;
    if (!line.trim()) return null;
    return <p key={i}>{line}</p>;
  });
}

export default function ResultsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { jobId } = useParams();
  const toast = useToast();

  const [cloudJob, setCloudJob] = useState(null);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [statuses, setStatuses] = useState({});
  const [hits, setHits] = useState([]);
  const [searches, setSearches] = useState([]);

  const [tab, setTab] = useState('table');
  const [query, setQuery] = useState('');
  const [queryFilter, setQueryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('evalue');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [openHit, setOpenHit] = useState(null);
  const [confirmStop, setConfirmStop] = useState(false);

  const [ai, setAi] = useState(null);
  const [aiSource, setAiSource] = useState(null);
  const [aiModel, setAiModel] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiReason, setAiReason] = useState(null);
  const [aiFlags, setAiFlags] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Refs keep the poll loop out of the render cycle — the effect must not
  // re-subscribe every time a status lands, or polling becomes unbounded.
  const jobsRef = useRef([]);
  const doneRef = useRef(new Set());

  useEffect(() => { if (!loading && !user) router.push('/'); }, [user, loading, router]);

  /* ── Load job: local cache (external store) merged with the cloud copy ── */
  const cachedRaw = usePref(`blasthub-job-${jobId}`, '');
  const cachedJob = useMemo(() => {
    try { return cachedRaw ? JSON.parse(cachedRaw) : null; } catch { return null; }
  }, [cachedRaw]);

  const jobData = useMemo(() => {
    if (!cachedJob && !cloudJob) return null;
    return { ...(cachedJob || {}), ...(cloudJob || {}) };
  }, [cachedJob, cloudJob]);

  const jobLoading = !cachedJob && cloudLoading;

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    (async () => {
      try {
        const job = await apiFetch(`/api/jobs/${jobId}`);
        if (!cancelled) setCloudJob(job);
      } catch { /* the cached copy is already on screen */ }
      finally { if (!cancelled) setCloudLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  useEffect(() => { jobsRef.current = jobData?.jobs || []; }, [jobData]);

  /* ── Polling: one interval for the life of the job ── */
  const poll = useCallback(async () => {
    const pending = jobsRef.current.filter((j) => !doneRef.current.has(j.rid));
    if (pending.length === 0) return true;

    const rids = pending.map((j) => j.rid).join(',');
    try {
      const { statuses: map = {} } = await apiFetch(`/api/blast/status?rids=${encodeURIComponent(rids)}`);

      const ready = [];
      const next = {};
      for (const j of pending) {
        const st = map[j.rid];
        if (!st) continue;
        next[j.rid] = { ...st, filenames: j.filenames || [j.filename] };
        if (st.status === 'READY') ready.push(j.rid);
        if (st.status === 'READY' || st.status === 'FAILED') doneRef.current.add(j.rid);
      }
      if (Object.keys(next).length) setStatuses((prev) => ({ ...prev, ...next }));

      if (ready.length) {
        {
          const { results = {} } = await apiFetch(`/api/blast/results?rids=${encodeURIComponent(ready.join(','))}`);
          const newHits = [];
          const newSearches = [];
          for (const rid of ready) {
            const data = results[rid];
            if (!data) continue;
            const job = jobsRef.current.find((j) => j.rid === rid);
            const names = job?.filenames || [job?.filename].filter(Boolean);
            newSearches.push({ rid, filenames: names, ...data });
            newHits.push(...(data.hits || []).map((h) => ({ ...h, rid, batchFilenames: names })));
          }
          if (newHits.length) {
            setHits((prev) => {
              const seen = new Set(prev.map((h) => `${h.rid}|${h.subjectAcc}|${h.qStart}|${h.sStart}`));
              return [...prev, ...newHits.filter((h) => !seen.has(`${h.rid}|${h.subjectAcc}|${h.qStart}|${h.sStart}`))];
            });
          }
          if (newSearches.length) {
            setSearches((prev) => {
              const seen = new Set(prev.map((s) => s.rid));
              return [...prev, ...newSearches.filter((s) => !seen.has(s.rid))];
            });
          }
        }
      }
    } catch { /* transient — the next tick retries */ }

    return jobsRef.current.every((j) => doneRef.current.has(j.rid));
  }, []);

  useEffect(() => {
    if (!jobData?.jobs?.length) return;
    if (jobData.status === 'terminated') return;

    let stopped = false;
    let timer;

    const tick = async () => {
      if (stopped) return;
      const finished = await poll();
      if (stopped) return;
      if (finished) {
        apiSend(`/api/jobs/${jobId}`, 'PATCH', { status: 'completed', completedAt: new Date().toISOString() }).catch(() => {
          try {
            const s = JSON.parse(localStorage.getItem(`blasthub-job-${jobId}`) || '{}');
            s.status = 'completed';
            localStorage.setItem(`blasthub-job-${jobId}`, JSON.stringify(s));
          } catch { /* ignore */ }
        });
        setCloudJob((prev) => (prev?.status === 'completed' ? prev : { ...(prev || {}), status: 'completed' }));
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL);
    };

    tick();
    return () => { stopped = true; clearTimeout(timer); };
    // Depends only on identity of the job, never on the data it produces.
  }, [jobData?.id, jobData?.jobs?.length, jobData?.status, jobId, poll]);

  /* ── Derived ── */
  const totalBatches = jobData?.jobs?.length || 0;
  const doneBatches = Object.values(statuses).filter((s) => s.status === 'READY' || s.status === 'FAILED').length;
  const isTerminated = jobData?.status === 'terminated';
  const allDone = isTerminated || (totalBatches > 0 && doneBatches >= totalBatches);
  const pct = totalBatches ? Math.round((doneBatches / totalBatches) * 100) : 0;
  const failed = Object.entries(statuses).filter(([, s]) => s.status === 'FAILED');

  const queries = useMemo(() => [...new Set(hits.map((h) => h.queryTitle))], [hits]);
  const species = useMemo(() => {
    const counts = {};
    for (const h of hits) if (h.subjectSciName) counts[h.subjectSciName] = (counts[h.subjectSciName] || 0) + 1;
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [hits]);

  const summary = useMemo(() => {
    if (!hits.length) return null;
    return {
      queries: queries.length,
      hits: hits.length,
      topIdentity: Math.max(...hits.map((h) => h.identity || 0)),
      bestEvalue: Math.min(...hits.map((h) => (h.evalue ?? Infinity))),
      avgCoverage: hits.reduce((s, h) => s + (h.queryCoverage || 0), 0) / hits.length,
      species: species.length,
    };
  }, [hits, queries, species]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hits
      .filter((h) => queryFilter === 'all' || h.queryTitle === queryFilter)
      .filter((h) => !q
        || (h.subjectSciName || '').toLowerCase().includes(q)
        || (h.queryTitle || '').toLowerCase().includes(q)
        || (h.subjectAcc || '').toLowerCase().includes(q)
        || (h.subjectTitle || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        const x = a[sortBy], y = b[sortBy];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x ?? '').localeCompare(String(y ?? '')) * dir;
      });
  }, [hits, query, queryFilter, sortBy, sortDir]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset paging when the filters change — adjusted during render rather than
  // in an effect, which would cause a cascading re-render on every keystroke.
  const filterKey = `${query}|${queryFilter}|${sortBy}|${sortDir}`;
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey);
  if (seenFilterKey !== filterKey) {
    setSeenFilterKey(filterKey);
    setPage(0);
  }

  const onSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir(col === 'evalue' ? 'asc' : 'desc'); }
  };

  /* ── Actions ── */
  async function runAi() {
    setAiBusy(true); setAiError(null);
    try {
      const data = await apiSend('/api/blast/analyze', 'POST', { jobId });
      setAi(data.analysis);
      setAiSource(data.source);
      setAiModel(data.model || null);
      setAiStatus(data.status || 'completed');
      setAiReason(data.reason || null);
      setAiFlags(data.evidence?.flags || []);
      toast(data.status === 'completed' ? 'Analysis ready' : 'Local summary ready', {
        tone: data.status === 'completed' ? 'success' : 'info',
        desc: data.reason || undefined,
      });
    } catch (e) {
      setAiError(e.message);
    } finally { setAiBusy(false); }
  }

  async function stopJob() {
    setConfirmStop(false);
    try {
      const pending = (jobData?.jobs || []).filter((j) => !doneRef.current.has(j.rid)).map((j) => j.rid);
      let note;
      if (pending.length) {
        const res = await apiSend('/api/blast/cancel', 'POST', { rids: pending.join(',') });
        note = res?.note;
      }
      await apiSend(`/api/jobs/${jobId}`, 'PATCH', { status: 'terminated', terminatedAt: new Date().toISOString() });
      setCloudJob((p) => ({ ...(p || {}), status: 'terminated' }));
      toast('Search stopped', {
        desc: note || 'The running BLAST processes were terminated. Results already returned are kept.',
      });
    } catch {
      toast('Could not stop the search', { tone: 'error' });
    }
  }

  const download = (content, name, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
    toast(`${name} downloaded`);
  };

  const exportCsv = () => {
    const cols = ['queryTitle', 'subjectAcc', 'subjectSciName', 'subjectTitle', 'identity', 'queryCoverage', 'alignmentLength', 'mismatches', 'gapOpens', 'evalue', 'bitScore', 'qStart', 'qEnd', 'sStart', 'sEnd'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...filtered.map((h) => cols.map((c) => esc(h[c])).join(','))].join('\n');
    download(csv, `blasthub-${jobId}.csv`, 'text/csv');
  };

  const exportJson = () =>
    download(JSON.stringify({ job: jobData, hits: filtered }, null, 2), `blasthub-${jobId}.json`, 'application/json');

  const exportPdf = async () => {
    try {
      const { exportPDF } = await import('@/lib/exportPdf');
      exportPDF(jobData, filtered, ai);
      toast('PDF report generated');
    } catch { toast('Could not generate the PDF', { tone: 'error' }); }
  };

  const exportXlsx = async () => {
    try {
      const { exportExcel } = await import('@/lib/exportExcel');
      await exportExcel(jobData, filtered, searches);
      toast('Excel workbook generated');
    } catch { toast('Could not generate the workbook', { tone: 'error' }); }
  };

  /* ── Render ── */
  if (loading || !user || jobLoading) {
    return <AppShell title="Results"><SkeletonRows rows={6} /></AppShell>;
  }

  if (!jobData) {
    return (
      <AppShell title="Results" crumbs={[{ label: 'Dashboard', href: '/dashboard' }]}>
        <Card>
          <EmptyState
            icon={I.Alert}
            title="Search not found"
            desc={`No search with the id ${jobId} exists in your history, or it has been deleted.`}
            action={<Button as={Link} href="/dashboard" variant="primary">Back to dashboard</Button>}
          />
        </Card>
      </AppShell>
    );
  }

  const TABS = [
    { key: 'table', label: 'Hit table', icon: I.Table, count: filtered.length },
    { key: 'align', label: 'Alignments', icon: I.Align, count: hits.filter((h) => h.qseq).length },
    { key: 'summary', label: 'Per query', icon: I.Chart, count: queries.length },
    { key: 'ai', label: 'AI analysis', icon: I.Sparkle },
  ];

  return (
    <AppShell
      title={`blastn · ${dbLabel(jobData.config?.database)}`}
      crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Searches', href: '/history' }, { label: jobId }]}
      actions={
        <>
          {!allDone && (
            <Button variant="danger" size="sm" onClick={() => setConfirmStop(true)}><I.Stop /> Stop</Button>
          )}
          <Menu
            trigger={<span className="btn btn-secondary btn-sm"><I.Download /> Export <I.ChevronDown /></span>}
          >
            <MenuItem icon={I.Doc} onClick={exportPdf}>PDF report</MenuItem>
            <MenuItem icon={I.Sheet} onClick={exportXlsx}>Excel workbook</MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={I.Braces} onClick={exportJson}>Raw JSON</MenuItem>
            <MenuItem icon={I.Table} onClick={exportCsv}>CSV table</MenuItem>
          </Menu>
        </>
      }
    >
      {/* ── Run header ── */}
      <Card inverse pad="lg" className="stack g-5">
        <div className="row between g-4 wrap">
          <div className="stack g-2">
            <div className="row g-3 wrap">
              <StatusBadge status={isTerminated ? 'terminated' : allDone ? 'completed' : 'processing'} />
              <span className="badge"><I.Database /> {dbLabel(jobData.config?.database)}</span>
              <span className="badge"><I.Beaker /> {jobData.config?.task || 'megablast'}</span>
            </div>
            <div className="card-sub mono">{jobId} · {formatDate(jobData.createdAt)}</div>
          </div>
          <div className="tile-row" style={{ minWidth: 220 }}>
            <div className="tile"><div className="tile-value">{jobData.totalFiles || 0}</div><div className="tile-label">Files</div></div>
            <div className="tile"><div className="tile-value">{hits.length}</div><div className="tile-label">Hits</div></div>
          </div>
        </div>

        {!allDone && (
          <div className="stack g-2">
            <div className="row between g-3">
              <span className="t-sm">Running {doneBatches} of {totalBatches} batches</span>
              <span className="mono t-sm">{pct}%</span>
            </div>
            <Progress value={pct} label={`${doneBatches} of ${totalBatches} batches complete`} />
          </div>
        )}
      </Card>

      {failed.length > 0 && (
        <Callout tone="error" title={`${failed.length} batch${failed.length > 1 ? 'es' : ''} failed`}>
          <ul style={{ margin: 0, paddingLeft: 'var(--s-5)' }}>
            {failed.map(([rid, s]) => <li key={rid}><span className="mono">{(s.filenames || [rid]).join(', ')}</span> — {s.message}</li>)}
          </ul>
        </Callout>
      )}

      {/* ── Summary metrics ── */}
      {summary && (
        <div className="metric-row">
          <Metric label="Queries" value={summary.queries} icon={I.File} />
          <Metric label="Total hits" value={summary.hits} icon={I.Table} />
          <Metric label="Top identity" value={`${summary.topIdentity.toFixed(1)}%`} icon={I.Chart} />
          <Metric label="Best E-value" value={formatEvalue(summary.bestEvalue)} icon={I.Beaker} />
          <Metric label="Mean coverage" value={`${summary.avgCoverage.toFixed(0)}%`} icon={I.Align} />
          <Metric label="Distinct species" value={summary.species} icon={I.Database} />
        </div>
      )}

      {hits.length === 0 && allDone ? (
        <Card>
          <EmptyState
            icon={I.Search}
            title="No hits found"
            desc="The search completed but returned no alignments above your E-value threshold. Try a less strict threshold, or the dc-megablast task for more divergent matches."
            action={<Button as={Link} href="/search" variant="primary"><I.Plus /> New search</Button>}
          />
        </Card>
      ) : hits.length === 0 ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <div className="row between g-4 wrap">
            <Tabs tabs={TABS} value={tab} onChange={setTab} label="Result views" />
            {queries.length > 1 && tab !== 'ai' && (
              <Segment
                label="Filter by query"
                value={queryFilter}
                onChange={setQueryFilter}
                options={[{ value: 'all', label: 'All queries' }, ...queries.slice(0, 4).map((q) => ({ value: q, label: q }))]}
              />
            )}
          </div>

          {/* ── Hit table ── */}
          {tab === 'table' && (
            <div className="stack g-3">
              <div className="row g-3 wrap">
                <SearchInput
                  placeholder="Filter by organism, accession, description or query…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Filter hits"
                  style={{ minWidth: 280 }}
                />
                <span className="t-sm muted nowrap">{filtered.length.toLocaleString()} of {hits.length.toLocaleString()} hits</span>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">BLAST hits, sortable by every numeric column</caption>
                  <colgroup>
                    <col className="c-query" /><col className="c-acc" /><col className="c-org" />
                    <col className="c-desc" /><col className="c-num" /><col className="c-num" />
                    <col className="c-num" /><col className="c-num" /><col className="c-act" />
                  </colgroup>
                  <thead>
                    <tr>
                      <Th col="queryTitle" label="Query" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                      <Th col="subjectAcc" label="Accession" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                      <Th col="subjectSciName" label="Organism" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                      <th>Description</th>
                      <Th col="identity" label="Identity" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                      <Th col="queryCoverage" label="Coverage" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                      <Th col="evalue" label="E-value" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                      <Th col="bitScore" label="Bit score" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((h, i) => (
                      <tr key={`${h.rid}-${h.subjectAcc}-${h.qStart}-${i}`} data-active={openHit === h ? 'true' : undefined}>
                        <td className="cell-strong" title={h.queryTitle}>{h.queryTitle}</td>
                        <td>
                          <a className="acc-link" href={`https://www.ncbi.nlm.nih.gov/nuccore/${h.subjectAcc}`} target="_blank" rel="noopener noreferrer">
                            {h.subjectAcc}
                          </a>
                        </td>
                        <td title={h.subjectSciName || 'Unknown'}><em>{h.subjectSciName || 'Unknown'}</em></td>
                        <td className="cell-clip cell-muted" title={h.subjectTitle}>{h.subjectTitle}</td>
                        <td className={`num cell-strong ${identityClass(h.identity)}`}>{h.identity?.toFixed(1)}%</td>
                        <td className="num">{h.queryCoverage?.toFixed(0)}%</td>
                        <td className="num">{formatEvalue(h.evalue)}</td>
                        <td className="num">{h.bitScore?.toFixed(0)}</td>
                        <td>
                          <Button variant="ghost" size="sm" onClick={() => setOpenHit(h)} disabled={!h.qseq}>
                            <I.Align /> Align
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={page} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
              </div>
            </div>
          )}

          {/* ── Alignments ── */}
          {tab === 'align' && (
            <div className="stack g-4">
              {filtered.filter((h) => h.qseq).slice(0, 25).map((h, i) => (
                <Card key={`${h.rid}-${i}`} pad className="stack g-4">
                  <div className="row between g-4 wrap">
                    <div className="stack" style={{ minWidth: 0 }}>
                      <div className="card-title">{h.queryTitle} → {h.subjectAcc}</div>
                      <div className="card-sub">{h.subjectTitle}</div>
                    </div>
                    <div className="row g-2 wrap">
                      <span className={`badge ${identityClass(h.identity)}`} style={{ background: 'var(--surface-2)' }}>
                        {h.identity?.toFixed(1)}% identity
                      </span>
                      <span className="badge">E {formatEvalue(h.evalue)}</span>
                      <span className="badge">{h.alignmentLength} bp</span>
                    </div>
                  </div>
                  <Alignment hit={h} />
                </Card>
              ))}
              {filtered.filter((h) => h.qseq).length > 25 && (
                <Callout tone="info">
                  Showing the first 25 alignments of {filtered.filter((h) => h.qseq).length}. Narrow the filter, or export
                  the full set to PDF.
                </Callout>
              )}
            </div>
          )}

          {/* ── Per query ── */}
          {tab === 'summary' && (
            <div className="stack g-4">
              <Card pad className="stack g-4">
                <div className="card-title">Taxonomic distribution</div>
                {species.length ? <BarList items={species.slice(0, 8)} /> : <p className="hint">No organism names in these results.</p>}
              </Card>

              {queries.map((q) => {
                const qh = hits.filter((h) => h.queryTitle === q);
                const top = qh.reduce((best, h) => (!best || h.evalue < best.evalue ? h : best), null);
                const qSpecies = [...new Set(qh.map((h) => h.subjectSciName).filter(Boolean))];
                return (
                  <Card key={q} pad className="stack g-3">
                    <div className="row between g-4 wrap">
                      <div className="stack" style={{ minWidth: 0 }}>
                        <div className="card-title">{q}</div>
                        <div className="card-sub">
                          {qh.length} hit{qh.length === 1 ? '' : 's'} · {qSpecies.length} organism{qSpecies.length === 1 ? '' : 's'}
                          {top?.queryLen ? ` · ${top.queryLen} bp query` : ''}
                        </div>
                      </div>
                      {top && (
                        <div style={{ textAlign: 'right' }}>
                          <div className={`metric-value ${identityClass(top.identity)}`} style={{ fontSize: 'var(--t-2xl)' }}>
                            {top.identity?.toFixed(1)}%
                          </div>
                          <div className="card-sub">best identity</div>
                        </div>
                      )}
                    </div>
                    {top && (
                      <div className="t-sm">
                        Top match{' '}
                        <a className="acc-link" href={`https://www.ncbi.nlm.nih.gov/nuccore/${top.subjectAcc}`} target="_blank" rel="noopener noreferrer">
                          {top.subjectAcc}
                        </a>{' '}
                        — <em>{top.subjectSciName}</em>, E-value {formatEvalue(top.evalue)}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── AI analysis ── */}
          {tab === 'ai' && (
            <Card pad="lg" className="stack g-5">
              <div className="row between g-4 wrap">
                <div className="stack" style={{ minWidth: 0 }}>
                  <div className="card-title">Biological interpretation</div>
                  <p className="hint">
                    Generated from the hit table above. Always verify against the underlying alignments before citing.
                  </p>
                </div>
                {ai && (
                  <span className={`badge ${aiSource === 'gemini' ? 'badge-accent' : ''}`}>
                    <I.Sparkle /> {aiSource === 'gemini' && aiModel ? `Gemini ${aiModel.replace('gemini-', '')}` : 'Local summary'}
                  </span>
                )}
                {aiBusy && <span className="badge"><I.Refresh /> Analysing…</span>}
              </div>

              {aiError && <Callout tone="error" title="Analysis failed">{aiError}</Callout>}

              {ai && aiStatus !== 'completed' && aiReason && (
                <Callout tone="warning" title="AI interpretation unavailable">
                  {aiReason} The summary below is computed directly from the hit table and contains no AI inference.
                </Callout>
              )}

              {ai && aiStatus === 'completed' && (
                <p className="hint">
                  AI-generated interpretation based on the available BLAST results. Review scientific conclusions
                  against the underlying alignment data.
                </p>
              )}

              {ai && aiFlags.length > 0 && (
                <Callout tone="info" title="Computed from the alignments">
                  <ul className="flag-list">
                    {aiFlags.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                </Callout>
              )}

              {!ai ? (
                <EmptyState
                  icon={I.Sparkle}
                  title="No analysis yet"
                  desc="Summarise taxonomy, identity brackets, functional implications and suggested next steps from these hits."
                  action={
                    <Button variant="primary" onClick={runAi} disabled={aiBusy}>
                      {aiBusy ? 'Analysing…' : <><I.Sparkle /> Generate analysis</>}
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="prose">{renderAnalysis(ai)}</div>
                  <div className="row g-2 wrap">
                    <Button variant="secondary" size="sm" onClick={runAi} disabled={aiBusy}>
                      <I.Refresh /> {aiBusy ? 'Regenerating…' : 'Regenerate'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(ai); toast('Analysis copied'); }}>
                      <I.Copy /> Copy
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </>
      )}

      {/* ── Alignment drawer ── */}
      <Drawer
        open={!!openHit}
        onClose={() => setOpenHit(null)}
        title={openHit ? `${openHit.queryTitle} → ${openHit.subjectAcc}` : ''}
        sub={openHit?.subjectTitle}
      >
        {openHit && (
          <>
            <div className="metric-row">
              <Metric label="Identity" value={`${openHit.identity?.toFixed(1)}%`} foot={`${openHit.identityCount}/${openHit.alignmentLength} bases`} />
              <Metric label="E-value" value={formatEvalue(openHit.evalue)} foot={`bit score ${openHit.bitScore?.toFixed(0)}`} />
              <Metric label="Coverage" value={`${openHit.queryCoverage?.toFixed(0)}%`} foot={`${openHit.alignmentLength} bp aligned`} />
              <Metric label="Gaps" value={openHit.gapOpens ?? 0} foot={`${openHit.mismatches ?? 0} mismatches`} />
            </div>

            <div className="stack g-2">
              <div className="card-title">Alignment</div>
              <div className="row g-3 wrap t-xs muted">
                <span>Query {openHit.qStart}–{openHit.qEnd} ({openHit.queryStrand})</span>
                <span>Subject {openHit.sStart}–{openHit.sEnd} ({openHit.hitStrand})</span>
              </div>
              <Alignment hit={openHit} />
            </div>

            <div className="row g-2 wrap">
              <Button
                as="a"
                variant="secondary"
                size="sm"
                href={`https://www.ncbi.nlm.nih.gov/nuccore/${openHit.subjectAcc}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <I.External /> View on NCBI
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(openHit.hseq || ''); toast('Subject sequence copied'); }}>
                <I.Copy /> Copy subject
              </Button>
            </div>
          </>
        )}
      </Drawer>

      <Modal
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        title="Stop this search?"
        desc="Polling stops and the search is marked as stopped. Results already returned are kept. Note that batches already running on the engine will finish on their own."
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmStop(false)}>Keep running</Button>
            <Button variant="danger" onClick={stopJob}><I.Stop /> Stop search</Button>
          </>
        }
      />
    </AppShell>
  );
}
