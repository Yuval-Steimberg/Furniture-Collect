/**
 * Export utilities for CSV, Excel (.xlsx), and PDF generation
 * Used by GlobalStatistics page for data export
 */

// English category names used in PDF (Helvetica has no Hebrew glyphs)
const CATEGORY_EN: Record<string, string> = {
  wood: 'Wood', metal: 'Metal', plastic: 'Plastic', glass: 'Glass',
  aluminum: 'Aluminum', textile: 'Textile', electrical: 'Electrical', other: 'Other',
};

// Hebrew category labels for CSV/Excel exports
const CATEGORY_TRANSLATIONS: Record<string, string> = {
  wood: 'עץ', metal: 'מתכת', plastic: 'פלסטיק', glass: 'זכוכית',
  aluminum: 'אלומיניום', textile: 'טקסטיל', electrical: 'חשמל', other: 'אחר',
};

// Strip non-ASCII so Helvetica never sees a Hebrew glyph
function lat(s: string): string { return s.replace(/[^\x00-\x7F]/g, '').trim(); }

// ASCII-safe project name
function safeProject(name: string): string {
  const a = lat(name);
  return a.length >= 2 ? a : 'All Projects';
}

// ASCII-safe item description — falls back to category + weight
function safeDesc(item: ExportItem): string {
  const d = lat(item.description || '');
  if (d.length >= 3) return d.slice(0, 32);
  const cat = CATEGORY_EN[item.material_category] || item.material_category || 'Item';
  const kg = item.estimated_weight_kg ? ` · ${item.estimated_weight_kg}kg` : '';
  return `${cat}${kg}`;
}

interface ExportItem {
  id: string;
  description: string;
  quantity: number;
  location?: string;
  intended_for_collection: boolean;
  collected: boolean;
  item_type: string;
  material_category: string;
  estimated_weight_kg?: number;
  estimated_resale_ils?: number;
  projects?: { name: string };
  apartments?: { building_number: string; apartment_number: string };
}

interface ExportStats {
  totalItems: number;
  collected: number;
  pending: number;
  totalWeight: number;
  totalCO2: number;
  materialChartData: Array<{
    name: string;
    rawName: string;
    weight: number;
    count: number;
    percentage: number;
    co2: number;
  }>;
  items: ExportItem[];
}

/**
 * Export data to CSV format
 */
export function exportToCSV(stats: ExportStats, filename: string): void {
  if (!stats?.items) return;

  const headers = [
    'פרויקט',
    'בניין',
    'דירה',
    'תיאור',
    'כמות',
    'מיקום',
    'לאיסוף',
    'נאסף',
    'סוג',
    'קטגוריה',
    'משקל (ק"ג)',
    'שווי מוערך (₪)',
  ];

  const rows = stats.items.map((item) => [
    item.projects?.name || '',
    item.apartments?.building_number || '',
    item.apartments?.apartment_number || '',
    `"${item.description.replace(/"/g, '""')}"`,
    item.quantity,
    item.location || '',
    item.intended_for_collection ? 'כן' : 'לא',
    item.collected ? 'כן' : 'לא',
    item.item_type,
    CATEGORY_TRANSLATIONS[item.material_category] || item.material_category,
    item.estimated_weight_kg || '',
    item.estimated_resale_ils || '',
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Export data to Excel format with multiple sheets
 * Uses SheetJS (xlsx) library
 */
export async function exportToExcel(
  stats: ExportStats,
  projects: Array<{ id: string; name: string }>,
  filename: string
): Promise<void> {
  // Dynamically import xlsx to avoid bundling if not used
  const XLSX = await import('xlsx');

  // Sheet 1: Items
  const itemsData = stats.items.map((item) => ({
    פרויקט: item.projects?.name || '',
    בניין: item.apartments?.building_number || '',
    דירה: item.apartments?.apartment_number || '',
    תיאור: item.description,
    כמות: item.quantity,
    מיקום: item.location || '',
    'לאיסוף?': item.intended_for_collection ? 'כן' : 'לא',
    'נאסף?': item.collected ? 'כן' : 'לא',
    סוג: item.item_type,
    קטגוריה: CATEGORY_TRANSLATIONS[item.material_category] || item.material_category,
    'משקל (ק"ג)': item.estimated_weight_kg || '',
    'שווי מוערך (₪)': item.estimated_resale_ils || '',
  }));

  // Sheet 2: Projects Summary
  const projectsData = projects.map((project) => {
    const projectItems = stats.items.filter((i) => i.projects?.name === project.name);
    const collected = projectItems.filter((i) => i.collected);
    const totalWeight = projectItems.reduce(
      (sum, i) => sum + (i.estimated_weight_kg || 0) * i.quantity,
      0
    );
    return {
      'שם פרויקט': project.name,
      'סה"כ פריטים': projectItems.reduce((sum, i) => sum + i.quantity, 0),
      'פריטים שנאספו': collected.reduce((sum, i) => sum + i.quantity, 0),
      'משקל כולל (ק"ג)': Math.round(totalWeight * 10) / 10,
    };
  });

  // Sheet 3: Summary by Category
  const categoryData = stats.materialChartData.map((cat) => ({
    קטגוריה: cat.name,
    'מספר פריטים': cat.count,
    אחוז: `${cat.percentage}%`,
    'משקל (ק"ג)': cat.weight,
    'CO₂ נחסך (ק"ג)': cat.co2,
  }));

  // Sheet 4: Overall Summary
  const summaryData = [
    { מדד: 'סה"כ פריטים', ערך: stats.totalItems },
    { מדד: 'פריטים שנאספו', ערך: stats.collected },
    { מדד: 'פריטים ממתינים', ערך: stats.pending },
    { מדד: 'משקל כולל (ק"ג)', ערך: Math.round(stats.totalWeight * 10) / 10 },
    { מדד: 'CO₂ נחסך (ק"ג)', ערך: Math.round(stats.totalCO2 * 10) / 10 },
  ];

  // Create workbook with multiple sheets
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, ws1, 'פריטים');

  const ws2 = XLSX.utils.json_to_sheet(projectsData);
  XLSX.utils.book_append_sheet(wb, ws2, 'פרויקטים');

  const ws3 = XLSX.utils.json_to_sheet(categoryData);
  XLSX.utils.book_append_sheet(wb, ws3, 'קטגוריות');

  const ws4 = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, ws4, 'סיכום');

  // Generate and download
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `${filename}.xlsx`);
}

