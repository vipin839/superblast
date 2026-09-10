'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import {
  Button, Card, Callout, Field, IconButton, Input, Progress,
  Select, Stepper, Icons as I, useToast,
} from '@/components/ui';
import { DATABASES, countBases, countSequences, formatBytes } from '@/lib/format';
import { PROGRAMS, getProgram, validateQueryFasta } from '@/lib/blastPrograms';
import { usePref } from '@/lib/prefs';
import { apiFetch, apiSend, newJobId, ApiClientError } from '@/lib/apiClient';

/**
 * Force a config into a self-consistent state: the database must be one the
 * program can search, and the task must be one the program accepts.
 *
 * This also migrates defaults saved before Settings had a program selector,
 * which could pair a protein database with blastn — a combination the server
 * rejects with a 400 while the picker showed no selection at all.
 */
function reconcile(cfg) {
  const spec = getProgram(cfg.program) || PROGRAMS.blastn;
  const dbOk = DATABASES.some((d) => d.value === cfg.database && d.type === spec.dbType);
  const firstDb = DATABASES.find((d) => d.type === spec.dbType && d.ready !== false);
  const taskValues = spec.tasks.map((t) => t.value);
  return {
    ...cfg,
    program: spec.name,
    database: dbOk ? cfg.database : (firstDb?.value ?? cfg.database),
    task: taskValues.length === 0 ? '' : (taskValues.includes(cfg.task) ? cfg.task : spec.defaultTask),
  };
}

const MAX_FILES = 100;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PAYLOAD = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.fasta', '.fa', '.fna', '.faa', '.fas', '.fsa', '.txt'];
const STEPS = ['Upload', 'Configure', 'Review'];

