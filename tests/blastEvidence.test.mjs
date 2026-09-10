import { describe, it, expect } from 'vitest';
import {
  bitsPerBase, subjectCoverage, unionQueryCoverage,
  perQueryEvidence, runEvidence, flags, buildEvidence,
} from '@/lib/blastEvidence';

const hit = (o = {}) => ({
  queryTitle: 'Q1', queryLen: 1000,
  subjectAcc: 'NM_000001.1', subjectTitle: 'test subject', subjectSciName: 'Drosophila melanogaster',
  subjectTaxId: 7227, subjectLen: 2000,
  identity: 99, alignmentLength: 500, mismatches: 5, gapOpens: 0, gapPositions: 0,
  qStart: 1, qEnd: 500, sStart: 1, sEnd: 500,
  evalue: 1e-100, bitScore: 900, score: 500,
  queryCoverage: 50, queryStrand: 'Plus', hitStrand: 'Plus', ...o,
});

describe('derived alignment metrics', () => {
  it('computes bits per aligned base', () => {
    expect(bitsPerBase(hit({ bitScore: 925, alignmentLength: 500 }))).toBe(1.85);
    expect(bitsPerBase(hit({ alignmentLength: 0 }))).toBe(0);
  });

  it('computes subject coverage from the HSP span', () => {
    expect(subjectCoverage(hit({ sStart: 1, sEnd: 500, subjectLen: 2000 }))).toBe(25);
    expect(subjectCoverage(hit({ subjectLen: 0 }))).toBeNull();
  });

  it('handles minus-strand subject spans', () => {
    expect(subjectCoverage(hit({ sStart: 500, sEnd: 1, subjectLen: 1000 }))).toBe(50);
  });
});

describe('union query coverage', () => {
  it('merges overlapping HSPs instead of double counting', () => {
    const hs = [hit({ qStart: 1, qEnd: 500 }), hit({ qStart: 400, qEnd: 800 })];
    expect(unionQueryCoverage(hs, 1000)).toBe(80);   // 1-800, not 900/1000
  });
  it('adds disjoint HSPs', () => {
    const hs = [hit({ qStart: 1, qEnd: 200 }), hit({ qStart: 800, qEnd: 1000 })];
    expect(unionQueryCoverage(hs, 1000)).toBe(40.1);
  });
  it('returns 0 without a query length', () => {
    expect(unionQueryCoverage([hit()], 0)).toBe(0);
  });
});

describe('per-query evidence', () => {
  it('picks the best hit by E-value and counts the spread', () => {
    const hs = [
      hit({ subjectAcc: 'A', evalue: 1e-10, bitScore: 300 }),
      hit({ subjectAcc: 'B', evalue: 0, bitScore: 900 }),
      hit({ subjectAcc: 'C', evalue: 0, bitScore: 895 }),
    ];
    const [q] = perQueryEvidence(hs);
    expect(q.top.accession).toBe('B');
    expect(q.hitCount).toBe(3);
    expect(q.distinctSubjects).toBe(3);
    // B and C are within 2% of each other — the isoform/paralogue signal.
    expect(q.coOptimalHits).toBe(2);
  });

  it('reports a runner-up only when it is clearly weaker', () => {
    const [q] = perQueryEvidence([
      hit({ subjectAcc: 'A', bitScore: 900, evalue: 0 }),
      hit({ subjectAcc: 'B', bitScore: 400, evalue: 1e-20 }),
    ]);
    expect(q.runnerUp.accession).toBe('B');
    expect(q.runnerUp.bitScoreRatio).toBeCloseTo(0.44, 2);
  });

  it('reports no runner-up when everything is co-optimal', () => {
    const [q] = perQueryEvidence([
      hit({ subjectAcc: 'A', bitScore: 900 }),
      hit({ subjectAcc: 'B', bitScore: 899 }),
    ]);
    expect(q.runnerUp).toBeNull();
  });

  it('separates queries', () => {
    const r = perQueryEvidence([hit({ queryTitle: 'Q1' }), hit({ queryTitle: 'Q2' })]);
    expect(r).toHaveLength(2);
  });
});

describe('run-level distributions', () => {
  const hs = [
    hit({ identity: 99, evalue: 0, queryCoverage: 95 }),
    hit({ identity: 93, evalue: 1e-60, queryCoverage: 60 }),
    hit({ identity: 85, evalue: 1e-8, queryCoverage: 30 }),
    hit({ identity: 60, evalue: 0.001, queryCoverage: 5, hitStrand: 'Minus', gapOpens: 2 }),
  ];
  const run = runEvidence(hs, ['Q1', 'Q2']);

  it('bins identity by the app-wide brackets', () => {
    expect(run.identityBrackets).toEqual({
      'species-level (>=97%)': 1, 'genus (90-97%)': 1, 'family (80-90%)': 1, 'distant (<80%)': 1,
    });
  });

  it('separates an exact E=0 hit from merely strong ones', () => {
    expect(run.evalueBands['E = 0 (exact)']).toBe(1);
    expect(run.evalueBands['E < 1e-50']).toBe(1);
    expect(run.evalueBands['E >= 1e-5']).toBe(1);
  });

  it('bands query coverage', () => {
    expect(run.coverageBands['near-full (>=90%)']).toBe(1);
    expect(run.coverageBands['fragmentary (<10%)']).toBe(1);
  });

  it('counts gapped and minus-strand hits', () => {
    expect(run.gappedHits).toBe(1);
    expect(run.antisenseHits).toBe(1);
  });

  it('names queries that returned nothing', () => {
    expect(run.queriesWithoutHits).toEqual(['Q2']);
    expect(run.queriesWithHits).toBe(1);
  });

  it('flags missing taxonomy', () => {
    const r = runEvidence([hit({ subjectSciName: 'Unknown' })], ['Q1']);
    expect(r.taxonomyMissing).toBe(true);
  });
});

describe('automatic observations', () => {
  it('warns when a query has co-optimal hits', () => {
    const hs = [hit({ subjectAcc: 'A', bitScore: 900 }), hit({ subjectAcc: 'B', bitScore: 899 })];
    const e = buildEvidence(hs, ['Q1'], null);
    expect(e.flags.join(' ')).toMatch(/isoforms, paralogues or repeats/);
  });

  it('warns that a transcript database cannot show introns', () => {
    const e = buildEvidence([hit()], ['Q1'], { moleculeType: 'RNA (transcripts)' });
    expect(e.flags.join(' ')).toMatch(/transcripts, not genomic DNA/);
  });

  it('warns that a genomic database may split a cDNA across exons', () => {
    const e = buildEvidence([hit()], ['Q1'], { moleculeType: 'Genomic DNA' });
    expect(e.flags.join(' ')).toMatch(/align in pieces across exons/);
  });

  it('says nothing alarming about a clean single-hit result', () => {
    const e = buildEvidence([hit({ evalue: 1e-100 })], ['Q1'], null);
    expect(e.flags.join(' ')).toMatch(/exactly one strong hit/);
    expect(e.flags.join(' ')).not.toMatch(/no organism name/);
  });

  it('reports queries with no hits', () => {
    const e = buildEvidence([hit()], ['Q1', 'Q2', 'Q3'], null);
    expect(e.flags.join(' ')).toMatch(/2 of 3 queries returned no hits/);
  });
});
