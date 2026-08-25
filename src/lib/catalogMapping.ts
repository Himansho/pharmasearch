import { normalizeCatalogText } from './catalog.ts'

export type CatalogMappedField = 'brand' | 'salt' | 'stock' | 'price' | 'category' | 'form' | 'strength' | 'manufacturer' | 'famous' | 'synonyms'
export type CatalogMapping = Record<CatalogMappedField, string | null>
export const EMPTY_CATALOG_MAPPING: CatalogMapping = { brand: null, salt: null, stock: null, price: null, category: null, form: null, strength: null, manufacturer: null, famous: null, synonyms: null }
const HINTS: Record<CatalogMappedField, string[]> = {
  brand: ['brand', 'trade', 'product name', 'medicine name'], salt: ['salt', 'generic', 'composition', 'ingredient', 'molecule'], stock: ['stock', 'qty', 'quantity', 'inventory', 'balance'], price: ['price', 'mrp', 'rate', 'selling'], category: ['category', 'class', 'therapy'], form: ['form', 'dosage form', 'type'], strength: ['strength', 'dose', 'potency'], manufacturer: ['manufacturer', 'company', 'maker', 'mfg'], famous: ['famous', 'popular', 'featured', 'priority', 'boost'], synonyms: ['synonym', 'alias', 'alternate', 'alternative'],
}
export const CATALOG_FIELD_DEFS: Array<{ key: CatalogMappedField; label: string; required: boolean; hint: string }> = [
  { key: 'brand', label: 'Brand', required: true, hint: 'Trade / product name' }, { key: 'salt', label: 'Salt / generic', required: true, hint: 'Active ingredient' }, { key: 'stock', label: 'Stock', required: false, hint: 'Units currently available' }, { key: 'price', label: 'Price', required: false, hint: 'Selling price or MRP' }, { key: 'strength', label: 'Strength', required: false, hint: 'For example, 500 mg' }, { key: 'form', label: 'Form', required: false, hint: 'Tablet, syrup, cream' }, { key: 'category', label: 'Category', required: false, hint: 'Optional therapy category' }, { key: 'manufacturer', label: 'Manufacturer', required: false, hint: 'Company / marketer' }, { key: 'famous', label: 'Famous / popular', required: false, hint: 'Yes / true / 1 marks a boost' }, { key: 'synonyms', label: 'Synonyms', required: false, hint: 'Comma- or semicolon-separated aliases' },
]
export function autoDetectCatalogMapping(headers: string[]): CatalogMapping {
  const mapping: CatalogMapping = { ...EMPTY_CATALOG_MAPPING }
  const used = new Set<string>()
  const normalized = headers.map((header) => normalizeCatalogText(header))
  for (const field of Object.keys(HINTS) as CatalogMappedField[]) {
    let bestIndex = -1
    let bestScore = 0
    normalized.forEach((header, index) => {
      if (!header || used.has(headers[index])) return
      const score = HINTS[field].reduce((best, hint) => { const h = normalizeCatalogText(hint); return Math.max(best, header === h ? 3 : header.includes(h) ? 1 : 0) }, 0)
      if (score > bestScore) { bestScore = score; bestIndex = index }
    })
    if (bestIndex >= 0) { mapping[field] = headers[bestIndex]; used.add(headers[bestIndex]) }
  }
  return mapping
}

