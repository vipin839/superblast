/**
 * Shared formatting helpers.
 * These are the single source of truth — do not re-implement per page.
 */

export function formatEvalue(v) {
  if (v === undefined || v === null || Number.isNaN(v)) return 'N/A';
  if (v === 0) return '0.0';
  if (v < 0.0001) return v.toExponential(1);
  if (v < 1) return v.toFixed(4);
  return v.toFixed(1);
}

/**
 * Identity brackets follow the convention the AI prompt already uses:
 * >=95 species-level, >=80 family, >=50 distant, below that noise.
 * Returned class names all exist in globals.css.
 */
export function identityClass(pct) {
  if (pct >= 95) return 'id-95';
  if (pct >= 80) return 'id-80';
  if (pct >= 50) return 'id-50';
  return 'id-low';
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (Number.isNaN(s)) return '';
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Human labels for the four databases the backend actually accepts. */
/**
 * Static catalogue. `ready` here is only the fallback shown before
 * /api/databases responds — the server's live state always wins.
 */
export const DATABASES = [
  { value: 'drosophila', label: 'Drosophila melanogaster — RefSeq RNA (GCF_000001215.4)', short: 'D. melanogaster RNA', size: '~24 MB', ready: true },
  { value: 'drosophila_genome', label: 'Drosophila melanogaster — reference genome (GCF_000001215.4)', short: 'D. melanogaster genome', size: '~44 MB', ready: true },
  { value: 'ecoli', label: 'Escherichia coli K-12 MG1655 (GCF_000005845.2)', short: 'E. coli K-12', size: '~1.4 MB', ready: true },
  { value: 'sarscov2', label: 'SARS-CoV-2 — reference genome NC_045512.2', short: 'SARS-CoV-2', size: '~30 kB', ready: true },
  { value: 'viruses', label: 'Viral set — SARS-CoV-2 and HIV-1', short: 'Viral set', size: '~40 kB', ready: true },
  { value: 'human', label: 'Human genome GRCh38.p14', short: 'H. sapiens GRCh38', size: '~3.2 GB', ready: false },
];

export const dbLabel = (v) => DATABASES.find((d) => d.value === v)?.short || v || '—';

/** blastn tasks the engine supports. Protein programs are not wired up. */
export const TASKS = [
  { value: 'megablast', label: 'megablast', desc: 'Highly similar sequences. Fastest, best for same-species matches.' },
  { value: 'dc-megablast', label: 'dc-megablast', desc: 'Discontiguous. Finds more divergent, cross-species matches.' },
  { value: 'blastn', label: 'blastn', desc: 'Traditional. Most sensitive, slowest — use for distant homology.' },
];

/** Count sequences in a FASTA string without loading it twice. */
export function countSequences(content) {
  let n = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '>' && (i === 0 || content[i - 1] === '\n')) n++;
  }
  return n;
}

/** Total residues, headers and whitespace excluded. */
export function countBases(content) {
  return content
    .split('\n')
    .filter((l) => !l.startsWith('>'))
    .join('')
    .replace(/\s/g, '').length;
}
