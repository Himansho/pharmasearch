import { describe, expect, it } from 'vitest'
import { isProductInStock, searchProducts } from './catalog.ts'
import { parseCatalogRows } from './catalogImport.ts'
import { autoDetectCatalogMapping } from './catalogMapping.ts'

const rows = [
  { Brand: 'Dolo 650', 'Salt (Generic)': 'Paracetamol', Stock: '4', Famous: 'yes' },
  { Brand: 'Local Paracetamol', 'Salt (Generic)': 'Paracetamol', Stock: '0', Famous: 'no' },
]

describe('catalog import and ranking', () => {
  it('auto-maps common supplier headers and merges duplicate rows', () => {
    const mapping = autoDetectCatalogMapping(Object.keys(rows[0]))
    expect(mapping.brand).toBe('Brand')
    expect(mapping.salt).toBe('Salt (Generic)')
    const imported = parseCatalogRows([...rows, { ...rows[0], Stock: '3' }], mapping)
    expect(imported.summary.merged).toBe(1)
    expect(imported.products[0].stock).toBe(7)
  })

  it('ranks popular and in-stock matches, including typo tolerance', () => {
    const mapping = autoDetectCatalogMapping(Object.keys(rows[0]))
    const products = parseCatalogRows(rows, mapping).products
    const typo = searchProducts(products, { query: 'paracetmol', inStockOnly: false })
    expect(typo[0].brand).toBe('Dolo 650')
    expect(searchProducts(products, { query: 'paracetamol', inStockOnly: true })).toHaveLength(1)
    expect(isProductInStock(products[0])).toBe(true)
  })
})
