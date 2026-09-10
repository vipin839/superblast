import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * Multi-sheet Excel export.
 *
 * Migrated from `xlsx` (SheetJS) to `exceljs`. The npm distribution of xlsx is
 * pinned at 0.18.5 and carries an unfixable prototype-pollution advisory plus
 * a ReDoS; the maintained releases are published outside npm. exceljs is
 * actively maintained and produces the same workbook shape.
 */

const HIT_COLUMNS = [
  { header: 'Query', key: 'query', width: 22 },
  { header: 'Query length (bp)', key: 'queryLen', width: 16 },
  { header: 'Subject accession', key: 'acc', width: 18 },
  { header: 'Subject title', key: 'title', width: 46 },
  { header: 'Organism', key: 'species', width: 30 },
  { header: 'Taxonomy ID', key: 'taxid', width: 12 },
  { header: 'Subject length (bp)', key: 'subjectLen', width: 16 },
  { header: 'Identity (%)', key: 'identity', width: 12 },
  { header: 'Identical bases', key: 'identityCount', width: 14 },
  { header: 'Query coverage (%)', key: 'coverage', width: 16 },
  { header: 'Alignment length', key: 'alignLen', width: 15 },
  { header: 'Mismatches', key: 'mismatches', width: 11 },
  // Two distinct measures — see countGapOpens() in nativeBlast.js.
  { header: 'Gap openings', key: 'gapOpens', width: 12 },
  { header: 'Gap positions', key: 'gapPositions', width: 13 },
  { header: 'E-value', key: 'evalue', width: 13 },
  { header: 'Bit score', key: 'bitScore', width: 11 },
  { header: 'Raw score', key: 'score', width: 10 },
  { header: 'Query start', key: 'qStart', width: 11 },
  { header: 'Query end', key: 'qEnd', width: 11 },
  { header: 'Subject start', key: 'sStart', width: 13 },
  { header: 'Subject end', key: 'sEnd', width: 13 },
  { header: 'Query strand', key: 'queryStrand', width: 12 },
  { header: 'Hit strand', key: 'hitStrand', width: 11 },
];

const num = (v, dp) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(dp)) : null);

function hitRow(h) {
  return {
    query: h.queryTitle || '',
    queryLen: h.queryLen ?? null,
    acc: h.subjectAcc || '',
    title: h.subjectTitle || '',
    species: h.subjectSciName || '',
    taxid: h.subjectTaxId || null,
    subjectLen: h.subjectLen ?? null,
    identity: num(h.identity, 2),
    identityCount: h.identityCount ?? null,
    coverage: num(h.queryCoverage, 2),
    alignLen: h.alignmentLength ?? null,
    mismatches: h.mismatches ?? null,
    gapOpens: h.gapOpens ?? null,
    gapPositions: h.gapPositions ?? null,
    evalue: typeof h.evalue === 'number' ? h.evalue : null,
    bitScore: num(h.bitScore, 1),
    score: h.score ?? null,
    qStart: h.qStart ?? null,
    qEnd: h.qEnd ?? null,
    sStart: h.sStart ?? null,
    sEnd: h.sEnd ?? null,
    queryStrand: h.queryStrand || '',
    hitStrand: h.hitStrand || '',
  };
}

function styleHeader(row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3E8F1' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB6C0D0' } } };
  });
}

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 characters. */
function safeSheetName(name, fallback) {
  const cleaned = String(name || '').replace(/[:\\/?*[\]]/g, ' ').trim();
  return (cleaned || fallback).slice(0, 31);
}

/**
 * @param {object} jobData Job metadata
 * @param {Array}  hits    Flat list of BLAST hits
 * @returns {Promise<string>} the filename that was saved
 */
export async function exportExcel(jobData, hits /*, searches */) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BLASTHub';
  wb.created = new Date();

  const queries = [...new Set(hits.map((h) => h.queryTitle))];
  const speciesCounts = {};
  for (const h of hits) {
    const sp = h.subjectSciName || 'Unknown';
    speciesCounts[sp] = (speciesCounts[sp] || 0) + 1;
  }
  const avgIdentity = hits.length
    ? Number((hits.reduce((s, h) => s + (h.identity || 0), 0) / hits.length).toFixed(2))
    : 0;

  // ── Summary ────────────────────────────────────────────────────────
  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 32 }, { width: 44 }];
  summary.addRow(['BLASTHub search report']).font = { bold: true, size: 14 };
  summary.addRow([]);
  styleHeader(summary.addRow(['Parameter', 'Value']));
  const rows = [
    ['Program', jobData?.config?.program || jobData?.program || 'blastn'],
    ['Task', jobData?.config?.task || 'megablast'],
    ['Database', jobData?.config?.database || jobData?.database || 'unknown'],
    ['Exported', new Date().toISOString()],
    ['Total hits', hits.length],
    ['Query sequences', queries.length],
    ['Distinct organisms', Object.keys(speciesCounts).length],
    ['Mean identity (%)', avgIdentity],
    ['Best E-value', hits.length ? Math.min(...hits.map((h) => h.evalue)) : 'N/A'],
  ];
  rows.forEach((r) => summary.addRow(r));
  summary.addRow([]);
  summary.addRow(['Organism distribution']).font = { bold: true };
  styleHeader(summary.addRow(['Organism', 'Hits']));
  Object.entries(speciesCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([sp, ct]) => summary.addRow([sp, ct]));

  // ── All hits ───────────────────────────────────────────────────────
  const all = wb.addWorksheet('All hits');
  all.columns = HIT_COLUMNS;
  styleHeader(all.getRow(1));
  all.views = [{ state: 'frozen', ySplit: 1 }];
  hits.forEach((h) => all.addRow(hitRow(h)));
  if (hits.length) {
    all.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HIT_COLUMNS.length } };
  }

  // ── One sheet per query ────────────────────────────────────────────
  const groups = {};
  for (const h of hits) (groups[h.queryTitle || 'Unknown'] ||= []).push(h);

  let idx = 1;
  for (const [queryTitle, queryHits] of Object.entries(groups)) {
    // Sheet names must be unique, so index them rather than using the title.
    const ws = wb.addWorksheet(safeSheetName(`Q${idx} ${queryTitle}`, `Query ${idx}`));
    idx++;
    ws.addRow([`Query: ${queryTitle}`]).font = { bold: true };
    ws.addRow([`${queryHits.length} hit${queryHits.length === 1 ? '' : 's'} · query length ${queryHits[0]?.queryLen ?? 'unknown'} bp`]);
    ws.addRow([]);

    ws.columns = HIT_COLUMNS;
    const header = ws.getRow(4);
    HIT_COLUMNS.forEach((c, i) => { header.getCell(i + 1).value = c.header; });
    styleHeader(header);
    queryHits.forEach((h) => {
      const r = ws.addRow([]);
      const data = hitRow(h);
      HIT_COLUMNS.forEach((c, i) => { r.getCell(i + 1).value = data[c.key]; });
    });
  }

  const filename = `BLASTHub_Results_${new Date().toISOString().split('T')[0]}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename);
  return filename;
}
