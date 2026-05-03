/**
 * Executive PDF Report Generator
 * McKinsey-style professional report for clients, municipalities, and investors
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Color palette - professional and minimal
const COLORS = {
  primary: '#1E3A5F',      // Dark blue
  secondary: '#3B82F6',    // Blue
  accent: '#10B981',       // Green for positive metrics
  warning: '#F59E0B',      // Amber for warnings
  danger: '#EF4444',       // Red for issues
  text: '#1F2937',         // Dark gray
  textLight: '#6B7280',    // Light gray
  background: '#F9FAFB',   // Light background
  white: '#FFFFFF',
};

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

const CO2_FACTORS: Record<string, number> = {
  wood: 0.5,
  metal: 2.5,
  plastic: 3.0,
  glass: 0.8,
  aluminum: 8.0,
  textile: 1.5,
  electrical: 2.0,
  other: 1.0,
};

interface ReportData {
  projectName: string;
  projectAddress: string;
  items: any[];
  apartments?: any[];
  collectors?: { name: string; count: number }[];
}

interface CategoryStats {
  name: string;
  nameHe: string;
  count: number;
  weight: number;
  percentage: number;
}

/**
 * Generate executive PDF report
 */
export async function generateExecutiveReport(data: ReportData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Calculate statistics
  const stats = calculateStats(data.items);
  const categoryStats = calculateCategoryStats(data.items);
  const collectorStats = calculateCollectorStats(data.items);
  const insights = generateInsights(stats, categoryStats, collectorStats);

  // Page 1: Cover Page
  renderCoverPage(doc, data, pageWidth, pageHeight);

  // Page 2: Executive Summary
  doc.addPage();
  renderExecutiveSummary(doc, stats, insights, margin, contentWidth);

  // Page 3: Material Breakdown
  doc.addPage();
  renderMaterialBreakdown(doc, categoryStats, margin, contentWidth);

  // Page 4: Collection Performance
  doc.addPage();
  renderCollectionPerformance(doc, stats, margin, contentWidth);

  // Page 5: Team Performance
  doc.addPage();
  renderTeamPerformance(doc, collectorStats, stats, margin, contentWidth);

  // Page 6: Environmental Impact
  doc.addPage();
  renderEnvironmentalImpact(doc, stats, margin, contentWidth);

  // Page 7: Issues & Opportunities
  doc.addPage();
  renderIssuesAndOpportunities(doc, data.items, margin, contentWidth);

  // Save
  const filename = `דוח_פירוק_סלקטיבי_${data.projectName}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

function calculateStats(items: any[]) {
  const totalItems = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const collectedItems = items.filter(i => i.collected).reduce((sum, i) => sum + (i.quantity || 1), 0);
  const notCollectedItems = items.filter(i => !i.collected && i.intended_for_collection).reduce((sum, i) => sum + (i.quantity || 1), 0);
  const totalWeight = items.reduce((sum, i) => sum + ((i.estimated_weight_kg || 0) * (i.quantity || 1)), 0);
  
  // Environmental calculations
  let co2Saved = 0;
  items.filter(i => i.collected).forEach(item => {
    const factor = CO2_FACTORS[item.material_category] || 1;
    co2Saved += (item.estimated_weight_kg || 0) * factor * (item.quantity || 1);
  });
  
  const waterSaved = totalWeight * 150; // ~150L per kg of recycled material
  const landfillAvoided = totalWeight * 0.85; // 85% diversion rate
  
  return {
    totalItems,
    collectedItems,
    notCollectedItems,
    collectionRate: totalItems > 0 ? (collectedItems / totalItems) * 100 : 0,
    totalWeight,
    co2Saved,
    waterSaved,
    landfillAvoided,
    treesEquivalent: Math.round(co2Saved / 21), // ~21kg CO2 per tree per year
  };
}

function calculateCategoryStats(items: any[]): CategoryStats[] {
  const categories: Record<string, { count: number; weight: number }> = {};
  const total = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

  items.forEach(item => {
    const cat = item.material_category || 'other';
    if (!categories[cat]) {
      categories[cat] = { count: 0, weight: 0 };
    }
    categories[cat].count += item.quantity || 1;
    categories[cat].weight += (item.estimated_weight_kg || 0) * (item.quantity || 1);
  });

  return Object.entries(categories)
    .map(([name, data]) => ({
      name,
      nameHe: CATEGORY_TRANSLATIONS[name] || name,
      count: data.count,
      weight: data.weight,
      percentage: total > 0 ? (data.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function calculateCollectorStats(items: any[]): { name: string; count: number; percentage: number }[] {
  const collectors: Record<string, number> = {};
  const collectedItems = items.filter(i => i.collected);
  const total = collectedItems.reduce((sum, i) => sum + (i.quantity || 1), 0);

  collectedItems.forEach(item => {
    const collector = (item as any).collected_by || 'לא צוין';
    collectors[collector] = (collectors[collector] || 0) + (item.quantity || 1);
  });

  return Object.entries(collectors)
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function generateInsights(stats: any, categories: CategoryStats[], collectors: any[]): string[] {
  const insights: string[] = [];

  // Collection efficiency
  if (stats.collectionRate >= 95) {
    insights.push(`יעילות איסוף מצוינת: ${stats.collectionRate.toFixed(1)}% מהפריטים נאספו בהצלחה`);
  } else if (stats.collectionRate >= 80) {
    insights.push(`יעילות איסוף טובה: ${stats.collectionRate.toFixed(1)}% מהפריטים נאספו`);
  } else {
    insights.push(`יעילות איסוף: ${stats.collectionRate.toFixed(1)}% - יש מקום לשיפור`);
  }

  // Top category
  if (categories.length > 0) {
    const top = categories[0];
    insights.push(`קטגוריה מובילה: ${top.nameHe} מהווה ${top.percentage.toFixed(1)}% מסך החומרים`);
  }

  // Top collector
  if (collectors.length > 0 && collectors[0].name !== 'לא צוין') {
    insights.push(`אוסף מוביל: ${collectors[0].name} (${collectors[0].count} פריטים)`);
  }

  // Environmental impact
  if (stats.treesEquivalent > 0) {
    insights.push(`השפעה סביבתית: שווה ערך לנטיעת ${stats.treesEquivalent} עצים`);
  }

  // Landfill diversion
  if (stats.landfillAvoided > 0) {
    insights.push(`נמנעה הטמנה של ${stats.landfillAvoided.toFixed(1)} ק"ג בהטמנה`);
  }

  return insights;
}

