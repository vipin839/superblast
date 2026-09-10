import { describe, it, expect } from 'vitest';
import {
  PROGRAMS, PROGRAM_NAMES, MATRICES,
  getProgram, isValidProgram, programAcceptsDb, requiredQueryType,
  tasksFor, wordSizeRange, detectSequenceType, validateQueryFasta,
} from '@/lib/blastPrograms';
import { DATABASE_REGISTRY, listSelectableDatabases, databaseType } from '@/lib/dbManager';

describe('program matrix', () => {
  it('defines all five BLAST search programs', () => {
    expect(PROGRAM_NAMES.sort()).toEqual(['blastn', 'blastp', 'blastx', 'tblastn', 'tblastx']);
  });

  /** The molecule combination each program is defined by. Getting any of
   *  these wrong sends an incompatible database to BLAST+. */
  const matrix = [
    ['blastn',  'nucl', 'nucl'],
    ['blastp',  'prot', 'prot'],
    ['blastx',  'nucl', 'prot'],
    ['tblastn', 'prot', 'nucl'],
    ['tblastx', 'nucl', 'nucl'],
  ];

  for (const [prog, query, db] of matrix) {
    it(`${prog}: ${query} query against a ${db} database`, () => {
      expect(requiredQueryType(prog)).toBe(query);
      expect(programAcceptsDb(prog, db)).toBe(true);
      expect(programAcceptsDb(prog, db === 'nucl' ? 'prot' : 'nucl')).toBe(false);
    });
  }

  it('rejects unknown programs', () => {
    for (const bad of ['psiblast', 'blastn2', '', null, 'BLASTN']) {
      expect(isValidProgram(bad)).toBe(false);
    }
  });

  it('gives tblastx no task list, because it takes no -task argument', () => {
    expect(tasksFor('tblastx')).toEqual([]);
    expect(PROGRAMS.tblastx.defaultTask).toBeNull();
  });

  it('gives every other program a default task that is in its own list', () => {
    for (const name of PROGRAM_NAMES) {
      const tasks = tasksFor(name);
      if (tasks.length === 0) continue;
      expect(tasks, `${name} default must be a listed task`).toContain(PROGRAMS[name].defaultTask);
    }
  });

  it('uses the real BLAST+ word-size minimums', () => {
    expect(wordSizeRange('blastn', 'megablast')[0]).toBe(16);
    expect(wordSizeRange('blastn', 'dc-megablast')[0]).toBe(11);
    expect(wordSizeRange('blastn', 'blastn')[0]).toBe(4);
    // Protein-scoring programs use very small words.
    expect(wordSizeRange('blastp', 'blastp')[1]).toBe(7);
    expect(wordSizeRange('tblastx', null)[1]).toBe(7);
  });

  it('offers a scoring matrix only for the protein-scoring programs', () => {
    expect(getProgram('blastn').supportsMatrix).toBeFalsy();
    for (const p of ['blastp', 'blastx', 'tblastn', 'tblastx']) {
      expect(getProgram(p).supportsMatrix, p).toBe(true);
    }
    expect(MATRICES).toContain('BLOSUM62');
  });
});

describe('database registry covers every program', () => {
  it('provides at least one selectable database for each program', () => {
    for (const name of PROGRAM_NAMES) {
      const spec = getProgram(name);
      const usable = listSelectableDatabases(spec.dbType);
      expect(usable.length, `${name} has no searchable database`).toBeGreaterThan(0);
    }
  });

  it('has both nucleotide and protein sets for each model organism', () => {
    const pairs = [
      ['drosophila_genome', 'drosophila_protein'],
      ['ecoli', 'ecoli_protein'],
      ['yeast_genome', 'yeast_protein'],
      ['sarscov2', 'sarscov2_protein'],
    ];
    for (const [nucl, prot] of pairs) {
      expect(databaseType(nucl), nucl).toBe('nucl');
      expect(databaseType(prot), prot).toBe('prot');
      // Both halves must describe the same organism.
      expect(DATABASE_REGISTRY[nucl].taxid).toBe(DATABASE_REGISTRY[prot].taxid);
    }
  });

  it('records a taxid for every selectable database, so hits resolve an organism', () => {
    for (const d of listSelectableDatabases()) {
      expect(Number(d.taxid), `${d.name} has no taxid`).toBeGreaterThan(0);
    }
  });

  it('keeps the human database registered but not selectable', () => {
    expect(DATABASE_REGISTRY.human.selectable).toBe(false);
    expect(DATABASE_REGISTRY.human.unavailableReason).toMatch(/not provisioned/i);
  });
});

