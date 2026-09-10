/**
 * The five BLAST search programs, and the rules that decide which query and
 * which database each one can accept.
 *
 * Getting this wrong produces confusing failures deep inside BLAST+, so the
 * matrix is declared once here and enforced before a process is ever spawned.
 *
 *   program   query molecule   database molecule   what is translated
 *   ────────────────────────────────────────────────────────────────────
 *   blastn    nucleotide       nucleotide          nothing
 *   blastp    protein          protein             nothing
 *   blastx    nucleotide       protein             the query, 6 frames
 *   tblastn   protein          nucleotide          the database, 6 frames
 *   tblastx   nucleotide       nucleotide          both, 6 frames each
 */

export const PROGRAMS = {
  blastn: {
    name: 'blastn',
    label: 'blastn',
    queryType: 'nucl',
    dbType: 'nucl',
    summary: 'Nucleotide query against a nucleotide database.',
    tasks: [
      { value: 'megablast', label: 'megablast', desc: 'Highly similar sequences. Fastest; best within a species.' },
      { value: 'dc-megablast', label: 'dc-megablast', desc: 'Discontiguous. Finds more divergent, cross-species matches.' },
      { value: 'blastn', label: 'blastn', desc: 'Traditional, most sensitive for short or divergent queries.' },
      { value: 'blastn-short', label: 'blastn-short', desc: 'Tuned for queries under about 30 bases.' },
    ],
    defaultTask: 'megablast',
    // Minimum -word_size accepted by each task.
    wordSize: { megablast: [16, 64], 'dc-megablast': [11, 64], blastn: [4, 64], 'blastn-short': [4, 64] },
  },

  blastp: {
    name: 'blastp',
    label: 'blastp',
    queryType: 'prot',
    dbType: 'prot',
    summary: 'Protein query against a protein database.',
    tasks: [
      { value: 'blastp', label: 'blastp', desc: 'Standard protein search.' },
      { value: 'blastp-fast', label: 'blastp-fast', desc: 'Faster, slightly less sensitive.' },
      { value: 'blastp-short', label: 'blastp-short', desc: 'Tuned for peptides under about 30 residues.' },
    ],
    defaultTask: 'blastp',
    wordSize: { blastp: [2, 7], 'blastp-fast': [2, 7], 'blastp-short': [2, 7] },
    supportsMatrix: true,
  },

  blastx: {
    name: 'blastx',
    label: 'blastx',
    queryType: 'nucl',
    dbType: 'prot',
    summary: 'Nucleotide query translated in six frames, against a protein database.',
    tasks: [
      { value: 'blastx', label: 'blastx', desc: 'Standard translated search.' },
      { value: 'blastx-fast', label: 'blastx-fast', desc: 'Faster, slightly less sensitive.' },
    ],
    defaultTask: 'blastx',
    wordSize: { blastx: [2, 7], 'blastx-fast': [2, 7] },
    supportsMatrix: true,
    supportsGeneticCode: true,
  },

  tblastn: {
    name: 'tblastn',
    label: 'tblastn',
    queryType: 'prot',
    dbType: 'nucl',
    summary: 'Protein query against a nucleotide database translated in six frames.',
    tasks: [
      { value: 'tblastn', label: 'tblastn', desc: 'Standard search against translated nucleotides.' },
      { value: 'tblastn-fast', label: 'tblastn-fast', desc: 'Faster, slightly less sensitive.' },
    ],
    defaultTask: 'tblastn',
    wordSize: { tblastn: [2, 7], 'tblastn-fast': [2, 7] },
    supportsMatrix: true,
    supportsGeneticCode: true,
  },

  tblastx: {
    name: 'tblastx',
    label: 'tblastx',
    queryType: 'nucl',
    dbType: 'nucl',
    summary: 'Both query and database translated in six frames. Very slow; use short queries.',
    // tblastx takes no -task argument.
    tasks: [],
    defaultTask: null,
    wordSize: { default: [2, 7] },
    supportsMatrix: true,
    supportsGeneticCode: true,
  },
};

export const PROGRAM_NAMES = Object.keys(PROGRAMS);

/** Scoring matrices accepted by the protein-scoring programs. */
export const MATRICES = ['BLOSUM62', 'BLOSUM45', 'BLOSUM80', 'PAM30', 'PAM70', 'PAM250'];
export const DEFAULT_MATRIX = 'BLOSUM62';

export function getProgram(name) {
  return PROGRAMS[name] || null;
}

export function isValidProgram(name) {
  return Object.prototype.hasOwnProperty.call(PROGRAMS, name);
}

/** Does this program accept a database of this molecule type? */
export function programAcceptsDb(programName, dbType) {
  const p = PROGRAMS[programName];
  return !!p && p.dbType === dbType;
}

/** What molecule must the uploaded query be for this program? */
export function requiredQueryType(programName) {
  return PROGRAMS[programName]?.queryType || null;
}

