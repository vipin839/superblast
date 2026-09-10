/**
 * Structural validation of NCBI BLAST JSON-15 output.
 *
 * Asserts every field the application's parser depends on, and independently
 * recomputes the identity and coverage figures the UI shows. Exits non-zero on
 * any failure. Written for Node because that is what the runtime image has.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

assert.ok(d.BlastOutput2, 'missing BlastOutput2 envelope');
const report = d.BlastOutput2[0].report;
const search = report.results.search;

const show = (k, v) => console.log(k.padEnd(20) + ': ' + v);
show('program', report.program);
show('version', report.version);
show('db', report.search_target.db);
show('query_id', search.query_id);
show('query_len', search.query_len);
show('hit count', (search.hits || []).length);

assert.equal(report.program, 'blastn');
assert.ok(search.hits && search.hits.length > 0, 'positive control returned no hits');

const hit = search.hits[0];
const desc = hit.description[0];
const hsp = hit.hsps[0];

show('top accession', desc.accession);
show('top title', String(desc.title || '').slice(0, 70));
show('top sciname', desc.sciname);
show('top taxid', desc.taxid);
show('subject len', hit.len);

const pct = (100 * hsp.identity) / hsp.align_len;
show('identity/align_len', `${hsp.identity}/${hsp.align_len} = ${pct.toFixed(3)}%`);
show('gaps (positions)', hsp.gaps);
show('evalue', hsp.evalue);
show('bit_score', hsp.bit_score);
show('raw score', hsp.score);
show('query range', `${hsp.query_from}-${hsp.query_to}`);
show('subject range', `${hsp.hit_from}-${hsp.hit_to}`);
show('strands', `${hsp.query_strand}/${hsp.hit_strand}`);
show('qseq/hseq/midline', `${hsp.qseq.length}/${hsp.hseq.length}/${hsp.midline.length}`);

for (const f of ['identity', 'align_len', 'gaps', 'evalue', 'bit_score',
                 'query_from', 'query_to', 'hit_from', 'hit_to', 'qseq', 'hseq', 'midline']) {
  assert.ok(f in hsp, `HSP is missing ${f}`);
}

assert.equal(hsp.qseq.length, hsp.hseq.length, 'qseq and hseq differ in length');
assert.equal(hsp.qseq.length, hsp.midline.length, 'midline length does not match the alignment');
assert.ok(pct >= 99.9, `a query taken from the database must self-hit at ~100% identity, got ${pct.toFixed(3)}%`);
assert.ok(hsp.evalue <= 1e-50, `self-hit must be highly significant, got E=${hsp.evalue}`);

// Taxonomy must survive into the JSON. Without it the results table shows
// "Unknown" for every organism and the AI prompt loses its taxonomic context.
assert.ok(desc.sciname && desc.sciname !== 'N/A',
  'hit has no sciname — the database was built without -taxid, or taxdb.btd/.bti is missing');
assert.ok(Number(desc.taxid) > 0,
  `hit has no usable taxid (got ${desc.taxid})`);

// Recompute exactly what the UI displays.
const coverage = (100 * (Math.abs(hsp.query_to - hsp.query_from) + 1)) / search.query_len;
show('recomputed coverage', `${coverage.toFixed(2)}%`);
assert.ok(coverage >= 99, `self-hit coverage should be ~100%, got ${coverage.toFixed(2)}%`);

// Gap openings counted from the alignment strings, the way nativeBlast.js does.
let opens = 0;
for (const s of [hsp.qseq, hsp.hseq]) {
  let inGap = false;
  for (const ch of s) { if (ch === '-') { if (!inGap) { opens++; inGap = true; } } else inGap = false; }
}
show('gap openings', `${opens}  (vs ${hsp.gaps} gap positions)`);

console.log('JSON-15 STRUCTURE: OK');