describe('sequence type detection', () => {
  const dna = '>x\nATGGCTAGCTAGCTAGCATCGATCGATCGTAGCTAGCTAGCATCGATCGATCGTAGCTAGC';
  const rna = '>x\nAUGGCUAGCUAGCUAGCAUCGAUCGAUCGUAGCUAGCUAGCAUCGAUCGAUCGUAGCUAGC';
  const prot = '>x\nMKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKA';

  it('recognises DNA and RNA as nucleotide', () => {
    expect(detectSequenceType(dna).type).toBe('nucl');
    expect(detectSequenceType(rna).type).toBe('nucl');
  });

  it('recognises protein', () => {
    expect(detectSequenceType(prot).type).toBe('prot');
  });

  it('is not fooled by a protein that happens to start with ACGT letters', () => {
    // Alanine-Cysteine-Glycine-Threonine then unambiguous amino acids.
    expect(detectSequenceType('>x\nACGTMKWYLPQEFILPQRSTVWYEFILPQRSTVWYMKWYLPQEF').type).toBe('prot');
  });

  it('reports empty input rather than guessing', () => {
    expect(detectSequenceType('>x\n').type).toBe('empty');
    expect(detectSequenceType('').type).toBe('empty');
  });

  it('declines to classify a very short sequence', () => {
    expect(detectSequenceType('>x\nATGC').type).toBe('unknown');
  });

  it('ignores gaps, stops and whitespace when measuring', () => {
    expect(detectSequenceType('>x\nATG GCT-AGC\nTAGCTAGCATCGATCGATCGTAGCTAGC').type).toBe('nucl');
  });

  it('handles CRLF line endings', () => {
    expect(detectSequenceType('>x\r\nATGGCTAGCTAGCTAGCATCGATCGATCGTAGCTAGCTAGC\r\n').type).toBe('nucl');
  });
});

/**
 * Regression: Settings offered every ready database, including the four
 * protein ones, while saved defaults carried no `program` field. Picking a
 * protein database produced {program:'blastn', database:'ecoli_protein'} —
 * a combination the search page could not display and the server rejects
 * with a 400. Both pages now reconcile the pairing.
 */
describe('program/database pairing must be self-consistent', () => {
  // Mirrors reconcile() in search/page.js and setDefaultProgram() in settings.
  const reconcile = (cfg, DATABASES) => {
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
  };

  const CATALOGUE = [
    { value: 'drosophila', type: 'nucl', ready: true },
    { value: 'ecoli', type: 'nucl', ready: true },
    { value: 'ecoli_protein', type: 'prot', ready: true },
    { value: 'yeast_protein', type: 'prot', ready: true },
    { value: 'human', type: 'nucl', ready: false },
  ];

  it('heals a protein database saved against blastn', () => {
    const r = reconcile({ program: 'blastn', database: 'ecoli_protein', task: 'megablast' }, CATALOGUE);
    expect(r.database).toBe('drosophila');   // first ready nucleotide database
    expect(r.program).toBe('blastn');
  });

  it('heals a nucleotide database saved against blastp', () => {
    const r = reconcile({ program: 'blastp', database: 'drosophila', task: 'megablast' }, CATALOGUE);
    expect(r.database).toBe('ecoli_protein');
    expect(r.task).toBe('blastp');           // megablast is not a blastp task
  });

  it('leaves an already-valid pairing untouched', () => {
    const r = reconcile({ program: 'blastp', database: 'yeast_protein', task: 'blastp-fast' }, CATALOGUE);
    expect(r.database).toBe('yeast_protein');
    expect(r.task).toBe('blastp-fast');
  });

  it('never selects a database the catalogue marks unavailable', () => {
    const onlyHuman = [{ value: 'human', type: 'nucl', ready: false }];
    const r = reconcile({ program: 'blastn', database: 'nonexistent', task: 'megablast' }, onlyHuman);
    expect(r.database).not.toBe('human');
  });

  it('clears the task for tblastx, which takes no -task argument', () => {
    const r = reconcile({ program: 'tblastx', database: 'ecoli', task: 'megablast' }, CATALOGUE);
    expect(r.task).toBe('');
    expect(r.database).toBe('ecoli');
  });

  it('falls back to blastn for an unknown program rather than throwing', () => {
    const r = reconcile({ program: 'psiblast', database: 'drosophila', task: 'megablast' }, CATALOGUE);
    expect(r.program).toBe('blastn');
  });
});

