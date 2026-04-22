// =========================================================================
// Sustainability factors — kg CO2-equivalent avoided per kg of diverted
// material. Sources: UK DEFRA + EPA WARM, rounded for reporting. These
// are intentionally conservative so a developer customer can trust the
// number. If Noa wants Israel-specific factors later, commission them and
// swap them in here — all PDF output auto-updates.
// =========================================================================

export const MATERIAL_CO2_KG_PER_KG = {
  wood: 1.8,
  metal: 2.0,
  aluminum: 9.1,    // embedded energy of primary aluminum is huge
  glass: 0.6,
  plastic: 2.5,
  textile: 8.0,     // cotton / mixed textiles
  electrical: 4.5,  // mixed metals + plastic + manufacturing
  other: 1.5,       // conservative default
} as const;

export type MaterialCategory = keyof typeof MATERIAL_CO2_KG_PER_KG;

// Fallback weight used when an item has no estimated_weight_kg (pre-
// camera-vision items). Intentionally low to avoid overstating totals.
export const FALLBACK_WEIGHT_KG_BY_TYPE = {
  furniture: 25,
  appliance: 40,
  textile: 3,
  small_item: 2,
  other: 5,
} as const;

export type ItemType = keyof typeof FALLBACK_WEIGHT_KG_BY_TYPE;

export interface ReportItem {
  id: string;
  description: string;
  quantity: number;
  location: string | null;
  intended_for_collection: boolean;
  collected: boolean;
  item_type: string;
  material_category: string;
  estimated_weight_kg: number | null;
  image_url: string | null;
  condition?: string | null;
  source?: string | null;
  ai_confidence?: number | null;
  apartment_id?: string;
}

export interface ReportApartment {
  id: string;
  building_number: string;
  apartment_number: string;
  status: string;
  items?: ReportItem[];
}

export interface ReportProject {
  id: string;
  name: string;
  city: string;
  developer_name: string;
  start_date: string;
}

export interface MaterialTotals {
  material: MaterialCategory;
  kg: number;
  co2_kg: number;
  itemCount: number;
}

export interface SustainabilitySummary {
  totalItems: number;
  collectedItems: number;
  diverted_kg: number;
  co2_saved_kg: number;
  apartmentCount: number;
  byMaterial: MaterialTotals[];
}

// Weight resolver — uses estimated_weight_kg when available, else the
// per-item-type fallback. Multiplied by quantity.
export function itemWeight(item: ReportItem): number {
  const base = item.estimated_weight_kg
    ?? FALLBACK_WEIGHT_KG_BY_TYPE[(item.item_type as ItemType)] ?? 5;
  return base * (item.quantity ?? 1);
}

// Aggregate a list of items into a sustainability summary. Only items
// that were actually collected count toward diverted/CO2 totals.
export function summarise(items: ReportItem[], apartmentCount: number): SustainabilitySummary {
  const materialMap = new Map<MaterialCategory, MaterialTotals>();
  for (const mat of Object.keys(MATERIAL_CO2_KG_PER_KG) as MaterialCategory[]) {
    materialMap.set(mat, { material: mat, kg: 0, co2_kg: 0, itemCount: 0 });
  }

  let totalItems = 0;
  let collectedItems = 0;
  let diverted_kg = 0;
  let co2_saved_kg = 0;

  for (const item of items) {
    totalItems += 1;
    if (!item.collected) continue;
    collectedItems += 1;

    const w = itemWeight(item);
    const mat = (MATERIAL_CO2_KG_PER_KG[item.material_category as MaterialCategory] != null
      ? item.material_category
      : 'other') as MaterialCategory;
    const factor = MATERIAL_CO2_KG_PER_KG[mat];
    const co2 = w * factor;

    diverted_kg += w;
    co2_saved_kg += co2;

    const entry = materialMap.get(mat)!;
    entry.kg += w;
    entry.co2_kg += co2;
    entry.itemCount += 1;
  }

  return {
    totalItems,
    collectedItems,
    diverted_kg,
    co2_saved_kg,
    apartmentCount,
    byMaterial: [...materialMap.values()].filter(m => m.kg > 0).sort((a, b) => b.kg - a.kg),
  };
}

export function formatKg(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} טון`;
  return `${Math.round(kg)} ק"ג`;
}

export function formatCO2(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} טון CO₂`;
  return `${Math.round(kg)} ק"ג CO₂`;
}

export const MATERIAL_HE: Record<MaterialCategory, string> = {
  wood: 'עץ',
  metal: 'מתכת',
  aluminum: 'אלומיניום',
  glass: 'זכוכית',
  plastic: 'פלסטיק',
  textile: 'טקסטיל',
  electrical: 'חשמלי',
  other: 'אחר',
};