/**
 * Export data to PDF format with designed dashboard layout
 * Uses jsPDF library
 */
export async function exportToPDF(
  stats: ExportStats,
  projects: Array<{ id: string; name: string }>,
  selectedProject: string,
  filename: string
): Promise<void> {
  // Dynamically import jsPDF
  const { default: jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  const forestColor  = [51, 61, 54]   as [number, number, number];
  const sageColor    = [181, 201, 173] as [number, number, number];
  const creamColor   = [255, 252, 245] as [number, number, number];
  const orangeColor  = [232, 130, 37]  as [number, number, number];

  const projectName = selectedProject === 'all'
    ? 'All Projects'
    : safeProject(projects.find((p) => p.id === selectedProject)?.name || '');

  const dateStr = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY

  // ── Background ────────────────────────────────────────────────────────────
  doc.setFillColor(...creamColor);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(...forestColor);
  doc.rect(0, 0, pageWidth, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Just A Second', pageWidth / 2, 13, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Statistics Report  ·  ' + projectName, pageWidth / 2, 23, { align: 'center' });
  doc.setFontSize(8);
  doc.text(dateStr, pageWidth - margin, 31, { align: 'right' });

  let yPos = 46;

  // ── KPI Cards ─────────────────────────────────────────────────────────────
  const kpiWidth = (pageWidth - margin * 2 - 15) / 4;
  const kpiHeight = 26;
  const kpis = [
    { label: 'Total Items',      value: stats.totalItems.toString(),             color: forestColor },
    { label: 'Collected',        value: stats.collected.toString(),               color: sageColor   },
    { label: 'Pending',          value: stats.pending.toString(),                 color: orangeColor },
    { label: 'CO2 Saved',        value: `${Math.round(stats.totalCO2)} kg`,      color: forestColor },
  ];

  kpis.forEach((kpi, i) => {
    const x = margin + i * (kpiWidth + 5);
    doc.setFillColor(...(kpi.color as [number, number, number]));
    doc.roundedRect(x, yPos, kpiWidth, kpiHeight, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(kpi.label, x + kpiWidth / 2, yPos + 8, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(kpi.value, x + kpiWidth / 2, yPos + 19, { align: 'center' });
  });

  yPos += kpiHeight + 12;

  // ── Category breakdown table ───────────────────────────────────────────────
  doc.setTextColor(...forestColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Material Breakdown', margin, yPos);
  yPos += 6;

  const tableData = stats.materialChartData.map((cat) => [
    CATEGORY_EN[cat.name] || cat.name,
    cat.count.toString(),
    `${cat.percentage}%`,
    `${cat.weight} kg`,
    `${cat.co2} kg`,
  ]);

  (doc as any).autoTable({
    startY: yPos,
    head: [['Category', 'Items', 'Share', 'Weight', 'CO2 Saved']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: forestColor, textColor: [255,255,255], halign: 'center', fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { halign: 'center', fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 240] },
    margin: { left: margin, right: margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // ── Recent items table ─────────────────────────────────────────────────────
  if (yPos < pageHeight - 60) {
    doc.setTextColor(...forestColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Item List (up to 20)', margin, yPos);
    yPos += 6;

    const itemsTableData = stats.items.slice(0, 20).map((item) => [
      safeDesc(item),
      item.quantity.toString(),
      CATEGORY_EN[item.material_category] || item.material_category,
      item.collected ? 'Yes' : 'No',
    ]);

    (doc as any).autoTable({
      startY: yPos,
      head: [['Description', 'Qty', 'Category', 'Collected']],
      body: itemsTableData,
      theme: 'striped',
      headStyles: { fillColor: sageColor, textColor: forestColor, halign: 'center', fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { halign: 'center', fontSize: 7.5 },
      margin: { left: margin, right: margin },
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFillColor(...forestColor);
  doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Just A Second · Furniture Collect · CONFIDENTIAL', pageWidth / 2, pageHeight - 4, { align: 'center' });

  doc.save(`${filename}.pdf`);
}

/**
 * Helper to download a blob as a file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
