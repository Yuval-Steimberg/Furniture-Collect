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

function buildReportHTML(stats: ExportStats, projectName: string, dateStr: string): string {
  const forest = '#333D36';
  const sage   = '#B5C9AD';
  const cream  = '#FFFCF5';
  const orange = '#E88225';

  const kpiCards = [
    { label: 'סה"כ פריטים', value: stats.totalItems.toString(),          bg: forest, color: '#fff' },
    { label: 'נאספו',        value: stats.collected.toString(),            bg: sage,   color: forest },
    { label: 'ממתינים',     value: stats.pending.toString(),               bg: orange, color: '#fff' },
    { label: 'CO₂ נחסך',   value: `${Math.round(stats.totalCO2)} ק"ג`,  bg: forest, color: '#fff' },
  ].map(k => `
    <td style="width:25%;padding:0 6px;">
      <div style="background:${k.bg};color:${k.color};border-radius:8px;padding:12px 8px;text-align:center;">
        <div style="font-size:9.5px;font-weight:600;margin-bottom:5px;opacity:0.85;">${k.label}</div>
        <div style="font-size:20px;font-weight:800;line-height:1;">${k.value}</div>
      </div>
    </td>
  `).join('');

  const catRows = stats.materialChartData.map((cat, i) => {
    const bg = i % 2 === 0 ? cream : '#EDE9DF';
    return `<tr style="background:${bg};">
      <td style="padding:6px 10px;text-align:right;">${cat.name}</td>
      <td style="padding:6px 10px;text-align:center;">${cat.count}</td>
      <td style="padding:6px 10px;text-align:center;">${cat.percentage}%</td>
      <td style="padding:6px 10px;text-align:center;">${cat.weight} ק"ג</td>
      <td style="padding:6px 10px;text-align:center;">${cat.co2} ק"ג</td>
    </tr>`;
  }).join('');

  const itemRows = stats.items.slice(0, 20).map((item, i) => {
    const bg  = i % 2 === 0 ? cream : '#EDE9DF';
    const cat = CATEGORY_TRANSLATIONS[item.material_category] || item.material_category;
    return `<tr style="background:${bg};">
      <td style="padding:5px 10px;text-align:right;">${item.description || cat}</td>
      <td style="padding:5px 10px;text-align:center;">${item.quantity}</td>
      <td style="padding:5px 10px;text-align:center;">${cat}</td>
      <td style="padding:5px 10px;text-align:center;">${item.collected ? 'כן' : 'לא'}</td>
    </tr>`;
  }).join('');

  const th = (label: string) =>
    `<th style="padding:7px 10px;font-weight:700;white-space:nowrap;">${label}</th>`;

  return `
    <div style="width:794px;background:${cream};font-family:'Heebo',Arial,sans-serif;direction:rtl;color:${forest};font-size:12px;box-sizing:border-box;">
      <div style="background:${forest};color:#fff;padding:20px 24px;text-align:center;position:relative;">
        <div style="font-size:22px;font-weight:800;margin-bottom:4px;">Just A Second</div>
        <div style="font-size:11px;opacity:0.7;">דוח סטטיסטיקות · ${projectName}</div>
        <div style="position:absolute;bottom:8px;left:16px;font-size:9px;opacity:0.45;">${dateStr}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;padding:16px 14px;" cellspacing="0" cellpadding="0">
        <tr><td style="padding:16px 14px;">
          <table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0">
            <tr>${kpiCards}</tr>
          </table>
        </td></tr>
      </table>

      <div style="padding:0 20px 14px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">פירוט חומרים</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;" cellspacing="0" cellpadding="0">
          <thead><tr style="background:${forest};color:#fff;">
            ${th('קטגוריה')}${th('פריטים')}${th('אחוז')}${th('משקל')}${th('CO₂ נחסך')}
          </tr></thead>
          <tbody>${catRows}</tbody>
        </table>
      </div>

      <div style="padding:0 20px 20px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">רשימת פריטים (עד 20)</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;" cellspacing="0" cellpadding="0">
          <thead><tr style="background:${sage};color:${forest};">
            ${th('תיאור')}${th('כמות')}${th('קטגוריה')}${th('נאסף')}
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      <div style="background:${forest};color:#fff;text-align:center;padding:8px;font-size:9px;">
        Just A Second · Furniture Collect · CONFIDENTIAL
      </div>
    </div>`;
}

/**
 * Export data to PDF format — renders Hebrew HTML via html2canvas then embeds
 * the resulting image in jsPDF (bypasses Helvetica's missing Hebrew glyphs).
 */
export async function exportToPDF(
  stats: ExportStats,
  projects: Array<{ id: string; name: string }>,
  selectedProject: string,
  filename: string
): Promise<void> {
  const { default: jsPDF }      = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');

  const projectName =
    selectedProject === 'all'
      ? 'כל הפרויקטים'
      : projects.find((p) => p.id === selectedProject)?.name || 'כל הפרויקטים';

  const dateStr = new Date().toLocaleDateString('he-IL');

  // Mount off-screen, render, remove
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;top:0;left:-9999px;width:794px;';
  wrapper.innerHTML = buildReportHTML(stats, projectName, dateStr);
  document.body.appendChild(wrapper);

  await document.fonts.ready;

  const canvas = await html2canvas(wrapper, {
    scale: 2,
    useCORS: true,
    logging: false,
    width: 794,
  });

  document.body.removeChild(wrapper);

  // Slice canvas into A4 pages
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const mmPerPx      = pageW / (794 * 2);          // scale:2 → 1588 px = 210 mm
  const pageHeightPx = Math.round(pageH / mmPerPx); // canvas px that fit one page

  let yOffset = 0;
  while (yOffset < canvas.height) {
    const sliceH   = Math.min(pageHeightPx, canvas.height - yOffset);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width  = canvas.width;
    pageCanvas.height = sliceH;
    pageCanvas.getContext('2d')!.drawImage(
      canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH,
    );
    const imgData   = pageCanvas.toDataURL('image/jpeg', 0.95);
    const sliceHmm  = sliceH * mmPerPx;
    if (yOffset > 0) doc.addPage();
    doc.addImage(imgData, 'JPEG', 0, 0, pageW, sliceHmm);
    yOffset += sliceH;
  }

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
