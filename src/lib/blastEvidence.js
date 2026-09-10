/**
 * Turns a flat list of BLAST hits into the quantitative evidence an
 * interpretation should actually rest on.
 *
 * The point of this module is that a language model can only be as good as the
 * evidence it is handed. Previously the prompt received a hit table and little
 * else, so the interpretation could do no better than restate it. Everything
 * here is *computed from the alignment data*, never inferred — the model's job
 * is to explain these numbers, not to invent them.
 */

const bin = (v, edges) => edges.findIndex((e) => v >= e);

/** Bits per aligned base. A perfect ungapped nucleotide match sits near 1.85. */
export function bitsPerBase(hit) {
  if (!hit.alignmentLength) return 0;
  return Math.round((hit.bitScore / hit.alignmentLength) * 1000) / 1000;
}

/** How much of the SUBJECT the alignment spans — distinguishes a full-length
 *  match from a short domain-level or repeat-driven hit. */
export function subjectCoverage(hit) {
  if (!hit.subjectLen) return null;
  const span = Math.abs((hit.sEnd || 0) - (hit.sStart || 0)) + 1;
  return Math.round((span / hit.subjectLen) * 10000) / 100;
}

/** Union of query positions covered by a set of HSPs, as a percentage. */
export function unionQueryCoverage(hits, queryLen) {
  if (!queryLen) return 0;
  const iv = hits
    .map((h) => [Math.min(h.qStart, h.qEnd), Math.max(h.qStart, h.qEnd)])
    .sort((a, b) => a[0] - b[0]);
  let covered = 0, curStart = null, curEnd = null;
  for (const [s, e] of iv) {
    if (curStart === null) { curStart = s; curEnd = e; continue; }
    if (s <= curEnd + 1) curEnd = Math.max(curEnd, e);
    else { covered += curEnd - curStart + 1; curStart = s; curEnd = e; }
  }
  if (curStart !== null) covered += curEnd - curStart + 1;
  return Math.round((covered / queryLen) * 10000) / 100;
}

/**
 * Group hits by query and derive a per-query verdict from the numbers alone.
 * The bracket names match the thresholds used everywhere else in the app.
 */
export function perQueryEvidence(hits) {
  const byQuery = new Map();
  for (const h of hits) {
    if (!byQuery.has(h.queryTitle)) byQuery.set(h.queryTitle, []);
    byQuery.get(h.queryTitle).push(h);
  }

  const out = [];
  for (const [queryTitle, qh] of byQuery) {
    qh.sort((a, b) => a.evalue - b.evalue || b.bitScore - a.bitScore);
    const top = qh[0];
    const queryLen = top.queryLen || 0;

    const subjects = new Set(qh.map((h) => h.subjectAcc));
    const organisms = new Set(qh.map((h) => h.subjectSciName).filter((s) => s && s !== 'Unknown'));

    // Hits at or near the top score suggest isoforms, paralogs or a repeat.
    const nearTop = qh.filter((h) => h.bitScore >= top.bitScore * 0.98).length;

    // A second, clearly weaker tier is the useful comparison for specificity.
    const second = qh.find((h) => h.subjectAcc !== top.subjectAcc && h.bitScore < top.bitScore * 0.98);

    out.push({
      queryTitle,
      queryLen,
      hitCount: qh.length,
      distinctSubjects: subjects.size,
      distinctOrganisms: organisms.size,
      organisms: [...organisms].slice(0, 5),
      coOptimalHits: nearTop,
      unionCoverage: unionQueryCoverage(qh, queryLen),
      top: {
        accession: top.subjectAcc,
        title: top.subjectTitle,
        organism: top.subjectSciName,
        taxid: top.subjectTaxId,
        identity: top.identity,
        queryCoverage: top.queryCoverage,
        subjectCoverage: subjectCoverage(top),
        alignmentLength: top.alignmentLength,
        mismatches: top.mismatches,
        gapOpens: top.gapOpens,
        gapPositions: top.gapPositions,
        evalue: top.evalue,
        bitScore: top.bitScore,
        bitsPerBase: bitsPerBase(top),
        strand: `${top.queryStrand}/${top.hitStrand}`,
        antisense: top.hitStrand === 'Minus',
      },
      runnerUp: second ? {
        accession: second.subjectAcc,
        organism: second.subjectSciName,
        identity: second.identity,
        evalue: second.evalue,
        bitScore: second.bitScore,
        bitScoreRatio: Math.round((second.bitScore / top.bitScore) * 100) / 100,
      } : null,
    });
  }

  out.sort((a, b) => a.top.evalue - b.top.evalue);
  return out;
}

