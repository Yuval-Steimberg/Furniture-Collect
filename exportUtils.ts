/**
 * Export utilities for CSV, Excel (.xlsx), and PDF generation
 * Used by GlobalStatistics page for data export
 */

// Category translations for exports
const CATEGORY_TRANSLATIONS: Record<string, string> = {
  wood: 'עץ',
  metal: 'מתכת',
  plastic: 'פלסטיק',
  glass: 'זכוכית',
  aluminum: 'אלומיניום',
  textile: 'טקסטיל',
  electrical: 'חשמל',
  other: 'אחר',
};

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

  // RTL support - we'll use LTR layout but with Hebrew text
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // Colors (JAS brand)
  const forestColor = [51, 61, 54] as [number, number, number];
  const sageColor = [181, 201, 173] as [number, number, number];
  const creamColor = [255, 252, 245] as [number, number, number];
  const orangeColor = [232, 130, 37] as [number, number, number];

  // Background
  doc.setFillColor(...creamColor);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Header bar
  doc.setFillColor(...forestColor);
  doc.rect(0, 0, pageWidth, 35, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('Just A Second', pageWidth / 2, 15, { align: 'center' });
  doc.setFontSize(12);
  doc.text('דוח סטטיסטיקות', pageWidth / 2, 25, { align: 'center' });

  // Date
  doc.setFontSize(9);
  const dateStr = new Date().toLocaleDateString('he-IL');
  doc.text(dateStr, pageWidth - margin, 30, { align: 'right' });

  let yPos = 45;

  // Project info
  doc.setTextColor(...forestColor);
  doc.setFontSize(14);
  const projectName =
    selectedProject === 'all'
      ? 'כל הפרויקטים'
      : projects.find((p) => p.id === selectedProject)?.name || 'פרויקט';
  doc.text(projectName, pageWidth - margin, yPos, { align: 'right' });
  yPos += 12;

  // KPI Cards
  const kpiWidth = (pageWidth - margin * 2 - 15) / 4;
  const kpiHeight = 25;
  const kpis = [
    { label: 'סה"כ פריטים', value: stats.totalItems.toString(), color: forestColor },
    { label: 'נאספו', value: stats.collected.toString(), color: sageColor },
    { label: 'ממתינים', value: stats.pending.toString(), color: orangeColor },
    { label: 'CO₂ נחסך', value: `${Math.round(stats.totalCO2)} ק"ג`, color: forestColor },
  ];

  kpis.forEach((kpi, i) => {
    const x = margin + i * (kpiWidth + 5);
    doc.setFillColor(...(kpi.color as [number, number, number]));
    doc.roundedRect(x, yPos, kpiWidth, kpiHeight, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text(kpi.label, x + kpiWidth / 2, yPos + 8, { align: 'center' });
    doc.setFontSize(14);
    doc.text(kpi.value, x + kpiWidth / 2, yPos + 18, { align: 'center' });
  });

  yPos += kpiHeight + 15;

  // Category breakdown table
  doc.setTextColor(...forestColor);
  doc.setFontSize(12);
  doc.text('פירוט לפי קטגוריה', pageWidth - margin, yPos, { align: 'right' });
  yPos += 8;

  const tableData = stats.materialChartData.map((cat) => [
    cat.name,
    cat.count.toString(),
    `${cat.percentage}%`,
    `${cat.weight} ק"ג`,
    `${cat.co2} ק"ג`,
  ]);

  (doc as any).autoTable({
    startY: yPos,
    head: [['קטגוריה', 'פריטים', 'אחוז', 'משקל', 'CO₂ נחסך']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: forestColor,
      textColor: [255, 255, 255],
      halign: 'center',
      fontSize: 9,
    },
    bodyStyles: {
      halign: 'center',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 240],
    },
    margin: { left: margin, right: margin },
    tableWidth: 'auto',
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Items summary (top 20)
  if (yPos < pageHeight - 80) {
    doc.setTextColor(...forestColor);
    doc.setFontSize(12);
    doc.text('פריטים אחרונים (עד 20)', pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;

    const itemsTableData = stats.items.slice(0, 20).map((item) => [
      item.description.substring(0, 30) + (item.description.length > 30 ? '...' : ''),
      item.quantity.toString(),
      CATEGORY_TRANSLATIONS[item.material_category] || item.material_category,
      item.collected ? 'כן' : 'לא',
    ]);

    (doc as any).autoTable({
      startY: yPos,
      head: [['תיאור', 'כמות', 'קטגוריה', 'נאסף']],
      body: itemsTableData,
      theme: 'striped',
      headStyles: {
        fillColor: sageColor,
        textColor: forestColor,
        halign: 'center',
        fontSize: 8,
      },
      bodyStyles: {
        halign: 'center',
        fontSize: 7,
      },
      margin: { left: margin, right: margin },
    });
  }

  // Footer
  doc.setFillColor(...forestColor);
  doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('Just A Second - Furniture Collect', pageWidth / 2, pageHeight - 6, {
    align: 'center',
  });

  // Save
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