function renderCoverPage(doc: jsPDF, data: ReportData, pageWidth: number, pageHeight: number) {
  // Background gradient effect (solid color for PDF)
  doc.setFillColor(30, 58, 95); // COLORS.primary
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // White content area
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, pageHeight / 2 - 60, pageWidth - 40, 120, 5, 5, 'F');

  // Title
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('דוח פירוק סלקטיבי', pageWidth / 2, pageHeight / 2 - 30, { align: 'center' });

  // Subtitle - Project name
  doc.setFontSize(18);
  doc.setFont('helvetica', 'normal');
  doc.text(data.projectName, pageWidth / 2, pageHeight / 2, { align: 'center' });

  // Address
  doc.setFontSize(14);
  doc.setTextColor(107, 114, 128);
  doc.text(data.projectAddress || '', pageWidth / 2, pageHeight / 2 + 15, { align: 'center' });

  // Date
  doc.setFontSize(12);
  const dateStr = new Date().toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(dateStr, pageWidth / 2, pageHeight / 2 + 35, { align: 'center' });

  // Footer
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text('Selective Deconstruction Report', pageWidth / 2, pageHeight - 20, { align: 'center' });
}

function renderExecutiveSummary(doc: jsPDF, stats: any, insights: string[], margin: number, contentWidth: number) {
  let y = 25;

  // Header
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('תקציר מנהלים', doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });

  y = 30;

  // Section title
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('מדדי ביצוע מרכזיים', margin, y);
  y += 10;

  // KPI Cards - 2 rows of 3
  const kpiWidth = (contentWidth - 10) / 3;
  const kpiHeight = 25;
  const kpis = [
    { label: 'סה"כ פריטים', value: stats.totalItems.toLocaleString(), color: COLORS.primary },
    { label: 'אחוז איסוף', value: `${stats.collectionRate.toFixed(1)}%`, color: COLORS.accent },
    { label: 'משקל כולל', value: `${stats.totalWeight.toFixed(1)} ק"ג`, color: COLORS.secondary },
    { label: 'חיסכון CO₂', value: `${stats.co2Saved.toFixed(1)} ק"ג`, color: COLORS.accent },
    { label: 'חיסכון מים', value: `${(stats.waterSaved / 1000).toFixed(1)} מ"ק`, color: COLORS.secondary },
    { label: 'שווה ערך עצים', value: `${stats.treesEquivalent}`, color: COLORS.accent },
  ];

  kpis.forEach((kpi, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = margin + col * (kpiWidth + 5);
    const cardY = y + row * (kpiHeight + 5);

    // Card background
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, cardY, kpiWidth, kpiHeight, 2, 2, 'F');

    // Border
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(x, cardY, kpiWidth, kpiHeight, 2, 2, 'S');

    // Value
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, x + kpiWidth / 2, cardY + 10, { align: 'center' });

    // Label
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label, x + kpiWidth / 2, cardY + 18, { align: 'center' });
  });

  y += 65;

  // Key Insights section
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('תובנות מרכזיות', margin, y);
  y += 8;

  // Insights list
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  insights.forEach((insight, index) => {
    // Bullet point
    doc.setFillColor(16, 185, 129);
    doc.circle(margin + 3, y + 2, 1.5, 'F');
    
    // Text
    doc.text(insight, margin + 10, y + 4);
    y += 10;
  });

  y += 10;

  // Interpretation box
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, y, contentWidth, 30, 3, 3, 'F');
  
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('סיכום', margin + 5, y + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const summaryText = stats.collectionRate >= 80 
    ? 'הפרויקט מדגים יעילות גבוהה בפירוק סלקטיבי, עם שיעורי השבה חזקים והשפעה סביבתית מדידה.'
    : 'הפרויקט מציג פוטנציאל לשיפור בשיעורי האיסוף. מומלץ לבחון את התהליכים ולזהות חסמים.';
  doc.text(summaryText, margin + 5, y + 18, { maxWidth: contentWidth - 10 });
}

