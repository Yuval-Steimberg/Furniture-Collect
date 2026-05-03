/**
 * Executive PDF Report Generator
 * Professional Selective Deconstruction Report — English text throughout
 * (jsPDF's built-in fonts have no Hebrew support; English ensures clean output)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLORS = {
  primary: '#1E3A5F',
  secondary: '#3B82F6',
  accent: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  text: '#1F2937',
  textLight: '#6B7280',
  background: '#F9FAFB',
  white: '#FFFFFF',
};

// English category labels for the PDF
const CATEGORY_LABELS_EN: Record<string, string> = {
  wood: 'Wood',
  metal: 'Metal',
  plastic: 'Plastic',
  glass: 'Glass',
  aluminum: 'Aluminum',
  textile: 'Textile',
  electrical: 'Electrical',
  other: 'Other',
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
  label: string;
  count: number;
  weight: number;
  percentage: number;
}

export async function generateExecutiveReport(data: ReportData): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  const stats = calculateStats(data.items);
  const categoryStats = calculateCategoryStats(data.items);
  const collectorStats = calculateCollectorStats(data.items);
  const insights = generateInsights(stats, categoryStats, collectorStats);

  renderCoverPage(doc, data, pageWidth, pageHeight);

  doc.addPage();
  renderExecutiveSummary(doc, stats, insights, margin, contentWidth);

  doc.addPage();
  renderMaterialBreakdown(doc, categoryStats, margin, contentWidth);

  doc.addPage();
  renderCollectionPerformance(doc, stats, margin, contentWidth);

  doc.addPage();
  renderTeamPerformance(doc, collectorStats, stats, margin, contentWidth);

  doc.addPage();
  renderEnvironmentalImpact(doc, stats, margin, contentWidth);

  doc.addPage();
  renderIssuesAndOpportunities(doc, data.items, margin, contentWidth);

  const safeProjectName = data.projectName.replace(/[^\w\s-]/g, '').trim() || 'Project';
  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`Selective_Deconstruction_Report_${safeProjectName}_${dateStr}.pdf`);
}

function calculateStats(items: any[]) {
  const totalItems = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const collectedItems = items.filter(i => i.collected).reduce((sum, i) => sum + (i.quantity || 1), 0);
  const notCollectedItems = items
    .filter(i => !i.collected && i.intended_for_collection)
    .reduce((sum, i) => sum + (i.quantity || 1), 0);
  const totalWeight = items.reduce(
    (sum, i) => sum + (i.estimated_weight_kg || 0) * (i.quantity || 1),
    0
  );

  let co2Saved = 0;
  items.filter(i => i.collected).forEach(item => {
    const factor = CO2_FACTORS[item.material_category] || 1;
    co2Saved += (item.estimated_weight_kg || 0) * factor * (item.quantity || 1);
  });

  const waterSaved = totalWeight * 150;
  const landfillAvoided = totalWeight * 0.85;

  return {
    totalItems,
    collectedItems,
    notCollectedItems,
    collectionRate: totalItems > 0 ? (collectedItems / totalItems) * 100 : 0,
    totalWeight,
    co2Saved,
    waterSaved,
    landfillAvoided,
    treesEquivalent: Math.round(co2Saved / 21),
  };
}

function calculateCategoryStats(items: any[]): CategoryStats[] {
  const categories: Record<string, { count: number; weight: number }> = {};
  const total = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

  items.forEach(item => {
    const cat = item.material_category || 'other';
    if (!categories[cat]) categories[cat] = { count: 0, weight: 0 };
    categories[cat].count += item.quantity || 1;
    categories[cat].weight += (item.estimated_weight_kg || 0) * (item.quantity || 1);
  });

  return Object.entries(categories)
    .map(([name, data]) => ({
      name,
      label: CATEGORY_LABELS_EN[name] || name,
      count: data.count,
      weight: data.weight,
      percentage: total > 0 ? (data.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function calculateCollectorStats(
  items: any[]
): { name: string; count: number; percentage: number }[] {
  const collectors: Record<string, number> = {};
  const collectedItems = items.filter(i => i.collected);
  const total = collectedItems.reduce((sum, i) => sum + (i.quantity || 1), 0);

  collectedItems.forEach(item => {
    const collector = (item as any).collected_by || 'Unassigned';
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

function generateInsights(
  stats: any,
  categories: CategoryStats[],
  collectors: any[]
): string[] {
  const insights: string[] = [];

  if (stats.collectionRate >= 95) {
    insights.push(
      `Excellent collection efficiency: ${stats.collectionRate.toFixed(1)}% of items successfully recovered`
    );
  } else if (stats.collectionRate >= 80) {
    insights.push(
      `Good collection efficiency: ${stats.collectionRate.toFixed(1)}% of items collected`
    );
  } else {
    insights.push(
      `Collection rate: ${stats.collectionRate.toFixed(1)}% — room for improvement`
    );
  }

  if (categories.length > 0) {
    const top = categories[0];
    insights.push(
      `Leading category: ${top.label} accounts for ${top.percentage.toFixed(1)}% of all materials`
    );
  }

  if (collectors.length > 0 && collectors[0].name !== 'Unassigned') {
    insights.push(`Top collector: ${collectors[0].name} (${collectors[0].count} items)`);
  }

  if (stats.treesEquivalent > 0) {
    insights.push(
      `Environmental impact equivalent to planting ${stats.treesEquivalent} trees`
    );
  }

  if (stats.landfillAvoided > 0) {
    insights.push(
      `Landfill diversion: ${stats.landfillAvoided.toFixed(1)} kg of waste avoided`
    );
  }

  return insights;
}

function pageHeader(
  doc: jsPDF,
  title: string,
  color: [number, number, number] = [30, 58, 95]
) {
  doc.setFillColor(...color);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title, doc.internal.pageSize.getWidth() / 2, 11, { align: 'center' });
}

function renderCoverPage(
  doc: jsPDF,
  data: ReportData,
  pageWidth: number,
  pageHeight: number
) {
  // Full-page dark background
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Accent stripe
  doc.setFillColor(16, 185, 129);
  doc.rect(0, pageHeight / 2 - 70, 6, 140, 'F');

  // White content card
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, pageHeight / 2 - 65, pageWidth - 40, 130, 6, 6, 'F');

  // Title
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text('Selective Deconstruction Report', pageWidth / 2, pageHeight / 2 - 32, {
    align: 'center',
  });

  // Divider
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(1);
  doc.line(pageWidth / 2 - 40, pageHeight / 2 - 20, pageWidth / 2 + 40, pageHeight / 2 - 20);

  // Project name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 41, 55);
  doc.text(data.projectName || 'Project', pageWidth / 2, pageHeight / 2 - 5, {
    align: 'center',
  });

  // Address
  if (data.projectAddress) {
    doc.setFontSize(12);
    doc.setTextColor(107, 114, 128);
    doc.text(data.projectAddress, pageWidth / 2, pageHeight / 2 + 12, { align: 'center' });
  }

  // Date
  doc.setFontSize(11);
  doc.setTextColor(107, 114, 128);
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(dateStr, pageWidth / 2, pageHeight / 2 + 32, { align: 'center' });

  // Footer
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('CONFIDENTIAL — Selective Deconstruction Platform', pageWidth / 2, pageHeight - 18, {
    align: 'center',
  });
}

function renderExecutiveSummary(
  doc: jsPDF,
  stats: any,
  insights: string[],
  margin: number,
  contentWidth: number
) {
  pageHeader(doc, 'Executive Summary');
  let y = 28;

  // Section title
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Key Performance Indicators', margin, y);
  y += 10;

  // 6 KPI cards in 2 rows of 3
  const kpiWidth = (contentWidth - 10) / 3;
  const kpiHeight = 26;
  const kpis = [
    { label: 'Total Items', value: stats.totalItems.toLocaleString() },
    { label: 'Collection Rate', value: `${stats.collectionRate.toFixed(1)}%` },
    { label: 'Total Weight', value: `${stats.totalWeight.toFixed(1)} kg` },
    { label: 'CO2 Saved', value: `${stats.co2Saved.toFixed(1)} kg` },
    { label: 'Water Saved', value: `${(stats.waterSaved / 1000).toFixed(1)} m3` },
    { label: 'Trees Equivalent', value: `${stats.treesEquivalent}` },
  ];

  kpis.forEach((kpi, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = margin + col * (kpiWidth + 5);
    const cardY = y + row * (kpiHeight + 5);

    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, cardY, kpiWidth, kpiHeight, 2, 2, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(x, cardY, kpiWidth, kpiHeight, 2, 2, 'S');

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, x + kpiWidth / 2, cardY + 10, { align: 'center' });

    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label, x + kpiWidth / 2, cardY + 19, { align: 'center' });
  });

  y += 67;

  // Key insights
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Key Insights', margin, y);
  y += 8;

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  insights.forEach(insight => {
    doc.setFillColor(16, 185, 129);
    doc.circle(margin + 3, y + 2, 1.5, 'F');
    const lines = doc.splitTextToSize(insight, contentWidth - 14) as string[];
    doc.text(lines, margin + 10, y + 4);
    y += lines.length * 6 + 4;
  });

  y += 6;

  // Summary box
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, y, contentWidth, 28, 3, 3, 'F');

  doc.setTextColor(30, 58, 95);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', margin + 5, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const summaryText =
    stats.collectionRate >= 80
      ? 'This project demonstrates high selective deconstruction efficiency with strong recovery rates and measurable environmental impact.'
      : 'The project shows potential for improvement in collection rates. A process review is recommended to identify and address bottlenecks.';
  const summaryLines = doc.splitTextToSize(summaryText, contentWidth - 12) as string[];
  doc.text(summaryLines, margin + 5, y + 17);
}

function renderMaterialBreakdown(
  doc: jsPDF,
  categories: CategoryStats[],
  margin: number,
  contentWidth: number
) {
  pageHeader(doc, 'Material Breakdown');
  let y = 28;

  doc.setTextColor(30, 58, 95);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Distribution by Category', margin, y);
  y += 12;

  // Bar chart
  const chartHeight = 80;
  const barWidth = (contentWidth - 20) / Math.min(categories.length, 8);
  const maxCount = Math.max(...categories.map(c => c.count), 1);

  categories.slice(0, 8).forEach((cat, index) => {
    const x = margin + 10 + index * barWidth;
    const barHeight = (cat.count / maxCount) * chartHeight;
    const barY = y + chartHeight - barHeight;

    const palette = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899'];
    const rgb = hexToRgb(palette[index % palette.length]);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.roundedRect(x + 2, barY, barWidth - 4, barHeight, 2, 2, 'F');

    // Count above bar
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(cat.count.toString(), x + barWidth / 2, barY - 3, { align: 'center' });

    // Label below
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const labelLines = doc.splitTextToSize(cat.label, barWidth - 4) as string[];
    doc.text(labelLines[0], x + barWidth / 2, y + chartHeight + 7, { align: 'center' });
  });

  y += chartHeight + 22;

  // Table
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Full Breakdown', margin, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['Category', 'Count', 'Share', 'Weight (kg)']],
    body: categories.map(cat => [
      cat.label,
      cat.count.toString(),
      `${cat.percentage.toFixed(1)}%`,
      cat.weight.toFixed(1),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
  });

  const tableEndY = (doc as any).lastAutoTable.finalY + 10;
  const topCat = categories[0];
  if (topCat) {
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, tableEndY, contentWidth, 18, 3, 3, 'F');
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Insight:', margin + 5, tableEndY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(31, 41, 55);
    doc.text(
      `Most recoverable materials come from ${topCat.label} (${topCat.percentage.toFixed(1)}% of total)`,
      margin + 25,
      tableEndY + 7
    );
  }
}

function renderCollectionPerformance(
  doc: jsPDF,
  stats: any,
  margin: number,
  contentWidth: number
) {
  pageHeader(doc, 'Collection Performance');
  let y = 35;

  // Big rate card
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, y, contentWidth, 48, 5, 5, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFontSize(34);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `${stats.collectionRate.toFixed(1)}%`,
    doc.internal.pageSize.getWidth() / 2,
    y + 24,
    { align: 'center' }
  );

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text('Collection Rate', doc.internal.pageSize.getWidth() / 2, y + 38, { align: 'center' });

  y += 62;

  doc.setTextColor(30, 58, 95);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Status Breakdown', margin, y);
  y += 12;

  const statuses = [
    {
      label: 'Collected',
      value: stats.collectedItems,
      color: '#10B981',
      pct: (stats.collectedItems / Math.max(stats.totalItems, 1)) * 100,
    },
    {
      label: 'Pending',
      value: stats.notCollectedItems,
      color: '#F59E0B',
      pct: (stats.notCollectedItems / Math.max(stats.totalItems, 1)) * 100,
    },
  ];

  statuses.forEach((s, i) => {
    const rowY = y + i * 30;

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(s.label, margin, rowY + 5);

    const barW = contentWidth - 80;
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(margin + 40, rowY, barW, 10, 2, 2, 'F');

    const rgb = hexToRgb(s.color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    const fill = Math.max((barW * s.pct) / 100, s.pct > 0 ? 4 : 0);
    doc.roundedRect(margin + 40, rowY, fill, 10, 2, 2, 'F');

    doc.setTextColor(107, 114, 128);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${s.value} (${s.pct.toFixed(1)}%)`,
      contentWidth + margin - 5,
      rowY + 7,
      { align: 'right' }
    );
  });

  y += 75;

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, y, contentWidth, 22, 3, 3, 'F');
  doc.setTextColor(59, 130, 246);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Insight:', margin + 5, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 41, 55);
  const perf =
    stats.collectionRate >= 90 ? 'High collection efficiency with minimal losses.' : 'Opportunity to improve collection efficiency.';
  doc.text(perf, margin + 30, y + 9);
}

function renderTeamPerformance(
  doc: jsPDF,
  collectors: any[],
  stats: any,
  margin: number,
  contentWidth: number
) {
  pageHeader(doc, 'Team Performance');
  let y = 35;

  doc.setTextColor(30, 58, 95);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Collector Leaderboard', margin, y);
  y += 12;

  if (collectors.length === 0 || (collectors.length === 1 && collectors[0].name === 'Unassigned')) {
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'No collector data available yet.',
      doc.internal.pageSize.getWidth() / 2,
      y + 20,
      { align: 'center' }
    );
    return;
  }

  const maxCount = collectors[0]?.count || 1;
  const badgeColors = ['#F59E0B', '#9CA3AF', '#CD7F32', '#6B7280', '#6B7280'];

  collectors.slice(0, 5).forEach((collector, index) => {
    const rowY = y + index * 26;
    const rgb = hexToRgb(badgeColors[index]);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.circle(margin + 8, rowY + 8, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text((index + 1).toString(), margin + 8, rowY + 11, { align: 'center' });

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(collector.name, margin + 22, rowY + 10);

    const barW = contentWidth - 100;
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(margin + 70, rowY + 3, barW, 10, 2, 2, 'F');

    doc.setFillColor(59, 130, 246);
    const fill = (barW * collector.count) / maxCount;
    doc.roundedRect(margin + 70, rowY + 3, fill, 10, 2, 2, 'F');

    doc.setTextColor(107, 114, 128);
    doc.setFontSize(10);
    doc.text(
      `${collector.count} items`,
      contentWidth + margin - 5,
      rowY + 10,
      { align: 'right' }
    );
  });

  y += collectors.slice(0, 5).length * 26 + 20;

  if (collectors.length >= 2) {
    const top2Pct =
      ((collectors[0].count + (collectors[1]?.count || 0)) /
        Math.max(stats.collectedItems, 1)) *
      100;
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, 'F');
    doc.setTextColor(217, 119, 6);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Insight:', margin + 5, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(31, 41, 55);
    doc.text(
      `Top 2 collectors account for ${top2Pct.toFixed(0)}% of all items collected`,
      margin + 28,
      y + 9
    );
  }
}

function renderEnvironmentalImpact(
  doc: jsPDF,
  stats: any,
  margin: number,
  contentWidth: number
) {
  pageHeader(doc, 'Environmental Impact', [16, 185, 129]);
  let y = 35;

  const impacts = [
    {
      label: 'CO2 Saved',
      value: stats.co2Saved.toFixed(1),
      unit: 'kg CO2',
      note: `Equivalent to planting ${stats.treesEquivalent} trees`,
    },
    {
      label: 'Water Saved',
      value: (stats.waterSaved / 1000).toFixed(1),
      unit: 'm3',
      note: `~${Math.round(stats.waterSaved / 150)} showers avoided`,
    },
    {
      label: 'Landfill Avoided',
      value: stats.landfillAvoided.toFixed(1),
      unit: 'kg',
      note: `${((stats.landfillAvoided / Math.max(stats.totalWeight, 1)) * 100).toFixed(0)}% diversion rate`,
    },
  ];

  const cardW = (contentWidth - 10) / 3;
  const cardH = 68;

  impacts.forEach((impact, index) => {
    const x = margin + index * (cardW + 5);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(x, y, cardW, cardH, 5, 5, 'F');

    doc.setTextColor(16, 185, 129);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(impact.value, x + cardW / 2, y + 24, { align: 'center' });

    doc.setTextColor(107, 114, 128);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(impact.unit, x + cardW / 2, y + 32, { align: 'center' });

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(impact.label, x + cardW / 2, y + 44, { align: 'center' });

    doc.setTextColor(107, 114, 128);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(impact.note, cardW - 6) as string[];
    doc.text(noteLines, x + cardW / 2, y + 54, { align: 'center' });
  });

  y += cardH + 22;

  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin, y, contentWidth, 30, 5, 5, 'F');
  doc.setTextColor(16, 185, 129);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Environmental Summary', margin + 8, y + 11);

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const envText = doc.splitTextToSize(
    'This project has delivered significant environmental benefits through a targeted reuse and recovery approach, diverting materials from landfill and reducing embodied carbon.',
    contentWidth - 16
  ) as string[];
  doc.text(envText, margin + 8, y + 22);
}

function renderIssuesAndOpportunities(
  doc: jsPDF,
  items: any[],
  margin: number,
  contentWidth: number
) {
  pageHeader(doc, 'Issues & Opportunities', [245, 158, 11]);
  let y = 35;

  const notCollected = items.filter(i => i.intended_for_collection && !i.collected);
  const missingCollector = items.filter(i => i.collected && !(i as any).collected_by);

  doc.setTextColor(30, 58, 95);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Issue Summary', margin, y);
  y += 12;

  const issues = [
    { label: 'Items not yet collected', count: notCollected.length, color: '#EF4444' },
    { label: 'Missing collector attribution', count: missingCollector.length, color: '#F59E0B' },
  ];

  issues.forEach((issue, index) => {
    const rowY = y + index * 20;
    const rgb = hexToRgb(issue.color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.circle(margin + 5, rowY + 3, 4, 'F');

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(issue.label, margin + 15, rowY + 5);

    doc.setFont('helvetica', 'bold');
    doc.text(issue.count.toString(), contentWidth + margin - 10, rowY + 5, { align: 'right' });
  });

  y += 52;

  doc.setTextColor(30, 58, 95);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Opportunities', margin, y);
  y += 12;

  const opportunities = [
    'Improve real-time tracking of collector attribution',
    'Set per-worker collection targets and track against them',
    'Implement automated alerts for items not collected within SLA',
    'Review high-pending apartments for access or process blockers',
  ];

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  opportunities.forEach(opp => {
    doc.setFillColor(59, 130, 246);
    doc.circle(margin + 3, y + 2, 1.5, 'F');
    doc.text(opp, margin + 10, y + 4);
    y += 11;
  });

  y += 10;

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, y, contentWidth, 28, 5, 5, 'F');
  doc.setTextColor(59, 130, 246);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Recommendation:', margin + 6, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 41, 55);
  const recText = doc.splitTextToSize(
    'Focus on increasing collection attribution completeness and implementing targeted follow-ups on pending items in select apartments to raise the overall recovery rate.',
    contentWidth - 14
  ) as string[];
  doc.text(recText, margin + 6, y + 20);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}