/** Whole-run distributions. */
export function runEvidence(hits, queryTitles) {
  const n = hits.length;
  const identities = hits.map((h) => h.identity).filter(Number.isFinite);
  const coverages = hits.map((h) => h.queryCoverage).filter(Number.isFinite);
  const alnLens = hits.map((h) => h.alignmentLength).filter(Number.isFinite);

  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
  };

  const identityBrackets = { 'species-level (>=97%)': 0, 'genus (90-97%)': 0, 'family (80-90%)': 0, 'distant (<80%)': 0 };
  for (const h of hits) {
    if (h.identity >= 97) identityBrackets['species-level (>=97%)']++;
    else if (h.identity >= 90) identityBrackets['genus (90-97%)']++;
    else if (h.identity >= 80) identityBrackets['family (80-90%)']++;
    else identityBrackets['distant (<80%)']++;
  }

  const evalueBands = { 'E = 0 (exact)': 0, 'E < 1e-50': 0, '1e-50 to 1e-10': 0, '1e-10 to 1e-5': 0, 'E >= 1e-5': 0 };
  for (const h of hits) {
    const e = h.evalue;
    if (e === 0) evalueBands['E = 0 (exact)']++;
    else if (e < 1e-50) evalueBands['E < 1e-50']++;
    else if (e < 1e-10) evalueBands['1e-50 to 1e-10']++;
    else if (e < 1e-5) evalueBands['1e-10 to 1e-5']++;
    else evalueBands['E >= 1e-5']++;
  }

  const coverageBands = { 'near-full (>=90%)': 0, 'partial (50-90%)': 0, 'short (10-50%)': 0, 'fragmentary (<10%)': 0 };
  for (const c of coverages) {
    if (c >= 90) coverageBands['near-full (>=90%)']++;
    else if (c >= 50) coverageBands['partial (50-90%)']++;
    else if (c >= 10) coverageBands['short (10-50%)']++;
    else coverageBands['fragmentary (<10%)']++;
  }

  const organisms = {};
  for (const h of hits) {
    const sp = h.subjectSciName || 'Unknown';
    organisms[sp] = (organisms[sp] || 0) + 1;
  }

  const gapped = hits.filter((h) => (h.gapOpens || 0) > 0).length;
  const antisense = hits.filter((h) => h.hitStrand === 'Minus').length;
  const withHits = new Set(hits.map((h) => h.queryTitle));

  return {
    totalHits: n,
    queryCount: queryTitles.length,
    queriesWithHits: withHits.size,
    queriesWithoutHits: queryTitles.filter((q) => !withHits.has(q)),
    medianIdentity: median(identities),
    medianCoverage: median(coverages),
    medianAlignmentLength: median(alnLens),
    identityBrackets,
    evalueBands,
    coverageBands,
    organisms: Object.entries(organisms).sort((a, b) => b[1] - a[1]),
    organismCount: Object.keys(organisms).length,
    taxonomyMissing: !!organisms.Unknown,
    gappedHits: gapped,
    antisenseHits: antisense,
  };
}

/** Observations worth putting in front of the reader regardless of the model. */
export function flags(run, perQuery, dbMeta) {
  const f = [];

  if (run.taxonomyMissing) {
    f.push('Some hits carry no organism name, so taxonomic statements about those hits cannot be supported.');
  }
  if (run.queriesWithoutHits.length) {
    f.push(`${run.queriesWithoutHits.length} of ${run.queryCount} queries returned no hits at the chosen E-value threshold.`);
  }
  if (run.evalueBands['E >= 1e-5'] > 0) {
    f.push(`${run.evalueBands['E >= 1e-5']} hits sit at E >= 1e-5 and are not statistically strong.`);
  }
  if (run.coverageBands['fragmentary (<10%)'] > run.totalHits * 0.25) {
    f.push('More than a quarter of hits cover under 10% of their query — short alignments are easy to over-interpret.');
  }
  if (run.antisenseHits > 0) {
    f.push(`${run.antisenseHits} hits align on the minus strand of the subject.`);
  }

  const coOptimal = perQuery.filter((q) => q.coOptimalHits > 1);
  if (coOptimal.length) {
    f.push(`${coOptimal.length} quer${coOptimal.length === 1 ? 'y has' : 'ies have'} several hits within 2% of the best bit score — consistent with isoforms, paralogues or repeats rather than one unique match.`);
  }

  const single = perQuery.filter((q) => q.hitCount === 1 && q.top.evalue < 1e-20);
  if (single.length) {
    f.push(`${single.length} quer${single.length === 1 ? 'y has' : 'ies have'} exactly one strong hit, which is the cleanest kind of identification in this set.`);
  }

  if (dbMeta?.moleculeType && /RNA|transcript/i.test(dbMeta.moleculeType)) {
    f.push('The database searched contains transcripts, not genomic DNA, so hits describe spliced sequence and intron-containing genomic matches would not appear.');
  }
  if (dbMeta?.moleculeType && /Genomic/i.test(dbMeta.moleculeType)) {
    f.push('The database searched is genomic, so a cDNA query may align in pieces across exons rather than end to end.');
  }

  return f;
}

export function buildEvidence(hits, queryTitles, dbMeta) {
  const run = runEvidence(hits, queryTitles);
  const perQuery = perQueryEvidence(hits);
  return { run, perQuery, flags: flags(run, perQuery, dbMeta) };
}
