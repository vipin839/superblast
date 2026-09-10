import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

export const DB_DIR = process.env.BLASTDB || (process.env.NODE_ENV === 'production' ? '/app/blastdb' : './blastdb');

/**
 * Reference database registry.
 *
 * Every field here describes something that is actually true of the database
 * as built by the Dockerfile. `selectable` controls whether the database is
 * offered in the UI at all — a database that cannot succeed must not be
 * offered with a "Ready" badge.
 */
export const DATABASE_REGISTRY = {
  drosophila: {
    name: 'drosophila',
    label: 'Drosophila melanogaster RefSeq RNA',
    organism: 'Drosophila melanogaster',
    source: 'NCBI RefSeq',
    accession: 'GCF_000001215.4',
    assembly: 'Release 6 plus ISO1 MT',
    moleculeType: 'RNA (transcripts)',
    dbType: 'nucl',
    bakedIn: true,
    selectable: true,
  },
  drosophila_genome: {
    name: 'drosophila_genome',
    label: 'Drosophila melanogaster reference genome',
    organism: 'Drosophila melanogaster',
    source: 'NCBI RefSeq',
    accession: 'GCF_000001215.4',
    assembly: 'Release 6 plus ISO1 MT',
    assemblyLevel: 'Chromosome',
    moleculeType: 'Genomic DNA',
    dbType: 'nucl',
    bakedIn: true,
    selectable: true,
  },
  ecoli: {
    name: 'ecoli',
    label: 'Escherichia coli K-12 MG1655',
    organism: 'Escherichia coli str. K-12 substr. MG1655',
    source: 'NCBI RefSeq',
    accession: 'GCF_000005845.2',
    assembly: 'ASM584v2',
    moleculeType: 'Genomic DNA',
    dbType: 'nucl',
    bakedIn: true,
    selectable: true,
  },
  viruses: {
    name: 'viruses',
    label: 'SARS-CoV-2 and HIV-1 reference genomes',
    organism: 'Severe acute respiratory syndrome coronavirus 2; Human immunodeficiency virus 1',
    source: 'NCBI Nucleotide',
    accession: 'NC_045512.2, NC_001802.1',
    assembly: 'RefSeq reference genomes',
    moleculeType: 'Viral genomic',
    dbType: 'nucl',
    bakedIn: true,
    selectable: true,
  },
  sarscov2: {
    name: 'sarscov2',
    label: 'SARS-CoV-2 reference genome',
    organism: 'Severe acute respiratory syndrome coronavirus 2',
    source: 'NCBI RefSeq',
    accession: 'NC_045512.2 (assembly GCF_009858895.2)',
    assembly: 'ASM985889v3',
    assemblyLevel: 'Complete genome',
    moleculeType: 'Viral genomic RNA (cDNA)',
    dbType: 'nucl',
    bakedIn: true,
    selectable: true,
  },
  human: {
    name: 'human',
    label: 'Human genome GRCh38.p14',
    organism: 'Homo sapiens',
    source: 'NCBI RefSeq',
    accession: 'GCF_000001405.40',
    assembly: 'GRCh38.p14',
    moleculeType: 'Genomic DNA',
    dbType: 'nucl',
    bakedIn: false,
    // Disabled, honestly. The full assembly is ~3.2 GB expanded and needs a
    // makeblastdb pass on top of that; the Cloud Run instance has 4 GiB of
    // RAM-backed writable storage and a 300 s request timeout. Provisioning it
    // inside a user request cannot succeed, so the option is withdrawn rather
    // than shown as available and failing every time.
    selectable: false,
    unavailableReason:
      'The human genome database is not provisioned on this deployment. It requires persistent disk and a pre-built index; ' +
      'it cannot be downloaded during a request on the current Cloud Run configuration.',
  },
};

// Per-database execution timeouts.
export const DB_TIMEOUTS = {
  drosophila: 120_000,
  drosophila_genome: 240_000,   // ~144 Mbase assembly
  ecoli: 120_000,
  sarscov2: 60_000,
  viruses: 60_000,
  human: 600_000,
};

/**
 * Index files makeblastdb produces for a BLASTDB v5 nucleotide database.
 * Checking only `.ndb` (as the original code did) reported a half-written or
 * interrupted database as ready.
 */
const REQUIRED_EXTENSIONS = ['.ndb', '.nhr', '.nin', '.nsq', '.not', '.ntf', '.nto'];

export function getDatabasePath(dbName) {
  const safe = String(dbName).replace(/[^a-zA-Z0-9_-]/g, '');
  // DB_DIR is an absolute path outside the project (/app/blastdb). The
  // turbopackIgnore hint stops the bundler tracing the whole repo into the
  // standalone output because of this dynamic join.
  return path.join(/* turbopackIgnore: true */ DB_DIR, safe);
}

