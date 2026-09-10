import { describe, it, expect } from 'vitest';
import {
  PROGRAMS, PROGRAM_NAMES, MATRICES,
  getProgram, isValidProgram, programAcceptsDb, requiredQueryType,
  tasksFor, wordSizeRange, detectSequenceType,
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