/**
 * Regression: the search page validated every upload against a hard-coded
 * nucleotide alphabet, so a protein FASTA was rejected in the browser before
 * the server ever saw it — blastp and tblastn were unreachable through the
 * interface. The same regex also omitted `U`, so RNA was rejected too.
 */
describe('upload validation follows the program, not a fixed alphabet', () => {
  const DNA  = '>dna\nATGGCTAGCTAGCTAGCATCGATCGATCGTAGCTAGCTAGCATCGATCGATCGTAGCTAGC';
  const RNA  = '>rna\nAUGGCUAGCUAGCUAGCAUCGAUCGAUCGUAGCUAGCUAGCAUCGAUCGAUCGUAGCUAGC';
  const PROT = '>prot\nMKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKA';

  it('accepts a protein query for the programs that require one', () => {
    for (const p of ['blastp', 'tblastn']) {
      expect(validateQueryFasta(PROT, requiredQueryType(p)).valid, p).toBe(true);
    }
  });

  it('accepts a nucleotide query for the programs that require one', () => {
    for (const p of ['blastn', 'blastx', 'tblastx']) {
      expect(validateQueryFasta(DNA, requiredQueryType(p)).valid, p).toBe(true);
    }
  });

  it('accepts RNA where nucleotide is required', () => {
    expect(validateQueryFasta(RNA, 'nucl').valid).toBe(true);
  });

  it('rejects a protein file offered to a nucleotide program, naming the line', () => {
    const r = validateQueryFasta(PROT, 'nucl');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/Line 2/);
    expect(r.reason).toMatch(/nucleotide/);
  });

  /** Every nucleotide letter is also a valid amino-acid letter, so the
   *  character check alone cannot catch this — composition has to. */
  it('rejects a nucleotide file offered to a protein program', () => {
    const r = validateQueryFasta(DNA, 'prot');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/looks like a nucleotide sequence/);
    expect(r.reason).toMatch(/blastn, blastx or tblastx/);
  });

  it('names the alternative programs in the other direction too', () => {
    expect(validateQueryFasta(PROT, 'nucl').reason).not.toMatch(/tblastn/);
    const dnaToProt = validateQueryFasta(DNA, 'prot');
    expect(dnaToProt.reason).toMatch(/blastx/);
  });

  it('keeps the structural checks', () => {
    expect(validateQueryFasta('ATGC', 'nucl').reason).toMatch(/> header/);
    expect(validateQueryFasta('>x\n', 'nucl').reason).toMatch(/No sequence data/);
    expect(validateQueryFasta('>x\n\n>y\n', 'prot').reason).toMatch(/No sequence data/);
  });

  it('tolerates gaps, stops, CRLF and lower case', () => {
    expect(validateQueryFasta('>x\r\natggctagctagctagcatcgatcgatcgtagctagc\r\n', 'nucl').valid).toBe(true);
    expect(validateQueryFasta('>x\nMKTAYIAKQRQ-ISFVKSHFSRQLEERLGLIEVQAPILSRVGDG*', 'prot').valid).toBe(true);
  });

  it('does not guess for a sequence too short to classify', () => {
    // Passes the nucleotide alphabet, and detection declines to call it.
    expect(validateQueryFasta('>x\nATGC', 'nucl').valid).toBe(true);
  });

  it('defaults to nucleotide for an unrecognised molecule argument', () => {
    expect(validateQueryFasta(DNA, undefined).valid).toBe(true);
    expect(validateQueryFasta(PROT, 'rubbish').valid).toBe(false);
  });
});