function renderMaterialBreakdown(doc: jsPDF, categories: CategoryStats[], margin: number, contentWidth: number) {
  let y = 25;

  // Header
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('פילוח חומרים', doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });

  y = 30;

  // Section title
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('התפלגות לפי קטגוריה', margin, y);
  y += 15;

  // Draw simple bar chart
  const chartHeight = 80;
  const barWidth = (contentWidth - 20) / Math.min(categories.length, 8);
  const maxCount = Math.max(...categories.map(c => c.count));

  categories.slice(0, 8).forEach((cat, index) => {
    const x = margin + 10 + index * barWidth;
    const barHeight = (cat.count / maxCount) * chartHeight;
    const barY = y + chartHeight - barHeight;

    // Bar
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899'];
    const color = colors[index % colors.length];
    const rgb = hexToRgb(color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.roundedRect(x + 2, barY, barWidth - 4, barHeight, 2, 2, 'F');

    // Label
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.text(cat.nameHe, x + barWidth / 2, y + chartHeight + 8, { align: 'center' });

    // Value on top
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(cat.count.toString(), x + barWidth / 2, barY - 3, { align: 'center' });
  });

  y += chartHeight + 25;

  // Table
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('פירוט מלא', margin, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['קטגוריה', 'כמות', 'אחוז', 'משקל (ק"ג)']],
    body: categories.map(cat => [
      cat.nameHe,
      cat.count.toString(),
      `${cat.percentage.toFixed(1)}%`,
      cat.weight.toFixed(1),
    ]),
    theme: 'striped',
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'right',
    },
    bodyStyles: {
      halign: 'right',
    },
    margin: { left: margin, right: margin },
  });

  // Insight
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, finalY, contentWidth, 20, 3, 3, 'F');
  
  doc.setTextColor(16, 185, 129);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('💡 תובנה:', contentWidth + margin - 5, finalY + 8, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 41, 55);
  const topCat = categories[0];
  doc.text(
    `רוב החומרים הניתנים להשבה מגיעים מקטגוריית ${topCat?.nameHe || 'אחר'} (${topCat?.percentage.toFixed(1) || 0}%)`,
    contentWidth + margin - 5,
    finalY + 15,
    { align: 'right' }
  );
}

