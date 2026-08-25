import { normalizeCatalogText, productId, type Product } from './catalog.ts'
import type { CatalogMapping } from './catalogMapping.ts'
export interface CatalogImportSummary { imported: number; skipped: number; merged: number }
const text = (value: unknown) => String(value ?? '').trim()
function value(row: Record<string, unknown>, mapping: CatalogMapping, field: keyof CatalogMapping): unknown { const header = mapping[field]; return header == null ? null : row[header] }
function numberOrNull(value: unknown): number | null { const cleaned = text(value).replace(/[^\d.-]/g, ''); if (!cleaned) return null; const n = Number(cleaned); return Number.isFinite(n) ? n : null }
function bool(value: unknown): boolean { return ['true', 'yes', 'y', '1', 'famous', 'popular'].includes(normalizeCatalogText(value)) }
function aliases(value: unknown): string[] { return text(value).split(/[,;|]/).map((part) => part.trim()).filter(Boolean) }
export function parseCatalogRows(rows: Record<string, unknown>[], mapping: CatalogMapping, importedAt = Date.now()): { products: Product[]; summary: CatalogImportSummary } {
  const byId = new Map<string, Product>(); let skipped = 0; let merged = 0
  for (const row of rows) {
    const brand = text(value(row, mapping, 'brand')); const salt = text(value(row, mapping, 'salt'))
    if (!brand || !salt) { skipped++; continue }
    const brandNormalized = normalizeCatalogText(brand); const saltNormalized = normalizeCatalogText(salt)
    const fields = { brandNormalized, saltNormalized, strength: text(value(row, mapping, 'strength')), form: text(value(row, mapping, 'form')), manufacturer: text(value(row, mapping, 'manufacturer')) }
    const id = productId(fields); const stock = numberOrNull(value(row, mapping, 'stock')); const existing = byId.get(id)
    if (existing) { merged++; existing.stock = existing.stock == null ? stock : stock == null ? existing.stock : existing.stock + stock; existing.isFamousBrand ||= bool(value(row, mapping, 'famous')); existing.synonyms = [...new Set([...existing.synonyms, ...aliases(value(row, mapping, 'synonyms'))])]; continue }
    byId.set(id, { id, brand, salt, category: text(value(row, mapping, 'category')), form: fields.form, strength: fields.strength, manufacturer: fields.manufacturer, stock, price: numberOrNull(value(row, mapping, 'price')), isFamousBrand: bool(value(row, mapping, 'famous')), synonyms: aliases(value(row, mapping, 'synonyms')), importedAt, brandNormalized, saltNormalized })
  }
  return { products: [...byId.values()].sort((a, b) => a.brand.localeCompare(b.brand)), summary: { imported: byId.size, skipped, merged } }
}

