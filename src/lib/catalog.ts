/** Deterministic, local-first medicine catalog search. */
export interface Product {
  id: string
  brand: string
  salt: string
  category: string
  form: string
  strength: string
  manufacturer: string
  stock: number | null
  price: number | null
  isFamousBrand: boolean
  synonyms: string[]
  importedAt: number
  brandNormalized: string
  saltNormalized: string
}

export interface CatalogSearchOptions {
  query: string
  inStockOnly: boolean
  category?: string
  limit?: number
}

export function normalizeCatalogText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function productId(fields: Pick<Product, 'brandNormalized' | 'saltNormalized' | 'strength' | 'form' | 'manufacturer'>): string {
  return `product_${stableHash([
    fields.brandNormalized,
    fields.saltNormalized,
    normalizeCatalogText(fields.strength),
    normalizeCatalogText(fields.form),
    normalizeCatalogText(fields.manufacturer),
  ].join('|'))}`
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]
}

function fuzzyScore(query: string, value: string): number {
  if (!query || !value) return 0
  if (value === query) return 1000
  if (value.startsWith(query)) return 760
  if (value.includes(query)) return 560
  let score = 0
  for (const token of query.split(' ')) {
    if (token.length < 3) continue
    for (const candidate of value.split(' ')) {
      const distance = levenshtein(token, candidate)
      const threshold = token.length <= 5 ? 1 : 2
      if (distance <= threshold) score = Math.max(score, 320 - distance * 80)
    }
  }
  return score
}

function productScore(product: Product, query: string): number {
  if (!query) return 0
  const brand = fuzzyScore(query, product.brandNormalized)
  const salt = fuzzyScore(query, product.saltNormalized)
  const aliases = product.synonyms.reduce((best, alias) => Math.max(best, fuzzyScore(query, normalizeCatalogText(alias))), 0)
  return Math.max(brand + 180, salt + 80, aliases) + (product.isFamousBrand ? 240 : 0)
}

export function isProductInStock(product: Product): boolean {
  return product.stock != null && product.stock > 0
}

export function searchProducts(products: Product[], options: CatalogSearchOptions): Product[] {
  const query = normalizeCatalogText(options.query)
  const category = normalizeCatalogText(options.category ?? '')
  return products
    .filter((product) => (!options.inStockOnly || isProductInStock(product)) && (!category || normalizeCatalogText(product.category) === category))
    .map((product) => ({ product, score: productScore(product, query) }))
    .filter(({ score }) => !query || score > 0)
    .sort((a, b) => b.score - a.score || Number(isProductInStock(b.product)) - Number(isProductInStock(a.product)) || (b.product.stock ?? -1) - (a.product.stock ?? -1) || a.product.brand.localeCompare(b.product.brand))
    .slice(0, options.limit ?? 100)
    .map(({ product }) => product)
}

export function productsWithSameSalt(products: Product[], product: Product): Product[] {
  return products.filter((candidate) => candidate.id !== product.id && candidate.saltNormalized === product.saltNormalized)
    .sort((a, b) => Number(b.isFamousBrand) - Number(a.isFamousBrand) || Number(isProductInStock(b)) - Number(isProductInStock(a)) || a.brand.localeCompare(b.brand))
}