function renderCollectionPerformance(doc: jsPDF, stats: any, margin: number, contentWidth: number) {
  let y = 25;

  // Header
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ביצועי איסוף', doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });

  y = 35;

  // Big KPI
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, y, contentWidth, 50, 5, 5, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFontSize(36);
  doc.setFont('helvetica', 'bold');
  doc.text(`${stats.collectionRate.toFixed(1)}%`, doc.internal.pageSize.getWidth() / 2, y + 25, { align: 'center' });

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('שיעור איסוף', doc.internal.pageSize.getWidth() / 2, y + 40, { align: 'center' });

  y += 65;

  // Status breakdown
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('פילוח לפי סטטוס', margin, y);
  y += 15;

  const statuses = [
    { label: 'נאסף', value: stats.collectedItems, color: '#10B981', percentage: (stats.collectedItems / stats.totalItems) * 100 },
    { label: 'ממתין', value: stats.notCollectedItems, color: '#F59E0B', percentage: (stats.notCollectedItems / stats.totalItems) * 100 },
  ];

  statuses.forEach((status, index) => {
    const barY = y + index * 30;
    
    // Label
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(status.label, margin, barY + 5);

    // Progress bar background
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(margin + 40, barY, contentWidth - 80, 10, 2, 2, 'F');

    // Progress bar fill
    const rgb = hexToRgb(status.color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    const fillWidth = ((contentWidth - 80) * status.percentage) / 100;
    doc.roundedRect(margin + 40, barY, fillWidth, 10, 2, 2, 'F');

    // Value
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(11);
    doc.text(`${status.value} (${status.percentage.toFixed(1)}%)`, contentWidth + margin - 5, barY + 7, { align: 'right' });
  });

  y += 80;

  // Insight
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, y, contentWidth, 25, 3, 3, 'F');
  
  doc.setTextColor(59, 130, 246);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('💡 תובנה:', contentWidth + margin - 5, y + 10, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 41, 55);
  const insightText = stats.collectionRate >= 90 
    ? 'יעילות איסוף גבוהה עם הפסדים מינימליים'
    : 'יש מקום לשיפור ביעילות האיסוף';
  doc.text(insightText, contentWidth + margin - 5, y + 18, { align: 'right' });
}

function renderTeamPerformance(doc: jsPDF, collectors: any[], stats: any, margin: number, contentWidth: number) {
  let y = 25;

  // Header
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ביצועי צוות', doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });

  y = 35;

  // Section title
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('לוח מובילים - איסוף לפי עובדים', margin, y);
  y += 15;

  if (collectors.length === 0 || (collectors.length === 1 && collectors[0].name === 'לא צוין')) {
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('אין נתוני אוספים זמינים עדיין', doc.internal.pageSize.getWidth() / 2, y + 20, { align: 'center' });
    return;
  }

  // Leaderboard
  const maxCount = collectors[0]?.count || 1;
  
  collectors.slice(0, 5).forEach((collector, index) => {
    const rowY = y + index * 25;
    
    // Rank badge
    const badgeColors = ['#F59E0B', '#9CA3AF', '#CD7F32', '#6B7280', '#6B7280'];
    const rgb = hexToRgb(badgeColors[index]);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.circle(margin + 8, rowY + 8, 8, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text((index + 1).toString(), margin + 8, rowY + 11, { align: 'center' });

    // Name
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.text(collector.name, margin + 25, rowY + 10);

    // Progress bar
    const barWidth = contentWidth - 100;
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(margin + 70, rowY + 3, barWidth, 10, 2, 2, 'F');

    doc.setFillColor(59, 130, 246);
    const fillWidth = (barWidth * collector.count) / maxCount;
    doc.roundedRect(margin + 70, rowY + 3, fillWidth, 10, 2, 2, 'F');

    // Count
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(11);
    doc.text(`${collector.count} פריטים`, contentWidth + margin - 5, rowY + 10, { align: 'right' });
  });

  y += collectors.slice(0, 5).length * 25 + 20;

  // Insight
  if (collectors.length >= 2) {
    const top2Percentage = ((collectors[0].count + (collectors[1]?.count || 0)) / stats.collectedItems) * 100;
    
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(margin, y, contentWidth, 25, 3, 3, 'F');
    
    doc.setTextColor(217, 119, 6);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('💡 תובנה:', contentWidth + margin - 5, y + 10, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(31, 41, 55);
    doc.text(
      `2 האוספים המובילים אחראים ל-${top2Percentage.toFixed(0)}% מסך האיסוף`,
      contentWidth + margin - 5,
      y + 18,
      { align: 'right' }
    );
  }
}

function renderEnvironmentalImpact(doc: jsPDF, stats: any, margin: number, contentWidth: number) {
  let y = 25;

  // Header
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('השפעה סביבתית', doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });

  y = 35;

  // Big impact cards
  const impacts = [
    { 
      icon: '🌍', 
      value: `${stats.co2Saved.toFixed(1)}`, 
      unit: 'ק"ג CO₂',
      label: 'חיסכון פליטות',
      equivalent: `שווה ערך לנטיעת ${stats.treesEquivalent} עצים`
    },
    { 
      icon: '💧', 
      value: `${(stats.waterSaved / 1000).toFixed(1)}`, 
      unit: 'מ"ק',
      label: 'חיסכון מים',
      equivalent: `שווה ערך ל-${Math.round(stats.waterSaved / 150)} מקלחות`
    },
    { 
      icon: '♻️', 
      value: `${stats.landfillAvoided.toFixed(1)}`, 
      unit: 'ק"ג',
      label: 'נמנעה הטמנה',
      equivalent: `${((stats.landfillAvoided / stats.totalWeight) * 100).toFixed(0)}% שיעור הסטה`
    },
  ];

  const cardWidth = (contentWidth - 10) / 3;
  const cardHeight = 70;

  impacts.forEach((impact, index) => {
    const x = margin + index * (cardWidth + 5);

    // Card
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(x, y, cardWidth, cardHeight, 5, 5, 'F');

    // Icon
    doc.setFontSize(24);
    doc.text(impact.icon, x + cardWidth / 2, y + 18, { align: 'center' });

    // Value
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(impact.value, x + cardWidth / 2, y + 35, { align: 'center' });

    // Unit
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(impact.unit, x + cardWidth / 2, y + 43, { align: 'center' });

    // Label
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(9);
    doc.text(impact.label, x + cardWidth / 2, y + 55, { align: 'center' });

    // Equivalent
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.text(impact.equivalent, x + cardWidth / 2, y + 63, { align: 'center' });
  });

  y += cardHeight + 25;

  // Summary insight
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin, y, contentWidth, 35, 5, 5, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('🌱 סיכום השפעה סביבתית', contentWidth + margin - 10, y + 12, { align: 'right' });

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'הפרויקט הדגים יתרונות סביבתיים משמעותיים באמצעות גישה ממוקדת שימוש חוזר.',
    contentWidth + margin - 10,
    y + 25,
    { align: 'right' }
  );
}

