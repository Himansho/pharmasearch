// Column mapping (PRD §6.2): map whatever headers a Marg-style export uses
// onto the app's fields. Mappings are stored by header label so they survive
// column reordering between exports.

export type MappedField =
  | 'itemName'
  | 'expiry'
  | 'batchNo'
  | 'quantity'
  | 'mrp'
  | 'ptr'
  | 'company'

export type ColumnMapping = Record<MappedField, string | null>

export interface FieldDef {
  key: MappedField
  label: string
  required: boolean
  hint: string
}

export const FIELD_DEFS: FieldDef[] = [
  { key: 'itemName', label: 'Item Name', required: true, hint: 'Medicine / product name' },
  { key: 'expiry', label: 'Expiry', required: true, hint: 'Usually MM/YY, e.g. 07/26' },
  { key: 'batchNo', label: 'Batch No.', required: false, hint: 'Needed for distributor returns' },
  { key: 'quantity', label: 'Quantity', required: false, hint: 'Current stock count' },
  { key: 'mrp', label: 'MRP', required: false, hint: 'Printed retail price' },
  { key: 'ptr', label: 'PTR', required: false, hint: 'Price to retailer — values returns' },
  { key: 'company', label: 'Company', required: false, hint: 'Manufacturer / marketer' },
]

export const EMPTY_MAPPING: ColumnMapping = {
  itemName: null,
  expiry: null,
  batchNo: null,
  quantity: null,
  mrp: null,
  ptr: null,
  company: null,
}

interface Synonyms {
  exact: string[]
  contains: string[]
}

const SYNONYMS: Record<MappedField, Synonyms> = {
  itemName: {
    exact: [
      'item name', 'itemname', 'item', 'product', 'product name', 'item description',
      'medicine', 'medicine name', 'description', 'particulars', 'name', 'item desc',
    ],
    contains: ['item name', 'product name', 'medicine'],
  },
  expiry: {
    exact: ['expiry', 'exp', 'exp date', 'expiry date', 'exp dt', 'expdt', 'expiry dt'],
    contains: ['exp'],
  },
  batchNo: {
    exact: ['batch', 'batch no', 'batchno', 'batch number', 'b no', 'bno', 'lot', 'lot no', 'btch'],
    contains: ['batch', 'lot no'],
  },
  quantity: {
    exact: [
      'qty', 'quantity', 'stock', 'current stock', 'cur stk', 'closing stock',
      'cl stock', 'stk', 'bal qty', 'balance', 'total qty', 'stock qty',
    ],
    contains: ['qty', 'quantity', 'stock', 'stk'],
  },
  mrp: {
    exact: ['mrp', 'm r p'],
    contains: ['mrp'],
  },
  ptr: {
    exact: ['ptr', 'p t r'],
    contains: ['ptr'],
  },
  company: {
    exact: ['company', 'comp', 'mfg', 'mfr', 'manufacturer', 'marketed by', 'make', 'brand', 'company name'],
    contains: ['company', 'manufactur', 'mfg', 'mfr'],
  },
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Guess which header goes with which field. Exact synonym matches beat
 * substring matches; each header is used at most once, and fields are filled
 * in a priority order so the strongest signals claim their columns first.
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { ...EMPTY_MAPPING }
  const used = new Set<string>()
  const normalized = headers.map(normalizeHeader)

  for (const field of ['itemName', 'expiry', 'batchNo', 'quantity', 'mrp', 'ptr', 'company'] as MappedField[]) {
    const syn = SYNONYMS[field]
    let bestIdx = -1
    let bestScore = 0
    normalized.forEach((norm, idx) => {
      const header = headers[idx]
      if (used.has(header) || !norm) return
      let score = 0
      if (syn.exact.includes(norm)) score = 3
      else if (syn.contains.some((c) => norm.includes(c))) score = 1
      if (score > bestScore) {
        bestScore = score
        bestIdx = idx
      }
    })
    if (bestIdx >= 0) {
      mapping[field] = headers[bestIdx]
      used.add(headers[bestIdx])
    }
  }
  return mapping
}

/** Keep only the parts of a saved mapping whose columns still exist in this file. */
export function sanitizeMapping(mapping: ColumnMapping, headers: string[]): ColumnMapping {
  const set = new Set(headers)
  const out: ColumnMapping = { ...EMPTY_MAPPING }
  for (const def of FIELD_DEFS) {
    const label = mapping[def.key]
    out[def.key] = label != null && set.has(label) ? label : null
  }
  return out
}

/** True when the saved mapping can be applied to this file's headers as-is. */
export function mappingCompatible(mapping: ColumnMapping | null, headers: string[]): boolean {
  if (!mapping || !mapping.itemName || !mapping.expiry) return false
  const set = new Set(headers)
  return FIELD_DEFS.every((def) => {
    const label = mapping[def.key]
    return label == null || set.has(label)
  })
}

/**
 * MAP-02: the saved mapping is reused as-is when it still fits the file, so a
 * repeat import is one tap. When the layout changed, whatever saved parts
 * still apply are kept and the gaps are filled by auto-detection.
 */
export function resolveInitialMapping(
  saved: ColumnMapping | null,
  headers: string[],
): { mapping: ColumnMapping; usingSaved: boolean } {
  if (saved && mappingCompatible(saved, headers)) {
    return { mapping: saved, usingSaved: true }
  }
  const auto = autoDetectMapping(headers)
  if (!saved) return { mapping: auto, usingSaved: false }
  const cleaned = sanitizeMapping(saved, headers)
  const merged: ColumnMapping = { ...auto }
  for (const def of FIELD_DEFS) {
    if (cleaned[def.key] != null) merged[def.key] = cleaned[def.key]
  }
  return { mapping: merged, usingSaved: false }
}
