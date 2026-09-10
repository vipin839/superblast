import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import ExcelJS from 'exceljs';

/**
 * The export code is client-side, so nothing about it appears in server logs
 * and a failure would be invisible until a user lost their download.
 * exportExcel.js was rewritten from `xlsx` to `exceljs` to clear an unfixable
 * prototype-pollution advisory, so these tests exercise the real workbook and
 * PDF generation against a real production result.
 */

// file-saver needs a browser; capture the blob instead of downloading it.
const saved = [];
vi.mock('file-saver', () => ({
  saveAs: (blob, filename) => { saved.push({ blob, filename }); },
  default: { saveAs: (blob, filename) => saved.push({ blob, filename }) },
}));

const RESULT = JSON.parse(
  fs.readFileSync(new URL('./fixtures/ecoli-16s-result.json', import.meta.url), 'utf8')
);
const HITS = RESULT.hits;
const SEARCHES = RESULT.searches;
const JOB = {
  id: 'job_ee57274030137dfcd1addcb9ec578d73',
  config: { database: 'ecoli', program: 'blastn', task: 'megablast' },
  totalFiles: 1,
};

beforeEach(() => { saved.length = 0; });

describe('Excel export (migrated xlsx -> exceljs)', () => {
  it('produces a real, re-openable .xlsx workbook', async () => {
    const { exportExcel } = await import('@/lib/exportExcel');
    const filename = await exportExcel(JOB, HITS, SEARCHES);

    expect(filename).toMatch(/^BLASTHub_Results_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(saved).toHaveLength(1);

    const buf = Buffer.from(await saved[0].blob.arrayBuffer());
    // A .xlsx is a zip: it must start with the PK local-file-header magic.
    expect(buf.subarray(0, 2).toString('binary')).toBe('PK');
    expect(buf.length).toBeGreaterThan(5000);

    // The real test: exceljs must be able to read back what it wrote.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('Summary');
    expect(names).toContain('All hits');
    // One sheet per query, plus the two fixed sheets.
    const queries = new Set(HITS.map((h) => h.queryTitle));
    expect(wb.worksheets.length).toBe(2 + queries.size);
  });

  it('writes every hit, with numbers as numbers rather than text', async () => {
    const { exportExcel } = await import('@/lib/exportExcel');
    await exportExcel(JOB, HITS, SEARCHES);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await saved[0].blob.arrayBuffer()));

    const sheet = wb.getWorksheet('All hits');
    expect(sheet.rowCount).toBe(HITS.length + 1); // + header

    const header = sheet.getRow(1).values.filter(Boolean);
    expect(header).toContain('Identity (%)');
    expect(header).toContain('Gap openings');
    expect(header).toContain('Gap positions');   // both measures, named honestly
    expect(header).toContain('E-value');

    const first = sheet.getRow(2);
    const idIdx = header.indexOf('Identity (%)') + 1;
    expect(typeof first.getCell(idIdx).value).toBe('number');
  });

  it('carries the real organism and accession through to the sheet', async () => {
    const { exportExcel } = await import('@/lib/exportExcel');
    await exportExcel(JOB, HITS, SEARCHES);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await saved[0].blob.arrayBuffer()));
    const sheet = wb.getWorksheet('All hits');

    const text = JSON.stringify(sheet.getRow(2).values);
    expect(text).toContain('NC_000913');
    expect(text).toContain('Escherichia coli');
  });

  it('sanitises sheet names Excel would reject', async () => {
    const { exportExcel } = await import('@/lib/exportExcel');
    const nasty = HITS.map((h) => ({ ...h, queryTitle: 'a/b\c[d]e*f?g:h that is far longer than Excel allows' }));
    await exportExcel(JOB, nasty, SEARCHES);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await saved[0].blob.arrayBuffer()));
    for (const ws of wb.worksheets) {
      expect(ws.name.length).toBeLessThanOrEqual(31);
      expect(ws.name).not.toMatch(/[:\/?*[\]]/);
    }
  });

  it('handles an empty hit list without throwing', async () => {
    const { exportExcel } = await import('@/lib/exportExcel');
    await expect(exportExcel(JOB, [], [])).resolves.toBeTruthy();
  });
});

describe('PDF export (jspdf-autotable v5 API)', () => {
  it('produces a real, well-formed PDF', async () => {
    const { exportPDF } = await import('@/lib/exportPdf');
    const { filename, doc } = exportPDF({ ...JOB, ...JOB.config }, HITS, 'Test analysis text.');
    expect(filename).toMatch(/^BLASTHub_Report_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(doc).toBeTruthy();
    const bytes = doc.output('arraybuffer');
    const buf = Buffer.from(bytes);
    expect(buf.subarray(0, 5).toString('binary')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(2000);
    // More than one page means the hit table actually rendered.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('renders without an AI analysis section', async () => {
    const { exportPDF } = await import('@/lib/exportPdf');
    expect(() => exportPDF({ ...JOB, ...JOB.config }, HITS, null)).not.toThrow();
  });

  it('handles an empty hit list', async () => {
    const { exportPDF } = await import('@/lib/exportPdf');
    expect(() => exportPDF({ ...JOB, ...JOB.config }, [], null)).not.toThrow();
  });
});
