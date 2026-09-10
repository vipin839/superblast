import { describe, it, expect } from 'vitest';
import { parseBlastJSON, countGapOpens } from '@/lib/nativeBlast';

/**
 * Finding 16: `hsp.gaps` from BLAST JSON-15 is the number of gap POSITIONS.
 * It was being reported as `gapOpens`, which means something different.
 */
describe('gap openings vs gap positions (finding 16)', () => {
  it('counts one opening for a contiguous run', () => {
    expect(countGapOpens('AC---GT', 'ACGGGGT')).toBe(1);
  });
  it('counts each separate run', () => {
    expect(countGapOpens('A-C-G-T', 'ATCTGTT')).toBe(3);
  });
  it('counts gaps on both strands', () => {
    expect(countGapOpens('A--CGT', 'ATTC--T')).toBe(2);
  });
  it('is zero for an ungapped alignment', () => {
    expect(countGapOpens('ACGT', 'ACGT')).toBe(0);
  });
  it('handles gaps at either end', () => {
    expect(countGapOpens('---ACGT---', 'TTTACGTTTT')).toBe(2);
  });
});

/** A minimal but structurally real BLAST JSON-15 document. */
const JSON15 = {
  BlastOutput2: [{
    report: {
      program: 'blastn',
      search_target: { db: '/app/blastdb/drosophila' },
      results: {
        search: {
          query_id: 'Query_1',
          query_title: 'NM_078696.3 Drosophila melanogaster syntaxin 16',
          query_len: 100,
          hits: [{
            num: 1,
            description: [{
              id: 'ref|NM_078696.3|', accession: 'NM_078696.3',
              title: 'Drosophila melanogaster syntaxin 16 (Syx16), mRNA',
              sciname: 'Drosophila melanogaster', taxid: 7227,
            }],
            len: 2500,
            hsps: [{
              num: 1, bit_score: 176.0, score: 95, evalue: 2.5e-45,
              identity: 88, query_from: 1, query_to: 100,
              hit_from: 201, hit_to: 300,
              query_strand: 'Plus', hit_strand: 'Plus',
              align_len: 100, gaps: 4,
              qseq: 'A'.repeat(48) + '----' + 'A'.repeat(48),
              hseq: 'A'.repeat(100),
              midline: '|'.repeat(48) + '    ' + '|'.repeat(48),
            }],
          }],
        },
      },
    },
  }],
};

describe('BLAST JSON-15 parsing (phase 4)', () => {
  const parsed = parseBlastJSON(JSON15);
  const hit = parsed.hits[0];

  it('reads the report envelope', () => {
    expect(parsed.program).toBe('blastn');
    expect(parsed.database).toBe('/app/blastdb/drosophila');
    expect(parsed.queryCount).toBe(1);
    expect(parsed.hits).toHaveLength(1);
  });

  it('carries subject identity through without loss', () => {
    expect(hit.subjectAcc).toBe('NM_078696.3');
    expect(hit.subjectSciName).toBe('Drosophila melanogaster');
    expect(hit.subjectTaxId).toBe(7227);
    expect(hit.subjectLen).toBe(2500);
  });

  it('computes percent identity from identity/align_len', () => {
    expect(hit.identity).toBe(88);          // 88 / 100
    expect(hit.identityCount).toBe(88);
    expect(hit.alignmentLength).toBe(100);
  });

  it('reports both gap measures under honest names', () => {
    expect(hit.gapPositions).toBe(4);       // hsp.gaps, verbatim
    expect(hit.gapOpens).toBe(1);           // one contiguous run
  });

  it('computes mismatches without double-counting gaps', () => {
    expect(hit.mismatches).toBe(100 - 88 - 4);
  });

  it('computes query coverage from the HSP span', () => {
    expect(hit.queryCoverage).toBe(100);
  });

  it('preserves E-value, bit score and alignment strings', () => {
    expect(hit.evalue).toBe(2.5e-45);
    expect(hit.bitScore).toBe(176.0);
    expect(hit.qseq).toHaveLength(100);
    expect(hit.midline).toHaveLength(100);
  });

  it('survives a report with no hits', () => {
    const empty = parseBlastJSON({
      BlastOutput2: [{ report: { program: 'blastn', results: { search: { query_title: 'q', query_len: 10, hits: [] } } } }],
    });
    expect(empty.hits).toHaveLength(0);
    expect(empty.searches[0].hits).toHaveLength(0);
  });
});
