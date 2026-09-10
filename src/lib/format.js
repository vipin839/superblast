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
 * Static catalogue used for the picker before /api/databases responds; the
 * server's live state always wins. `type` mirrors the molecule so the UI can
 * filter to what the chosen program can actually search.
 */
export const DATABASES = [
  // Drosophila melanogaster
  { value: 'drosophila', type: 'nucl', label: 'D. melanogaster — RefSeq RNA (GCF_000001215.4)', short: 'D. melanogaster RNA', size: '~24 MB', ready: true },
  { value: 'drosophila_genome', type: 'nucl', label: 'D. melanogaster — reference genome (GCF_000001215.4)', short: 'D. melanogaster genome', size: '~44 MB', ready: true },
  { value: 'drosophila_protein', type: 'prot', label: 'D. melanogaster — proteins (GCF_000001215.4)', short: 'D. melanogaster protein', size: '~9 MB', ready: true },
  // Escherichia coli K-12 MG1655
  { value: 'ecoli', type: 'nucl', label: 'E. coli K-12 MG1655 — genome (GCF_000005845.2)', short: 'E. coli genome', size: '~1.4 MB', ready: true },
  { value: 'ecoli_protein', type: 'prot', label: 'E. coli K-12 MG1655 — proteins (GCF_000005845.2)', short: 'E. coli protein', size: '~0.9 MB', ready: true },
  // Saccharomyces cerevisiae S288C
  { value: 'yeast_genome', type: 'nucl', label: 'S. cerevisiae S288C — reference genome (GCF_000146045.2)', short: 'S. cerevisiae genome', size: '~3.7 MB', ready: true },
  { value: 'yeast', type: 'nucl', label: 'S. cerevisiae S288C — RefSeq RNA (GCF_000146045.2)', short: 'S. cerevisiae RNA', size: '~2.7 MB', ready: true },
  { value: 'yeast_protein', type: 'prot', label: 'S. cerevisiae S288C — proteins (GCF_000146045.2)', short: 'S. cerevisiae protein', size: '~1.8 MB', ready: true },
  // SARS-CoV-2
  { value: 'sarscov2', type: 'nucl', label: 'SARS-CoV-2 — reference genome NC_045512.2', short: 'SARS-CoV-2', size: '~30 kB', ready: true },
  { value: 'sarscov2_protein', type: 'prot', label: 'SARS-CoV-2 — proteins (GCF_009858895.2)', short: 'SARS-CoV-2 protein', size: '~30 kB', ready: true },
  // Mixed viral set
  { value: 'viruses', type: 'nucl', label: 'Viral set — SARS-CoV-2 and HIV-1', short: 'Viral set', size: '~40 kB', ready: true },
  // Registered but withheld
  { value: 'human', type: 'nucl', label: 'Human genome GRCh38.p14', short: 'H. sapiens GRCh38', size: '~3.2 GB', ready: false },
];

export const dbLabel = (v) => DATABASES.find((d) => d.value === v)?.short || v || '—';

/** Databases a given program can search, filtered by molecule type. */
export const databasesFor = (dbType) => DATABASES.filter((d) => !dbType || d.type === dbType);

/** blastn tasks the engine supports. Protein programs are not wired up. */
/**
 * blastn tasks, kept for existing imports. New code should read the task list
 * from PROGRAMS in lib/blastPrograms.js, which covers all five programs.
 */
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
