/**
 * Executive PDF Report — McKinsey-style Selective Deconstruction Report
 * Uses Heebo font (fetched at runtime) for full Hebrew + Latin support.
 *
 * Pages:
 *  1. Cover — project identity + live KPI preview
 *  2. Executive Summary — KPIs + key insights
 *  3. Material Breakdown — donut chart + full table
 *  4. Collection Performance — rate gauge + status bars
 *  5. Team Performance — collector leaderboard
 *  6. Environmental Impact — CO2 / water / landfill cards
 *  7. Issues & Recommendations — action items
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  navy:    [30,  58,  95]  as [number,number,number],
  blue:    [59, 130, 246]  as [number,number,number],
  green:   [16, 185, 129]  as [number,number,number],
  amber:   [245,158,  11]  as [number,number,number],
  red:     [239,  68,  68] as [number,number,number],
  ink:     [31,  41,  55]  as [number,number,number],
  muted:   [107,114,128]   as [number,number,number],
  light:   [249,250,251]   as [number,number,number],
  white:   [255,255,255]   as [number,number,number],
  slate:   [229,231,235]   as [number,number,number],
};

const PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#EC4899'];

const CATEGORY_EN: Record<string,string> = {
  wood:'Wood', metal:'Metal', plastic:'Plastic', glass:'Glass',
  aluminum:'Aluminum', textile:'Textile', electrical:'Electrical', other:'Other',
};

const CO2: Record<string,number> = {
  wood:0.5, metal:2.5, plastic:3.0, glass:0.8,
  aluminum:8.0, textile:1.5, electrical:2.0, other:1.0,
};

// ─── Hebrew / Unicode font loader ──────────────────────────────────────────────
async function loadHeeboFont(doc: jsPDF): Promise<void> {
  try {
    const toBase64 = (buf: ArrayBuffer): string => {
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    };
    const [rRes, bRes] = await Promise.all([
      fetch('/fonts/Heebo-Regular.ttf'),
      fetch('/fonts/Heebo-Bold.ttf'),
    ]);
    if (!rRes.ok || !bRes.ok) throw new Error('Font fetch failed');
    const [rBuf, bBuf] = await Promise.all([rRes.arrayBuffer(), bRes.arrayBuffer()]);
    doc.addFileToVFS('Heebo-Regular.ttf', toBase64(rBuf));
    doc.addFont('Heebo-Regular.ttf', 'Heebo', 'normal');
    doc.addFileToVFS('Heebo-Bold.ttf', toBase64(bBuf));
    doc.addFont('Heebo-Bold.ttf', 'Heebo', 'bold');
    doc.setFont('Heebo', 'normal'); // make it the active font
  } catch {
    // Falls back to Helvetica — English only
  }
}

// Set font — use Heebo if registered, otherwise Helvetica
function setFont(doc: jsPDF, style: 'normal' | 'bold') {
  try {
    doc.setFont('Heebo', style);
  } catch {
    doc.setFont('helvetica', style);
  }
}

// ─── Public interface ─────────────────────────────────────────────────────────
export interface ReportData {
  projectName: string;
  projectAddress: string;
  items: any[];
  apartments?: any[];
}

export async function generateExecutiveReport(data: ReportData): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await loadHeeboFont(doc);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;          // page margin
  const CW = W - M * 2;  // content width

  const s   = calcStats(data.items);
  const cats = calcCategories(data.items);
  const cols = calcCollectors(data.items);
  const tips = buildInsights(s, cats, cols);

  const TOTAL_PAGES = 7;
  const project = data.projectName || 'Project';

  // Page 1 — Cover (no footer)
  pageCover(doc, data, W, H, s);

  // Pages 2–7 — content with footer
  const pages: [string, (d:jsPDF)=>void][] = [
    ['Executive Summary',       d => pageExecSummary(d, s, tips, M, CW)],
    ['Material Breakdown',      d => pageMaterials(d, cats, M, CW)],
    ['Collection Performance',  d => pageCollection(d, s, M, CW)],
    ['Team Performance',        d => pageTeam(d, cols, s, M, CW)],
    ['Environmental Impact',    d => pageEnvironment(d, s, M, CW)],
    ['Issues & Recommendations',d => pageIssues(d, data.items, M, CW)],
  ];

  pages.forEach(([title, render], i) => {
    doc.addPage();
    sectionHeader(doc, title, W);
    render(doc);
    addFooter(doc, i + 2, TOTAL_PAGES, project, W, H);
  });

  const safe = project.replace(/[^\x00-\x7F]/g, '').replace(/[^\w\s-]/g, '').trim() || 'Project';
  const date = new Date().toISOString().split('T')[0];
  doc.save(`Executive_Report_${safe}_${date}.pdf`);
}

// ─── Stats helpers ─────────────────────────────────────────────────────────────
function calcStats(items: any[]) {
  const total      = items.reduce((s,i) => s + (i.quantity||1), 0);
  const collected  = items.filter(i=>i.collected).reduce((s,i)=>s+(i.quantity||1),0);
  const pending    = items.filter(i=>!i.collected&&i.intended_for_collection).reduce((s,i)=>s+(i.quantity||1),0);
  const weight     = items.reduce((s,i)=>s+(i.estimated_weight_kg||0)*(i.quantity||1),0);
  let co2 = 0;
  items.filter(i=>i.collected).forEach(i=>{
    co2 += (i.estimated_weight_kg||0)*(CO2[i.material_category]||1)*(i.quantity||1);
  });
  return {
    total, collected, pending,
    rate: total>0?(collected/total)*100:0,
    weight,
    co2,
    water: weight*150,
    landfill: weight*0.85,
    trees: Math.round(co2/21),
  };
}

interface CatStat { name:string; label:string; count:number; weight:number; pct:number; }
function calcCategories(items: any[]): CatStat[] {
  const m: Record<string,{count:number;weight:number}> = {};
  const tot = items.reduce((s,i)=>s+(i.quantity||1),0);
  items.forEach(i=>{
    const k = i.material_category||'other';
    if(!m[k]) m[k]={count:0,weight:0};
    m[k].count += i.quantity||1;
    m[k].weight += (i.estimated_weight_kg||0)*(i.quantity||1);
  });
  return Object.entries(m)
    .map(([name,d])=>({name,label:CATEGORY_EN[name]||name,count:d.count,weight:d.weight,pct:tot>0?(d.count/tot)*100:0}))
    .sort((a,b)=>b.count-a.count);
}

function calcCollectors(items: any[]): {name:string;count:number;pct:number}[] {
  const done = items.filter(i=>i.collected);
  const tot  = done.reduce((s,i)=>s+(i.quantity||1),0);
  const m: Record<string,number> = {};
  done.forEach(i=>{
    const n = i.collected_by||'Unassigned';
    m[n] = (m[n]||0)+(i.quantity||1);
  });
  return Object.entries(m)
    .map(([name,count])=>({name,count,pct:tot>0?(count/tot)*100:0}))
    .sort((a,b)=>b.count-a.count).slice(0,8);
}

function buildInsights(s: ReturnType<typeof calcStats>, cats: CatStat[], cols: any[]): string[] {
  const out: string[] = [];
  if (s.rate>=95) out.push(`Outstanding collection efficiency: ${s.rate.toFixed(1)}% of all items successfully recovered.`);
  else if (s.rate>=80) out.push(`Strong collection efficiency: ${s.rate.toFixed(1)}% of items collected — on track to meet targets.`);
  else out.push(`Collection rate stands at ${s.rate.toFixed(1)}% — a structured review of blockers is recommended.`);
  if (cats[0]) out.push(`${cats[0].label} is the dominant material class at ${cats[0].pct.toFixed(1)}% of total inventory.`);
  if (cols[0]&&cols[0].name!=='Unassigned') out.push(`Top performer: ${cols[0].name} collected ${cols[0].count} items (${cols[0].pct.toFixed(0)}% of all recovered units).`);
  if (s.trees>0) out.push(`CO₂ savings equivalent to planting ${s.trees} trees — measurable climate contribution.`);
  if (s.pending>0) out.push(`${s.pending} items remain pending collection and represent immediate recovery opportunity.`);
  return out;
}

// ─── Layout helpers ────────────────────────────────────────────────────────────
function hex2rgb(h: string): [number,number,number] {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return r ? [parseInt(r[1],16),parseInt(r[2],16),parseInt(r[3],16)] : [0,0,0];
}

function sectionHeader(doc: jsPDF, title: string, W: number) {
  doc.setFillColor(...C.navy);
  doc.rect(0,0,W,16,'F');
  // Left accent bar
  doc.setFillColor(...C.green);
  doc.rect(0,0,4,16,'F');
  doc.setTextColor(...C.white);
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.text(title, W/2, 11, {align:'center'});
}

function addFooter(doc: jsPDF, page: number, total: number, project: string, W: number, H: number) {
  doc.setFillColor(...C.navy);
  doc.rect(0, H-9, W, 9, 'F');
  doc.setTextColor(...C.white);
  setFont(doc,'normal');
  doc.setFontSize(6.5);
  doc.text(project, 10, H-3.5);
  doc.text('CONFIDENTIAL', W/2, H-3.5, {align:'center'});
  doc.text(`Page ${page} of ${total}`, W-10, H-3.5, {align:'right'});
}

function kpiCard(doc: jsPDF, x: number, y: number, w: number, h: number,
  value: string, label: string, accent: [number,number,number]) {
  doc.setFillColor(...C.white);
  doc.roundedRect(x,y,w,h,3,3,'F');
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.6);
  doc.roundedRect(x,y,w,h,3,3,'S');
  // Top color stripe
  doc.setFillColor(...accent);
  doc.rect(x,y,w,3,'F');
  setFont(doc,'bold');
  doc.setFontSize(15);
  doc.setTextColor(...C.ink);
  doc.text(value, x+w/2, y+15, {align:'center'});
  setFont(doc,'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text(label, x+w/2, y+22, {align:'center'});
}

function insightBox(doc: jsPDF, x: number, y: number, w: number, text: string, color: [number,number,number]) {
  const lines = doc.splitTextToSize(text, w-18) as string[];
  const bh = lines.length*5.5+8;
  doc.setFillColor(color[0],color[1],color[2],0.08 as any);
  doc.setFillColor(Math.min(color[0]+180,255),Math.min(color[1]+180,255),Math.min(color[2]+180,255));
  doc.roundedRect(x,y,w,bh,2,2,'F');
  doc.setFillColor(...color);
  doc.rect(x,y,3,bh,'F');
  doc.setFontSize(8);
  setFont(doc,'bold');
  doc.setTextColor(...color);
  doc.text('▸', x+6, y+6);
  setFont(doc,'normal');
  doc.setTextColor(...C.ink);
  doc.text(lines, x+12, y+6);
  return bh+3;
}

// ─── Donut chart ───────────────────────────────────────────────────────────────
function drawDonut(
  doc: jsPDF,
  cx: number, cy: number,
  outerR: number, innerR: number,
  segs: {value:number;color:string}[]
) {
  const tot = segs.reduce((s,d)=>s+d.value,0);
  if (!tot) return;
  let angle = -Math.PI/2;
  segs.forEach(seg=>{
    if (seg.value<=0) return;
    const sweep = (seg.value/tot)*Math.PI*2;
    const steps = Math.max(4, Math.ceil(sweep*20));
    const rgb = hex2rgb(seg.color);
    doc.setFillColor(...rgb);
    // Build donut ring polygon: outer arc forward, inner arc backward
    const pts: [number,number][] = [];
    for(let i=0;i<=steps;i++){
      const a = angle+(sweep*i)/steps;
      pts.push([cx+outerR*Math.cos(a), cy+outerR*Math.sin(a)]);
    }
    for(let i=steps;i>=0;i--){
      const a = angle+(sweep*i)/steps;
      pts.push([cx+innerR*Math.cos(a), cy+innerR*Math.sin(a)]);
    }
    const deltas = pts.slice(1).map((p,i)=>[p[0]-pts[i][0], p[1]-pts[i][1]]);
    doc.lines(deltas, pts[0][0], pts[0][1], [1,1], 'F', true);
    angle += sweep;
  });
  // White center hole
  doc.setFillColor(...C.white);
  doc.circle(cx, cy, innerR, 'F');
}

// ─── Horizontal progress bar ───────────────────────────────────────────────────
function progressBar(doc: jsPDF, x: number, y: number, w: number, h: number,
  pct: number, color: [number,number,number]) {
  doc.setFillColor(...C.slate);
  doc.roundedRect(x,y,w,h,h/2,h/2,'F');
  if (pct>0) {
    doc.setFillColor(...color);
    doc.roundedRect(x,y,Math.max(w*pct/100,h),h,h/2,h/2,'F');
  }
}

// ─── Pages ─────────────────────────────────────────────────────────────────────

function pageCover(doc: jsPDF, data: ReportData, W: number, H: number, s: ReturnType<typeof calcStats>) {
  // Background
  doc.setFillColor(...C.navy);
  doc.rect(0,0,W,H,'F');
  // Bold left accent stripe
  doc.setFillColor(...C.green);
  doc.rect(0,0,8,H,'F');
  // Top-right decorative block
  doc.setFillColor(59,130,246,0.3 as any);
  doc.setFillColor(40,80,130);
  doc.rect(W-50,0,50,50,'F');
  doc.setFillColor(30,58,95);
  doc.rect(W-40,10,30,30,'F');

  // White content panel
  const panelY = H*0.28;
  const panelH = H*0.38;
  doc.setFillColor(...C.white);
  doc.roundedRect(18, panelY, W-36, panelH, 6,6,'F');

  // Eyebrow
  doc.setTextColor(...C.green);
  setFont(doc,'bold');
  doc.setFontSize(9);
  doc.text('SELECTIVE DECONSTRUCTION', W/2, panelY+12, {align:'center'});

  // Main title
  doc.setTextColor(...C.navy);
  setFont(doc,'bold');
  doc.setFontSize(22);
  doc.text('Executive Report', W/2, panelY+26, {align:'center'});

  // Divider
  doc.setDrawColor(...C.green);
  doc.setLineWidth(1.5);
  doc.line(W/2-35, panelY+31, W/2+35, panelY+31);

  // Project name
  setFont(doc,'normal');
  doc.setFontSize(14);
  doc.setTextColor(...C.ink);
  const nameLines = doc.splitTextToSize(data.projectName||'Project', W-80) as string[];
  doc.text(nameLines, W/2, panelY+42, {align:'center'});

  // Address
  if (data.projectAddress) {
    doc.setFontSize(10);
    doc.setTextColor(...C.muted);
    doc.text(data.projectAddress, W/2, panelY+54, {align:'center'});
  }

  // Date
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}),
    W/2, panelY+panelH-10, {align:'center'});

  // KPI preview strip at bottom
  const stripY = H*0.75;
  const stripH = H*0.13;
  doc.setFillColor(20,45,78);
  doc.rect(0, stripY, W, stripH,'F');

  const kpis = [
    {v: s.total.toLocaleString(),       l:'Total Items'},
    {v: `${s.rate.toFixed(1)}%`,        l:'Collection Rate'},
    {v: `${s.weight.toFixed(0)} kg`,    l:'Total Weight'},
    {v: `${s.co2.toFixed(0)} kg CO₂`,  l:'Carbon Saved'},
  ];
  const kw = W/kpis.length;
  kpis.forEach((k,i)=>{
    const kx = i*kw + kw/2;
    if (i>0) {
      doc.setDrawColor(255,255,255,0.2 as any);
      doc.setDrawColor(60,90,130);
      doc.setLineWidth(0.3);
      doc.line(i*kw, stripY+8, i*kw, stripY+stripH-8);
    }
    doc.setTextColor(...C.white);
    setFont(doc,'bold');
    doc.setFontSize(16);
    doc.text(k.v, kx, stripY+stripH*0.42, {align:'center'});
    setFont(doc,'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(k.l, kx, stripY+stripH*0.68, {align:'center'});
  });

  // Footer
  doc.setTextColor(80,110,150);
  doc.setFontSize(7);
  doc.text('CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY', W/2, H-6, {align:'center'});
}

// ─── Page 2: Executive Summary ─────────────────────────────────────────────────
function pageExecSummary(doc: jsPDF, s: ReturnType<typeof calcStats>, tips: string[], M: number, CW: number) {
  let y = 26;

  // Section label
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text('Key Performance Indicators', M, y);
  y += 7;

  // 6 KPI cards (2 rows × 3)
  const kpis = [
    {v:s.total.toLocaleString(),             l:'Total Items',        c:C.blue},
    {v:`${s.rate.toFixed(1)}%`,              l:'Collection Rate',    c:C.green},
    {v:`${s.collected.toLocaleString()}`,    l:'Items Collected',    c:C.green},
    {v:`${s.pending.toLocaleString()}`,      l:'Items Pending',      c:C.amber},
    {v:`${s.weight.toFixed(1)} kg`,          l:'Total Weight',       c:C.blue},
    {v:`${s.trees}`,                         l:'Trees Equivalent',   c:C.green},
  ];
  const cw = (CW-8)/3;
  const ch = 28;
  kpis.forEach((k,i)=>{
    const row = Math.floor(i/3), col = i%3;
    kpiCard(doc, M+col*(cw+4), y+row*(ch+4), cw, ch, k.v, k.l, k.c);
  });
  y += 2*(ch+4)+6;

  // Key Insights
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text('Key Insights', M, y);
  y += 5;

  const insightColors: [number,number,number][] = [C.green, C.blue, C.amber, C.navy, C.green];
  tips.forEach((tip,i)=>{
    y += insightBox(doc, M, y, CW, tip, insightColors[i%insightColors.length]);
  });

  y += 4;

  // Summary assessment box
  const summaryText = s.rate>=80
    ? 'This project demonstrates strong selective deconstruction performance. High recovery rates, measurable environmental benefits, and clear team accountability position this engagement as a benchmark for future projects.'
    : 'The project shows meaningful progress but has headroom for improvement. A focused review of pending items and collector attribution completeness will drive recovery rates toward target thresholds.';

  doc.setFillColor(239,246,255);
  doc.roundedRect(M, y, CW, 32, 4,4,'F');
  doc.setFillColor(...C.blue);
  doc.rect(M, y, 3, 32,'F');
  setFont(doc,'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.blue);
  doc.text('Assessment', M+8, y+8);
  setFont(doc,'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.ink);
  const sl = doc.splitTextToSize(summaryText, CW-16) as string[];
  doc.text(sl, M+8, y+16);
}

// ─── Page 3: Material Breakdown ───────────────────────────────────────────────
function pageMaterials(doc: jsPDF, cats: CatStat[], M: number, CW: number) {
  let y = 26;
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text('Material Distribution', M, y);
  y += 7;

  if (cats.length === 0) {
    doc.setTextColor(...C.muted);
    doc.setFontSize(10);
    doc.text('No material data available.', M+CW/2, y+20, {align:'center'});
    return;
  }

  // ── Donut chart (left half) ──
  const donutCX = M + 38;
  const donutCY = y + 44;
  const outerR = 34;
  const innerR = 20;

  drawDonut(doc, donutCX, donutCY, outerR, innerR,
    cats.map((c,i)=>({value:c.count, color:PALETTE[i%PALETTE.length]})));

  // Center label
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.ink);
  doc.text(cats.reduce((s,c)=>s+c.count,0).toString(), donutCX, donutCY-2, {align:'center'});
  setFont(doc,'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.muted);
  doc.text('items', donutCX, donutCY+5, {align:'center'});

  // ── Legend (right of donut) ──
  const legendX = M + 82;
  const top6 = cats.slice(0,6);
  top6.forEach((c,i)=>{
    const ly = y + 6 + i*14;
    const rgb = hex2rgb(PALETTE[i%PALETTE.length]);
    doc.setFillColor(...rgb);
    doc.roundedRect(legendX, ly, 7, 7, 1,1,'F');
    setFont(doc,'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.ink);
    doc.text(c.label, legendX+10, ly+5.5);
    setFont(doc,'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(`${c.count} items · ${c.pct.toFixed(1)}%`, legendX+10, ly+12);
  });

  y += 100;

  // ── Bar chart ──
  setFont(doc,'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.navy);
  doc.text('Count by Category', M, y);
  y += 6;

  const maxCnt = Math.max(...cats.map(c=>c.count),1);
  const barsW = CW-30;
  const barH = 9;
  cats.slice(0,8).forEach((c,i)=>{
    const by = y + i*(barH+5);
    setFont(doc,'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.ink);
    doc.text(c.label, M, by+barH-1);
    const rgb = hex2rgb(PALETTE[i%PALETTE.length]);
    doc.setFillColor(...C.slate);
    doc.roundedRect(M+22, by, barsW, barH, 2,2,'F');
    doc.setFillColor(...rgb);
    doc.roundedRect(M+22, by, Math.max(barsW*c.count/maxCnt,3), barH, 2,2,'F');
    setFont(doc,'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.ink);
    doc.text(c.count.toString(), M+22+barsW+3, by+barH-1);
  });

  y += cats.slice(0,8).length*(barH+5)+8;

  // ── Full table ──
  autoTable(doc,{
    startY: y,
    head: [['Category','Items','Share','Weight (kg)','CO₂ Factor']],
    body: cats.map((c,i)=>[
      c.label, c.count, `${c.pct.toFixed(1)}%`, c.weight.toFixed(1),
      `${(CO2[c.name]||1).toFixed(1)} kg/kg`,
    ]),
    theme:'striped',
    headStyles:{fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:8},
    bodyStyles:{fontSize:8},
    columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right'},4:{halign:'right'}},
    margin:{left:M,right:M},
  });

  const tY = (doc as any).lastAutoTable.finalY+4;
  if (cats[0]) {
    insightBox(doc, M, tY, CW,
      `${cats[0].label} represents the largest recoverable category at ${cats[0].pct.toFixed(1)}% of inventory — prioritising this stream maximises diversion impact.`,
      C.green);
  }
}

// ─── Page 4: Collection Performance ───────────────────────────────────────────
function pageCollection(doc: jsPDF, s: ReturnType<typeof calcStats>, M: number, CW: number) {
  let y = 26;

  // Big rate hero card
  doc.setFillColor(240,253,244);
  doc.roundedRect(M, y, CW, 44, 5,5,'F');
  doc.setFillColor(...C.green);
  doc.rect(M, y, 4, 44,'F');

  setFont(doc,'bold');
  doc.setFontSize(36);
  doc.setTextColor(...C.green);
  const cx = M+CW/2;
  doc.text(`${s.rate.toFixed(1)}%`, cx, y+26, {align:'center'});
  setFont(doc,'normal');
  doc.setFontSize(10);
  doc.setTextColor(...C.ink);
  doc.text('Collection Rate', cx, y+38, {align:'center'});

  y += 55;

  // Status bars
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text('Status Breakdown', M, y);
  y += 7;

  const rows = [
    {label:'Collected', value:s.collected, color:C.green,  pct:s.total>0?(s.collected/s.total)*100:0},
    {label:'Pending',   value:s.pending,   color:C.amber,  pct:s.total>0?(s.pending/s.total)*100:0},
    {label:'Other',     value:Math.max(0,s.total-s.collected-s.pending), color:C.muted,
      pct: s.total>0?Math.max(0,(s.total-s.collected-s.pending)/s.total)*100:0},
  ];

  rows.forEach(r=>{
    setFont(doc,'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.ink);
    doc.text(r.label, M, y+8);
    progressBar(doc, M+32, y+2, CW-70, 10, r.pct, r.color);
    setFont(doc,'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(`${r.value} (${r.pct.toFixed(1)}%)`, M+CW-3, y+9, {align:'right'});
    y += 18;
  });

  y += 6;

  // 4 mini-KPI row
  const mw = (CW-12)/4;
  const mh = 24;
  const mkpis = [
    {v:s.total.toString(), l:'Total Inventoried',  c:C.blue},
    {v:s.collected.toString(), l:'Recovered',       c:C.green},
    {v:s.pending.toString(), l:'Outstanding',       c:C.amber},
    {v:`${s.weight.toFixed(0)} kg`, l:'Total Mass', c:C.navy},
  ];
  mkpis.forEach((k,i)=>kpiCard(doc, M+i*(mw+4), y, mw, mh, k.v, k.l, k.c));
  y += mh+8;

  const perfNote = s.rate>=90
    ? 'Exceptional recovery performance. The project is on track to exceed standard diversion benchmarks.'
    : s.rate>=75
    ? 'Good progress toward collection targets. A targeted push on pending items will close the gap.'
    : 'Collection rate below optimal threshold. Recommend immediate review of access, scheduling, and team capacity.';
  insightBox(doc, M, y, CW, perfNote, s.rate>=75?C.green:C.amber);
}

// ─── Page 5: Team Performance ─────────────────────────────────────────────────
function pageTeam(doc: jsPDF, cols: {name:string;count:number;pct:number}[], s: ReturnType<typeof calcStats>, M: number, CW: number) {
  let y = 26;
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text('Collector Leaderboard', M, y);
  y += 7;

  const named = cols.filter(c=>c.name!=='Unassigned');
  if (named.length===0) {
    doc.setTextColor(...C.muted);
    doc.setFontSize(10);
    doc.text('No collector attribution data available.', M+CW/2, y+20, {align:'center'});
    return;
  }

  const maxC = named[0].count||1;
  const medals = [...C.amber, C.muted, [205,127,50] as [number,number,number]];
  named.slice(0,7).forEach((c,i)=>{
    const ry = y + i*25;
    // Rank circle
    const rgb = i<3 ? hex2rgb(['#F59E0B','#9CA3AF','#CD7F32'][i]) : C.muted;
    doc.setFillColor(...rgb);
    doc.circle(M+7, ry+8, 7,'F');
    setFont(doc,'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.white);
    doc.text((i+1).toString(), M+7, ry+11, {align:'center'});
    // Name
    setFont(doc,'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.ink);
    const nameStr = c.name.length>22 ? c.name.slice(0,21)+'…' : c.name;
    doc.text(nameStr, M+18, ry+9);
    // Bar
    const barW = CW-70;
    doc.setFillColor(...C.slate);
    doc.roundedRect(M+18, ry+12, barW, 8, 2,2,'F');
    doc.setFillColor(...C.blue);
    doc.roundedRect(M+18, ry+12, Math.max(barW*c.count/maxC,3), 8, 2,2,'F');
    // Count
    setFont(doc,'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(`${c.count} items · ${c.pct.toFixed(0)}%`, M+CW-2, ry+9, {align:'right'});
  });

  y += named.slice(0,7).length*25+8;

  if (named.length>=2) {
    const top2pct = ((named[0].count+(named[1]?.count||0))/Math.max(s.collected,1)*100);
    insightBox(doc, M, y, CW,
      `Top 2 collectors account for ${top2pct.toFixed(0)}% of all recovered items — consider cross-training to distribute load and reduce key-person risk.`,
      C.amber);
    y += 24;
  }

  if (cols.some(c=>c.name==='Unassigned')) {
    const u = cols.find(c=>c.name==='Unassigned')!;
    insightBox(doc, M, y, CW,
      `${u.count} items (${u.pct.toFixed(1)}%) have no collector attribution. Complete tagging improves traceability and accountability.`,
      C.red);
  }
}

// ─── Page 6: Environmental Impact ─────────────────────────────────────────────
function pageEnvironment(doc: jsPDF, s: ReturnType<typeof calcStats>, M: number, CW: number) {
  let y = 26;
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text('Environmental Impact Summary', M, y);
  y += 7;

  const cards = [
    {icon:'🌿', value:`${s.co2.toFixed(1)}`, unit:'kg CO₂', label:'Carbon Saved', note:`≈ ${s.trees} trees planted`},
    {icon:'💧', value:`${(s.water/1000).toFixed(1)}`, unit:'m³', label:'Water Conserved', note:`≈ ${Math.round(s.water/150).toLocaleString()} showers`},
    {icon:'♻️', value:`${s.landfill.toFixed(1)}`, unit:'kg', label:'Landfill Diverted', note:`${((s.landfill/Math.max(s.weight,1))*100).toFixed(0)}% diversion rate`},
  ];

  const cw = (CW-10)/3;
  const ch = 58;
  cards.forEach((c,i)=>{
    const cx2 = M+i*(cw+5);
    doc.setFillColor(236,253,245);
    doc.roundedRect(cx2, y, cw, ch, 5,5,'F');
    doc.setFillColor(...C.green);
    doc.rect(cx2, y, cw, 4,'F');
    setFont(doc,'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.green);
    doc.text(c.label.toUpperCase(), cx2+cw/2, y+12, {align:'center'});
    doc.setFontSize(20);
    doc.setTextColor(...C.green);
    doc.text(c.value, cx2+cw/2, y+28, {align:'center'});
    setFont(doc,'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(c.unit, cx2+cw/2, y+36, {align:'center'});
    doc.setFontSize(7);
    doc.text(c.note, cx2+cw/2, y+48, {align:'center'});
  });

  y += ch+10;

  // Donut — collected vs not (weight)
  const collectedWeight = s.weight*(s.rate/100);
  const pendingWeight   = s.weight - collectedWeight;
  if (s.weight>0) {
    setFont(doc,'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.navy);
    doc.text('Weight Recovered vs Outstanding', M, y);
    y += 5;

    drawDonut(doc, M+30, y+30, 26, 15, [
      {value:collectedWeight, color:'#10B981'},
      {value:pendingWeight,   color:'#F59E0B'},
    ]);
    setFont(doc,'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.ink);
    doc.text(`${s.rate.toFixed(0)}%`, M+30, y+29, {align:'center'});
    setFont(doc,'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text('recovered', M+30, y+35, {align:'center'});

    // Legend
    const lx = M+65;
    [[C.green,'Recovered', collectedWeight.toFixed(1)],
     [C.amber, 'Outstanding', pendingWeight.toFixed(1)]].forEach(([col,lbl,val]:any,i)=>{
      const ly = y+10+i*16;
      doc.setFillColor(...(col as [number,number,number]));
      doc.roundedRect(lx, ly, 8, 8, 1,1,'F');
      setFont(doc,'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      doc.text(lbl, lx+12, ly+6);
      setFont(doc,'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.muted);
      doc.text(`${val} kg`, lx+12, ly+13);
    });
    y += 70;
  }

  insightBox(doc, M, y, CW,
    'Selective deconstruction delivers compounding environmental returns: every kilogram recovered reduces embodied carbon, conserves water used in manufacturing, and keeps material value in the circular economy.',
    C.green);
}

// ─── Page 7: Issues & Recommendations ─────────────────────────────────────────
function pageIssues(doc: jsPDF, items: any[], M: number, CW: number) {
  let y = 26;

  const uncollected   = items.filter(i=>i.intended_for_collection&&!i.collected);
  const noAttribution = items.filter(i=>i.collected&&!i.collected_by);

  // Issue summary table
  setFont(doc,'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text('Issue Summary', M, y);
  y += 5;

  autoTable(doc,{
    startY: y,
    head: [['Issue','Count','Priority']],
    body: [
      ['Items not yet collected (flagged for collection)', uncollected.length, uncollected.length>10?'HIGH':'MEDIUM'],
      ['Collected items with no attribution', noAttribution.length, noAttribution.length>5?'HIGH':'LOW'],
    ],
    theme:'grid',
    headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold',fontSize:8},
    bodyStyles:{fontSize:8.5},
    columnStyles:{1:{halign:'right',cellWidth:22},2:{halign:'center',cellWidth:22}},
    didParseCell:(d:any)=>{
      if(d.column.index===2&&d.section==='body'){
        const v = d.cell.raw as string;
        d.cell.styles.textColor = v==='HIGH'?[239,68,68] : v==='MEDIUM'?[245,158,11] : [107,114,128];
        d.cell.styles.fontStyle = 'bold';
      }
    },
    margin:{left:M,right:M},
  });

  y = (doc as any).lastAutoTable.finalY+6;

  // Top uncollected items
  if (uncollected.length>0) {
    setFont(doc,'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.navy);
    doc.text(`Top Pending Items (showing ${Math.min(8,uncollected.length)} of ${uncollected.length})`, M, y);
    y += 3;
    autoTable(doc,{
      startY: y,
      head: [['Description','Qty','Category','Weight (kg)']],
      body: uncollected.slice(0,8).map(i=>[
        (i.description||'—').slice(0,38),
        i.quantity||1,
        CATEGORY_EN[i.material_category]||i.material_category||'—',
        ((i.estimated_weight_kg||0)*(i.quantity||1)).toFixed(1),
      ]),
      theme:'striped',
      headStyles:{fillColor:C.amber,textColor:C.white,fontStyle:'bold',fontSize:8},
      bodyStyles:{fontSize:8},
      columnStyles:{1:{halign:'right'},3:{halign:'right'}},
      margin:{left:M,right:M},
    });
    y = (doc as any).lastAutoTable.finalY+6;
  }

  // Recommendations
  setFont(doc,'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.navy);
  doc.text('Strategic Recommendations', M, y);
  y += 4;

  const recs = [
    {t:'Complete attribution tagging', d:'Ensure every collected item is linked to a named collector. This improves traceability and performance accountability.'},
    {t:'Schedule sweep for pending items', d:'Assign specific collection windows for outstanding items, prioritising high-weight or high-value categories.'},
    {t:'Set per-team targets', d:'Establish weekly collection goals per collector to drive productivity and provide clear performance benchmarks.'},
    {t:'Close feedback loop with site managers', d:'Share this report with building managers weekly to maintain alignment and resolve access blockers quickly.'},
  ];
  recs.forEach(r=>{
    doc.setFillColor(239,246,255);
    doc.roundedRect(M, y, CW, 20, 3,3,'F');
    doc.setFillColor(...C.blue);
    doc.rect(M, y, 3, 20,'F');
    setFont(doc,'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.blue);
    doc.text(r.t, M+8, y+7);
    setFont(doc,'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.ink);
    const dl = doc.splitTextToSize(r.d, CW-16) as string[];
    doc.text(dl, M+8, y+14);
    y += 24;
  });
}