function renderIssuesAndOpportunities(doc: jsPDF, items: any[], margin: number, contentWidth: number) {
  let y = 25;

  // Header
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('בעיות והזדמנויות', doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });

  y = 35;

  // Find issues
  const notCollected = items.filter(i => i.intended_for_collection && !i.collected);
  const missingCollector = items.filter(i => i.collected && !(i as any).collected_by);

  // Issues summary
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('סיכום בעיות', margin, y);
  y += 15;

  const issues = [
    { label: 'פריטים שלא נאספו', count: notCollected.length, color: '#EF4444' },
    { label: 'חסר פרטי אוסף', count: missingCollector.length, color: '#F59E0B' },
  ];

  issues.forEach((issue, index) => {
    const rowY = y + index * 20;
    
    // Status indicator
    const rgb = hexToRgb(issue.color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.circle(margin + 5, rowY + 3, 4, 'F');

    // Label
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(issue.label, margin + 15, rowY + 5);

    // Count
    doc.setFont('helvetica', 'bold');
    doc.text(issue.count.toString(), contentWidth + margin - 10, rowY + 5, { align: 'right' });
  });

  y += 55;

  // Opportunities section
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('הזדמנויות לשיפור', margin, y);
  y += 15;

  const opportunities = [
    'שיפור מעקב אחר פרטי אוסף בזמן אמת',
    'הגדרת יעדי איסוף לכל עובד',
    'הטמעת התראות לפריטים שלא נאספו',
  ];

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  opportunities.forEach((opp, index) => {
    doc.setFillColor(59, 130, 246);
    doc.circle(margin + 3, y + 2, 1.5, 'F');
    doc.text(opp, margin + 10, y + 4);
    y += 12;
  });

  y += 15;

  // Constructive tone box
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, y, contentWidth, 30, 5, 5, 'F');

  doc.setTextColor(59, 130, 246);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('💡 המלצה:', contentWidth + margin - 10, y + 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 41, 55);
  doc.text(
    'הזדמנות לשפר את מעקב האיסוף בדירות נבחרות ולהגביר את שיעור ההשבה הכולל.',
    contentWidth + margin - 10,
    y + 22,
    { align: 'right' }
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}