export default function SearchPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef(null);

  const [files, setFiles] = useState([]);       // { name, size, content, sequences, bases }
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState([]);
  const [reading, setReading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);

  // Ask the server which databases are genuinely usable right now.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch('/api/databases')
      .then((d) => { if (!cancelled) setDbStatus(d.databases || []); })
      .catch(() => { /* fall back to the static catalogue */ });
    return () => { cancelled = true; };
  }, [user]);

  // Seed from the defaults saved in Settings, falling back to sensible values.
  const savedDefaults = usePref('blasthub-defaults', '');
  const seed = useMemo(() => {
    const base = { program: 'blastn', database: 'drosophila', evalue: '0.01', maxTargetSeqs: '50', task: 'megablast' };
    let merged = base;
    try { merged = savedDefaults ? { ...base, ...JSON.parse(savedDefaults) } : base; } catch { return base; }
    return reconcile(merged);
  }, [savedDefaults]);

  const [override, setOverride] = useState(null);
  const config = override ?? seed;
  const setConfig = (fn) => setOverride(typeof fn === 'function' ? fn(config) : fn);

  // The molecule the selected program requires. blastp and tblastn take
  // protein queries; the other three take nucleotide. Everything the upload
  // panel says and accepts follows from this.
  const queryType = getProgram(config.program)?.queryType ?? 'nucl';
  const unit = queryType === 'prot'
    ? { molecule: 'protein', long: 'residues', short: 'aa' }
    : { molecule: 'nucleotide', long: 'bases', short: 'bp' };

  /**
   * Switching program changes both the legal database set and the legal task
   * set, so move the selection to something valid instead of leaving an
   * impossible combination on screen for the server to reject.
   */
  const setProgram = (name) => {
    const spec = getProgram(name);
    if (!spec) return;
    setConfig((c) => reconcile({ ...c, program: name }));

    // A file accepted for one molecule can be the wrong one for another, so
    // re-check what is already staged. Surfacing it here beats a 400 at submit.
    if (spec.queryType === queryType || files.length === 0) return;
    const kept = [];
    const dropped = [];
    for (const f of files) {
      const check = validateQueryFasta(f.content, spec.queryType);
      if (check.valid) kept.push(f);
      else dropped.push({ name: f.name, reason: check.reason });
    }
    if (dropped.length === 0) return;
    setFiles(kept);
    setRejected(dropped);
  };

  useEffect(() => { if (!loading && !user) router.push('/'); }, [user, loading, router]);

  const totals = useMemo(() => ({
    files: files.length,
    sequences: files.reduce((s, f) => s + f.sequences, 0),
    bases: files.reduce((s, f) => s + f.bases, 0),
    bytes: files.reduce((s, f) => s + f.size, 0),
  }), [files]);

  const step = files.length === 0 ? 0 : submitting ? 2 : 1;

  const readFile = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsText(file);
  });

  const addFiles = useCallback(async (incoming) => {
    const list = Array.from(incoming);
    if (!list.length) return;
    setReading(true);
    const accepted = [];
    const errors = [];

    for (const file of list) {
      const ext = `.${file.name.split('.').pop().toLowerCase()}`;
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        errors.push({ name: file.name, reason: `Unsupported type. Use ${ALLOWED_EXTENSIONS.join(', ')}` });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push({ name: file.name, reason: `${formatBytes(file.size)} exceeds the 10 MB limit` });
        continue;
      }
      try {
        const content = await readFile(file);
        const check = validateQueryFasta(content, queryType);
        if (!check.valid) { errors.push({ name: file.name, reason: check.reason }); continue; }
        accepted.push({
          name: file.name,
          size: file.size,
          content,
          sequences: countSequences(content),
          bases: countBases(content),
        });
      } catch {
        errors.push({ name: file.name, reason: 'Could not read this file' });
      }
    }

    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name));
      const fresh = accepted.filter((f) => !seen.has(f.name));
      const room = MAX_FILES - prev.length;
      if (fresh.length > room) {
        errors.push({ name: `${fresh.length - room} file(s)`, reason: `Limit is ${MAX_FILES} files per search` });
      }
      return [...prev, ...fresh.slice(0, Math.max(room, 0))];
    });

    setRejected(errors);
    setReading(false);
    if (accepted.length) toast(`${accepted.length} file${accepted.length > 1 ? 's' : ''} added`);
  }, [toast, queryType]);

  const removeFile = (name) => setFiles((v) => v.filter((f) => f.name !== name));

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    setPhase({ text: 'Preparing sequences', pct: 12 });

    try {
      const sequences = files.map((f) => ({ filename: f.name, content: f.content }));
      const payload = JSON.stringify({ sequences, config });
      if (payload.length > MAX_PAYLOAD) {
        throw new Error(`Total payload is ${(payload.length / 1024 / 1024).toFixed(1)} MB. The limit is 50 MB — remove some files.`);
      }

      setPhase({ text: 'Submitting to the BLAST engine', pct: 40 });
      let data;
      try {
        data = await apiFetch('/api/blast/submit', { method: 'POST', body: payload });
      } catch (err) {
        if (err instanceof ApiClientError) {
          throw new Error(err.detail ? `${err.message} — ${err.detail}` : err.message);
        }
        throw new Error('Could not reach the BLAST server. Check your connection and try again.');
      }
      if (!data.jobs?.length) {
        throw new Error(data.errors?.map((e) => e.error).join('; ') || 'No valid sequences were accepted');
      }

      setPhase({ text: 'Saving your search', pct: 82 });

      const jobId = newJobId();
      const jobData = {
        id: jobId,
        jobs: data.jobs,
        errors: data.errors,
        config,
        fileNames: files.map((f) => f.name),
        totalFiles: files.length,
        createdAt: new Date().toISOString(),
        status: 'processing',
      };

      try {
        localStorage.setItem(`blasthub-job-${jobId}`, JSON.stringify(jobData));
        const list = JSON.parse(localStorage.getItem('blasthub-jobs') || '[]');
        localStorage.setItem('blasthub-jobs', JSON.stringify([
          { id: jobId, createdAt: jobData.createdAt, totalFiles: files.length, config, status: 'processing' },
          ...list.filter((j) => j.id !== jobId),
        ]));
      } catch { /* private browsing — the cloud copy below still runs */ }

      // The server owns ownership and validates the id; it never reads a uid
      // from this body.
      try {
        await apiSend('/api/jobs', 'POST', { jobData });
      } catch { /* the local cache above still lets the results page open */ }

      setPhase({ text: 'Opening results', pct: 100 });
      router.push(`/search/${jobId}`);
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
      setPhase(null);
    }
  }

  if (loading || !user) {
    return <AppShell title="New search"><div className="stack g-4"><div className="skeleton" style={{ height: 220, borderRadius: 'var(--r-lg)' }} /></div></AppShell>;
  }

  const programSpec = getProgram(config.program) || PROGRAMS.blastn;
  const programTasks = programSpec.tasks;

  // Only databases of the molecule this program searches, merged with what the
  // server reports right now.
  const databases = DATABASES.filter((d) => d.type === programSpec.dbType).map((d) => {
    const live = dbStatus?.find((x) => x.name === d.value);
    if (!live) return d;
    return { ...d, ready: live.available, reason: live.reason, state: live.state };
  });
  const selectedDb = databases.find((d) => d.value === config.database);

  return (
    <AppShell title="New search" crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'New search' }]}>
      <div className="page-head">
        <div>
          <h2 className="page-title">New <strong>BLAST search</strong></h2>
          <p className="page-lede">Upload FASTA files, choose a reference database, and run them against NCBI BLAST+.</p>
        </div>
      </div>

      <Card pad><Stepper steps={STEPS} current={step} /></Card>

      {submitError && (
        <Callout tone="error" title="Search could not start">
          {submitError}
        </Callout>
      )}

      <div className="grid-main">
        {/* ── Left: upload ── */}
        <div className="stack g-4">
          <Card pad="lg" className="stack g-4">
            <div>
              <div className="card-title">1 · Sequence files</div>
              <p className="hint">
                FASTA {unit.molecule} files — {config.program} takes a {unit.molecule} query.
                Up to {MAX_FILES} files, 10 MB each.
              </p>
            </div>

            <div
              className="dropzone"
              data-over={dragOver ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              aria-label="Add FASTA files by clicking, or drop them here"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            >
              <div className="dropzone-icon"><I.Upload /></div>
              <div className="dropzone-title">{reading ? 'Reading files…' : 'Drop FASTA files here'}</div>
              <div className="dropzone-hint">or click to browse · {ALLOWED_EXTENSIONS.join('  ')}</div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS.join(',')}
                className="sr-only"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {rejected.length > 0 && (
              <Callout tone="warning" title={`${rejected.length} file${rejected.length > 1 ? 's' : ''} not added`}>
                <ul style={{ margin: 0, paddingLeft: 'var(--s-5)' }}>
                  {rejected.map((r) => <li key={r.name}><strong>{r.name}</strong> — {r.reason}</li>)}
                </ul>
              </Callout>
            )}

            {files.length > 0 && (
              <div className="stack g-3">
                <div className="row between g-3 wrap">
                  <span className="t-sm" style={{ fontWeight: 700 }}>
                    {totals.files} file{totals.files === 1 ? '' : 's'} · {totals.sequences} sequence{totals.sequences === 1 ? '' : 's'} · {totals.bases.toLocaleString()} {unit.long}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => { setFiles([]); setRejected([]); }}>
                    <I.Trash /> Clear all
                  </Button>
                </div>

                <div className="file-list">
                  {files.map((f) => (
                    <div key={f.name} className="file-card">
                      <span className="file-icon"><I.File /></span>
                      <span className="file-main">
                        <span className="file-name">{f.name}</span>
                        <span className="file-meta">
                          <span>{formatBytes(f.size)}</span><span className="sep" />
                          <span>{f.sequences} seq</span><span className="sep" />
                          <span className="mono">{f.bases.toLocaleString()} {unit.short}</span>
                        </span>
                      </span>
                      <span className="badge badge-success"><I.Check /> Valid</span>
                      <IconButton label={`Remove ${f.name}`} size="sm" onClick={() => removeFile(f.name)}><I.X /></IconButton>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Right: configuration ── */}
        <div className="stack g-4">
          <Card pad="lg" className="stack g-5">
            <div>
              <div className="card-title">2 · Search parameters</div>
              <p className="hint">{programSpec.summary}</p>
            </div>

            <Field
              label="BLAST program"
              htmlFor="program"
              hint={`${programSpec.queryType === 'prot' ? 'Protein' : 'Nucleotide'} query → ${programSpec.dbType === 'prot' ? 'protein' : 'nucleotide'} database`}
            >
              <Select id="program" value={config.program} onChange={(e) => setProgram(e.target.value)}>
                {Object.values(PROGRAMS).map((p) => (
                  <option key={p.name} value={p.name}>{p.label} — {p.summary}</option>
                ))}
              </Select>
            </Field>

            <Field label="Reference database" htmlFor="db" hint={selectedDb?.ready === false ? (selectedDb.reason || 'This database is not currently available on the server.') : `Indexed and ready · ${selectedDb?.size}`}>
              <Select id="db" value={config.database} onChange={(e) => setConfig((c) => ({ ...c, database: e.target.value }))}>
                {databases.map((d) => (
                  <option key={d.value} value={d.value} disabled={!d.ready}>
                    {d.label}{d.ready ? '' : ' — unavailable'}
                  </option>
                ))}
              </Select>
            </Field>

            {programTasks.length > 0 ? (
              <Field label="Search task" htmlFor="task" hint={programTasks.find((t) => t.value === config.task)?.desc}>
                <Select id="task" value={config.task} onChange={(e) => setConfig((c) => ({ ...c, task: e.target.value }))}>
                  {programTasks.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
            ) : (
              <Field label="Search task" hint={`${programSpec.label} has no task variants.`}>
                <Input value="—" readOnly aria-readonly="true" />
              </Field>
            )}

            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
                <I.Settings /> {showAdvanced ? 'Hide' : 'Show'} advanced settings
              </Button>
            </div>

            {showAdvanced && (
              <div className="stack g-5">
                <Field
                  label="E-value threshold"
                  htmlFor="evalue"
                  hint="Expected hits by chance. Lower is stricter — 1e-5 or below is strong evidence."
                >
                  <Input
                    id="evalue"
                    value={config.evalue}
                    inputMode="decimal"
                    onChange={(e) => setConfig((c) => ({ ...c, evalue: e.target.value }))}
                  />
                </Field>

                <Field label="Maximum target sequences" htmlFor="maxt" hint="Hits kept per query, 1–500.">
                  <Input
                    id="maxt"
                    type="number"
                    min="1"
                    max="500"
                    value={config.maxTargetSeqs}
                    onChange={(e) => setConfig((c) => ({ ...c, maxTargetSeqs: e.target.value }))}
                  />
                </Field>
              </div>
            )}
          </Card>

          {/* ── Review + run ── */}
          <Card inverse pad="lg" className="stack g-4">
            <div className="card-title">3 · Review and run</div>
            <div className="stack g-2 t-sm">
              <div className="row between g-3"><span className="muted">Files</span><span className="mono">{totals.files}</span></div>
              <div className="row between g-3"><span className="muted">Sequences</span><span className="mono">{totals.sequences}</span></div>
              <div className="row between g-3"><span className="muted">Total {unit.long}</span><span className="mono">{totals.bases.toLocaleString()}</span></div>
              <div className="row between g-3"><span className="muted">Program</span><span className="mono">{config.program}</span></div>
              <div className="row between g-3"><span className="muted">Database</span><span className="mono">{config.database}</span></div>
              <div className="row between g-3"><span className="muted">Task</span><span className="mono">{config.task}</span></div>
              <div className="row between g-3"><span className="muted">E-value</span><span className="mono">{config.evalue}</span></div>
            </div>

            {submitting && phase && (
              <div className="stack g-2">
                <Progress value={phase.pct} label={phase.text} />
                <span className="t-xs muted">{phase.text}…</span>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              className="btn-block"
              disabled={files.length === 0 || submitting || reading}
              onClick={handleSubmit}
            >
              {submitting ? 'Running…' : <><I.Beaker /> Run BLAST search</>}
            </Button>

            {files.length === 0 && <p className="t-xs muted" style={{ textAlign: 'center' }}>Add at least one FASTA file to continue.</p>}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
