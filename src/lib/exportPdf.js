import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/*
 * jspdf-autotable v5 no longer patches jsPDF.prototype.autoTable. The old
 * prototype-style call threw "doc.autoTable is not a function", so PDF export
 * failed for every user. v5 exposes a function that takes the doc instead.
 */

/**
 * Generate a PDF report from BLAST results
 * @param {object} jobData - Job metadata
 * @param {Array} hits - Array of BLAST hit objects
 * @param {string|null} aiAnalysis - AI analysis text
 */
export function exportPDF(jobData, hits, aiAnalysis) {
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // ── Header ──
  doc.setFillColor(10, 14, 26);
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(241, 245, 249);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('BLASTHub Report', margin, 16);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 24);
  doc.text(`Program: ${jobData.program || 'blastn'} | Database: ${jobData.database || '16S_ribosomal_RNA'}`, margin, 30);

  let y = 44;

  // ── Summary Section ──
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Search Summary', margin, y);
  y += 8;

  const uniqueQueries = [...new Set(hits.map(h => h.queryTitle))];
  const avgIdentity = hits.length > 0
    ? (hits.reduce((s, h) => s + h.identity, 0) / hits.length).toFixed(1)
    : 0;
  const uniqueSpecies = [...new Set(hits.map(h => h.subjectSciName))];

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const summaryLines = [
    `Total Hits: ${hits.length}`,
    `Query Sequences: ${uniqueQueries.length}`,
    `Unique Species: ${uniqueSpecies.length}`,
    `Average Identity: ${avgIdentity}%`,
    `Best E-value: ${hits.length > 0 ? formatEvalueForPDF(Math.min(...hits.map(h => h.evalue))) : 'N/A'}`,
  ];
  summaryLines.forEach(line => {
    doc.text(line, margin, y);
    y += 5;
  });
  y += 6;

  // ── Results Table ──
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Alignment Results', margin, y);
  y += 4;

  const tableData = hits.map(hit => [
    hit.queryTitle?.substring(0, 20) || 'N/A',
    hit.subjectAcc || 'N/A',
    hit.subjectSciName?.substring(0, 25) || 'N/A',
    `${hit.identity.toFixed(1)}%`,
    `${hit.queryCoverage?.toFixed(1) || 0}%`,
    hit.alignmentLength?.toString() || '0',
    hit.mismatches?.toString() || '0',
    hit.gapOpens?.toString() || '0',
    formatEvalueForPDF(hit.evalue),
    hit.bitScore?.toFixed(0) || '0',
  ]);

  autoTable(doc, {
    startY: y,
    head: [[
      'Query', 'Subject Acc', 'Species', 'Identity',
      'Coverage', 'Align Len', 'Mismatches', 'Gaps',
      'E-value', 'Bit Score'
    ]],
    body: tableData,
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [124, 58, 237],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 250],
    },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Footer on each page
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `BLASTHub Report - Page ${doc.internal.getNumberOfPages()}`,
        margin,
        doc.internal.pageSize.getHeight() - 8
      );
    },
  });

  // ── AI Analysis (if available) ──
  if (aiAnalysis) {
    doc.addPage();
    y = 20;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('AI Analysis (Gemini)', margin, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const cleanText = aiAnalysis.replace(/[#*]/g, '').replace(/\n{3,}/g, '\n\n');
    const lines = doc.splitTextToSize(cleanText, pageWidth - margin * 2);
    
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 4.5;
    }
  }

  // ── Per-Query Detail Pages ──
  const queryGroups = {};
  hits.forEach(h => {
    if (!queryGroups[h.queryTitle]) queryGroups[h.queryTitle] = [];
    queryGroups[h.queryTitle].push(h);
  });

  for (const [queryTitle, queryHits] of Object.entries(queryGroups)) {
    doc.addPage();
    y = 20;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(`Query: ${queryTitle}`, margin, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Hits: ${queryHits.length} | Query Length: ${queryHits[0]?.queryLen || 'N/A'} bp`, margin, y);
    y += 8;

    const qTableData = queryHits.map(h => [
      h.subjectAcc,
      h.subjectSciName?.substring(0, 30),
      `${h.identity.toFixed(1)}%`,
      `${h.queryCoverage?.toFixed(1) || 0}%`,
      h.alignmentLength?.toString(),
      formatEvalueForPDF(h.evalue),
      h.bitScore?.toFixed(0),
      `${h.qStart}-${h.qEnd}`,
      `${h.sStart}-${h.sEnd}`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Accession', 'Species', 'Identity', 'Coverage', 'Align Len', 'E-value', 'Bit Score', 'Query Range', 'Subject Range']],
      body: qTableData,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [0, 212, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [240, 248, 255] },
      margin: { left: margin, right: margin },
    });
  }

  // Save
  const filename = `BLASTHub_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
  // The jsPDF document is returned alongside the filename so callers — and
  // the export tests — can inspect what was actually generated.
  return { filename, doc };
}

function formatEvalueForPDF(evalue) {
  if (evalue === 0) return '0.0';
  if (evalue === undefined || evalue === null) return 'N/A';
  if (evalue < 0.0001) return evalue.toExponential(1);
  if (evalue < 1) return evalue.toFixed(4);
  return evalue.toFixed(1);
}