/** Valid task values for a program, or [] when the program takes no -task. */
export function tasksFor(programName) {
  return PROGRAMS[programName]?.tasks?.map((t) => t.value) || [];
}

/** Allowed [min, max] word size for a program/task pair. */
export function wordSizeRange(programName, task) {
  const p = PROGRAMS[programName];
  if (!p) return null;
  return p.wordSize[task] || p.wordSize.default || Object.values(p.wordSize)[0] || null;
}

/**
 * Classify a FASTA payload as nucleotide or protein.
 *
 * Judged on residue composition rather than a strict alphabet: DNA/RNA use a
 * 4-to-5 letter alphabet, so a sequence that is overwhelmingly ACGTUN is
 * nucleotide and anything with a meaningful share of the other amino-acid
 * letters is protein. Ambiguity codes mean this cannot be exact, so short
 * sequences report 'unknown' rather than guessing.
 */
export function detectSequenceType(fasta) {
  const residues = String(fasta || '')
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('>'))
    .join('')
    .replace(/[\s\-*]/g, '')
    .toUpperCase();

  if (residues.length === 0) return { type: 'empty', residues: 0, nucleotideFraction: 0 };

  const nucleotideLike = (residues.match(/[ACGTUN]/g) || []).length;
  const fraction = nucleotideLike / residues.length;

  // Amino-acid-only letters: none of these occur in the nucleotide alphabet.
  const proteinOnly = (residues.match(/[EFILPQZJX*]/g) || []).length;

  if (residues.length < 12) return { type: 'unknown', residues: residues.length, nucleotideFraction: fraction };
  if (fraction >= 0.9 && proteinOnly / residues.length < 0.05) {
    return { type: 'nucl', residues: residues.length, nucleotideFraction: fraction };
  }
  if (fraction < 0.75) {
    return { type: 'prot', residues: residues.length, nucleotideFraction: fraction };
  }
  return { type: 'unknown', residues: residues.length, nucleotideFraction: fraction };
}

/**
 * IUPAC residue alphabets, by molecule. `U` covers RNA on the nucleotide side
 * and selenocysteine on the protein side; `*` is a translated stop codon and
 * `-` / `.` are gap characters, all of which occur in real FASTA files.
 */
const RESIDUE_ALPHABET = {
  nucl: /^[ACGTUNRYSWKMBDHV\s.*-]+$/i,
  prot: /^[ACDEFGHIKLMNPQRSTVWYBZXJUO\s.*-]+$/i,
};

/**
 * Validate an uploaded FASTA file against the molecule a program requires.
 *
 * The browser calls this before upload so a rejection is instant, and it
 * enforces the same contract as the submit route: structure, then
 * composition, then residue alphabet.
 *
 * Composition is checked BEFORE the alphabet, because the two failures need
 * different answers. A file that is simply the wrong molecule is the common
 * case and the user's fix is to change program — telling them instead that
 * line 2 holds a bad character is true but useless, and a protein file fails
 * the nucleotide alphabet on its first line of sequence, so an alphabet-first
 * order never reaches the message that helps. Once composition agrees, a
 * stray character means a malformed file rather than the wrong one, and the
 * line number is then the useful part.
 *
 * @param {string} content   raw file contents
 * @param {'nucl'|'prot'} queryType  molecule the selected program requires
 */
export function validateQueryFasta(content, queryType) {
  const wanted = queryType === 'prot' ? 'prot' : 'nucl';
  const molecule = wanted === 'prot' ? 'protein' : 'nucleotide';
  const trimmed = String(content || '').trim();

  if (!trimmed.startsWith('>')) {
    return { valid: false, reason: 'Must begin with a > header line' };
  }

  const lines = trimmed.split(/\r?\n/);
  const hasSequence = lines.slice(1)
    .some((l) => { const t = l.trim(); return t.length > 0 && !t.startsWith('>'); });
  if (!hasSequence) return { valid: false, reason: 'No sequence data after the header' };

  const detected = detectSequenceType(trimmed);
  if ((detected.type === 'nucl' || detected.type === 'prot') && detected.type !== wanted) {
    const got = detected.type === 'prot' ? 'protein' : 'nucleotide';
    const switchTo = detected.type === 'prot'
      ? 'blastp or tblastn'
      : 'blastn, blastx or tblastx';
    return {
      valid: false,
      reason: `This is a ${got} sequence, but the selected program needs a ${molecule} query. `
        + `Change the BLAST program to ${switchTo}, then add the file again.`,
    };
  }

  const alphabet = RESIDUE_ALPHABET[wanted];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('>') || line.length === 0) continue;
    if (!alphabet.test(line)) {
      return { valid: false, reason: `Line ${i + 1} contains a character that is not a ${molecule} residue` };
    }
  }

  return { valid: true };
}