export function isSelectable(dbName) {
  return !!DATABASE_REGISTRY[dbName]?.selectable;
}

export function listSelectableDatabases() {
  return Object.values(DATABASE_REGISTRY).filter((d) => d.selectable);
}

/** Which of the required index files are present. */
async function indexFileReport(dbName) {
  const base = getDatabasePath(dbName);
  const present = [];
  const missing = [];
  await Promise.all(REQUIRED_EXTENSIONS.map(async (ext) => {
    try {
      const st = await fs.stat(base + ext);
      if (st.size > 0) present.push(ext); else missing.push(ext);
    } catch {
      missing.push(ext);
    }
  }));
  return { present: present.sort(), missing: missing.sort() };
}

/**
 * Ask BLAST+ itself whether the database is usable, and parse the metadata it
 * reports. This is the only check that proves the index is actually readable.
 */
export async function inspectDatabase(dbName) {
  const dbPath = getDatabasePath(dbName);
  try {
    const { stdout } = await execFileAsync('blastdbcmd', ['-info', '-db', dbPath], { timeout: 30_000 });
    const seqMatch = /([\d,]+)\s+sequences;\s+([\d,]+)\s+total bases/i.exec(stdout);
    const titleMatch = /Database:\s*(.+)/i.exec(stdout);
    const dateMatch = /Date:\s*(.+?)\s{2,}/i.exec(stdout);
    return {
      ok: true,
      raw: stdout.trim(),
      title: titleMatch ? titleMatch[1].trim() : null,
      sequenceCount: seqMatch ? Number(seqMatch[1].replace(/,/g, '')) : null,
      totalLetters: seqMatch ? Number(seqMatch[2].replace(/,/g, '')) : null,
      date: dateMatch ? dateMatch[1].trim() : null,
    };
  } catch (err) {
    return { ok: false, error: (err.stderr || err.message || '').split('\n')[0].slice(0, 300) };
  }
}

/**
 * Database state machine. Returns exactly one of:
 * NOT_CONFIGURED | UNAVAILABLE | INCOMPLETE | CORRUPT | READY
 */
export async function checkDatabaseStatus(dbName, { deep = false } = {}) {
  const info = DATABASE_REGISTRY[dbName];
  if (!info) {
    return { state: 'NOT_CONFIGURED', available: false, label: 'Unknown', error: `Unknown database: ${dbName}` };
  }

  if (!info.selectable) {
    return {
      state: 'UNAVAILABLE',
      available: false,
      label: info.label,
      canDownload: false,
      error: info.unavailableReason || 'This database is not available on this deployment.',
    };
  }

  const files = await indexFileReport(dbName);
  if (files.missing.length === REQUIRED_EXTENSIONS.length) {
    return {
      state: 'NOT_CONFIGURED', available: false, label: info.label,
      // Only a database with a download URL can be fetched. The original
      // expression `!bakedIn || true` was always true.
      canDownload: !info.bakedIn && !!info.downloadUrl,
      missingFiles: files.missing,
      error: `Database "${info.label}" is not present on this server.`,
    };
  }
  if (files.missing.length > 0) {
    return {
      state: 'INCOMPLETE', available: false, label: info.label, canDownload: false,
      missingFiles: files.missing,
      error: `Database "${info.label}" is missing index files: ${files.missing.join(', ')}.`,
    };
  }

  if (!deep) {
    return { state: 'READY', available: true, label: info.label, ...info };
  }

  const probe = await inspectDatabase(dbName);
  if (!probe.ok) {
    return { state: 'CORRUPT', available: false, label: info.label, error: probe.error };
  }
  if (!probe.sequenceCount) {
    return { state: 'CORRUPT', available: false, label: info.label, error: 'Database reports zero sequences.' };
  }
  return {
    state: 'READY', available: true, label: info.label, ...info,
    sequenceCount: probe.sequenceCount,
    totalLetters: probe.totalLetters,
    title: probe.title,
    builtAt: probe.date,
  };
}

/**
 * Confirm a database is usable before a search. There is no on-demand
 * download path any more: every selectable database is baked into the image,
 * so a missing one is a deployment fault, not something to fix mid-request.
 */
export async function ensureDatabase(dbName) {
  const status = await checkDatabaseStatus(dbName);
  if (status.available) return true;
  throw new Error(status.error || `Database "${dbName}" is not available.`);
}

/** Full status of every registered database, including the disabled ones. */
export async function listDatabases({ deep = false } = {}) {
  const result = {};
  for (const name of Object.keys(DATABASE_REGISTRY)) {
    result[name] = await checkDatabaseStatus(name, { deep });
  }
  return result;
}
