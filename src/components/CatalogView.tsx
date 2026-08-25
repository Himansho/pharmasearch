import { useMemo, useState } from 'react'
import type { ParsedSheet } from '../lib/parse.ts'
import { parseFile } from '../lib/parse.ts'
import { parseCatalogRows } from '../lib/catalogImport.ts'
import { autoDetectCatalogMapping, CATALOG_FIELD_DEFS, type CatalogMapping } from '../lib/catalogMapping.ts'
import { isProductInStock, productsWithSameSalt, searchProducts, type Product } from '../lib/catalog.ts'
import { sampleCatalogSheet } from '../lib/catalogSample.ts'

interface CatalogViewProps {
  products: Product[]
  onProducts: (products: Product[]) => Promise<void>
  onBack: () => void
}

function money(value: number | null): string {
  return value == null ? 'Price not listed' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
}

function cell(value: unknown): string { return value == null ? '' : String(value) }

export function CatalogView({ products, onProducts, onBack }: CatalogViewProps) {
  const [query, setQuery] = useState('')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<CatalogMapping | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products])
  const results = useMemo(() => searchProducts(products, { query, inStockOnly, category }), [products, query, inStockOnly, category])
  const alternatives = selected ? productsWithSameSalt(products, selected) : []

  const togglePopular = async (id: string) => {
    await onProducts(products.map((product) => product.id === id ? { ...product, isFamousBrand: !product.isFamousBrand } : product))
  }

  const beginImport = (nextSheet: ParsedSheet) => {
    setSheet(nextSheet)
    setMapping(autoDetectCatalogMapping(nextSheet.headers))
    setError(null)
  }

  const readFile = async (file: File) => {
    setBusy(true); setError(null)
    try { beginImport(await parseFile(await file.arrayBuffer(), file.name)) } catch (e) { setError(e instanceof Error ? e.message : 'Could not read this catalog file.') } finally { setBusy(false) }
  }

  const confirmImport = async () => {
    if (!sheet || !mapping?.brand || !mapping.salt) return
    setBusy(true)
    try {
      const outcome = parseCatalogRows(sheet.rows, mapping)
      if (outcome.products.length === 0) {
        setError('No valid products were found. Check that Brand and Salt columns are mapped and contain values; your existing catalog was not changed.')
        return
      }
      await onProducts(outcome.products)
      setSheet(null); setMapping(null)
      setMessage(`Catalog ready: ${outcome.summary.imported} products imported${outcome.summary.merged ? `, ${outcome.summary.merged} duplicate rows merged` : ''}${outcome.summary.skipped ? `, ${outcome.summary.skipped} rows skipped` : ''}.`)
    } finally { setBusy(false) }
  }

  if (sheet && mapping) {
    return <div className="screen catalog-screen">
      <header className="screen-head"><button className="link-back" type="button" onClick={() => { setSheet(null); setMapping(null) }}>← Back</button><h1>Map catalog columns</h1><p>{sheet.fileName} · {sheet.totalDataRows} rows</p></header>
      <section className="card"><p className="muted">Required fields are Brand and Salt / generic. The mapping is used only on this device.</p>
        <div className="map-grid catalog-map-grid">{CATALOG_FIELD_DEFS.map((def) => <label key={def.key} className="map-row"><span className="map-label">{def.label}{def.required ? <em> *</em> : ''}<small>{def.hint}</small></span><select value={mapping[def.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [def.key]: e.target.value || null })}><option value="">— Not in this file —</option>{sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
        <div className="preview-wrap"><table className="preview"><thead><tr>{sheet.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{sheet.previewRows.slice(1, 4).map((row, ri) => <tr key={ri}>{sheet.headers.map((header, ci) => <td key={header}>{cell(row[ci]) || '—'}</td>)}</tr>)}</tbody></table></div>
        <div className="btn-row sticky-actions"><button className="btn" type="button" onClick={() => { setSheet(null); setMapping(null) }}>Cancel</button><button className="btn btn-primary" type="button" disabled={!mapping.brand || !mapping.salt || busy} onClick={() => void confirmImport()}>{busy ? 'Importing…' : 'Import catalog'}</button></div>
      </section>
    </div>
  }

  return <div className="screen catalog-screen">
    <header className="catalog-topbar"><div><button className="link-back" type="button" onClick={onBack}>← Pharmacy tools</button><p className="eyebrow">PHARMASEARCH</p><h1>Medicine catalog</h1><p className="catalog-sub">Find a brand or generic salt quickly, even when you’re offline.</p></div><div className="catalog-actions"><label className="btn btn-primary file-button">{busy ? 'Reading…' : 'Import catalog'}<input type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void readFile(file); e.currentTarget.value = '' }} /></label><button className="btn" type="button" onClick={() => beginImport(sampleCatalogSheet())}>Try sample</button></div></header>
    <section className="catalog-stats"><span><strong>{products.length}</strong> products</span><span><strong>{products.filter(isProductInStock).length}</strong> in stock</span><span><strong>{products.filter((p) => p.isFamousBrand).length}</strong> popular brands</span></section>
    {message && <div className="banner" role="status"><span>{message}</span><button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}>×</button></div>}
    {error && <p className="error-note" role="alert">{error}</p>}
    <section className="catalog-search card"><label className="catalog-search-label" htmlFor="catalog-query">Search by brand or salt</label><div className="catalog-search-row"><input id="catalog-query" autoFocus type="search" className="search catalog-search-input" placeholder="Try paracetamol, Dolo, azith…" value={query} onChange={(e) => setQuery(e.target.value)} /><button className={`stock-toggle${inStockOnly ? ' active' : ''}`} type="button" aria-pressed={inStockOnly} onClick={() => setInStockOnly((value) => !value)}>● In stock only</button></div><div className="catalog-filters"><span>{results.length} result{results.length === 1 ? '' : 's'}</span>{categories.length > 0 && <label>Category <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}</div></section>
    {results.length === 0 ? <section className="empty-catalog card"><div className="empty-icon">⌕</div><h2>{products.length === 0 ? 'Import your medicine list' : 'No matching medicines'}</h2><p>{products.length === 0 ? 'Upload a CSV or Excel export with Brand and Salt columns. The catalog stays on this device.' : 'Try a broader brand or generic name, or turn off the stock filter.'}</p></section> : <ul className="catalog-results">{results.map((product) => <li key={product.id} className="product-card card"><div className="product-main"><div className="product-title-row"><h2>{product.brand}</h2>{product.isFamousBrand && <span className="popular-badge">★ Popular</span>}</div><p className="product-salt">{product.salt}{product.strength && ` · ${product.strength}`}</p><p className="product-meta">{[product.form, product.category, product.manufacturer].filter(Boolean).join(' · ') || 'Product details not listed'}</p></div><div className="product-side"><span className={`stock-pill ${isProductInStock(product) ? 'stock-yes' : 'stock-no'}`}>{isProductInStock(product) ? `${product.stock} in stock` : 'Out of stock'}</span><strong>{money(product.price)}</strong><button type="button" className="btn btn-small" onClick={() => setSelected(product)}>Alternatives</button><button type="button" className="btn btn-small btn-ghost" onClick={() => void togglePopular(product.id)}>{product.isFamousBrand ? 'Remove popular' : 'Mark popular'}</button></div></li>)}</ul>}
    <p className="footer-note">Catalog data is stored locally on this device. Import a fresh supplier export when stock changes.</p>
    {selected && <div className="modal-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null) }}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="alternatives-title"><div className="modal-head"><h2 id="alternatives-title">Alternatives for {selected.brand}</h2><button className="modal-close" type="button" onClick={() => setSelected(null)}>×</button></div><p className="muted">Same salt: {selected.salt}</p>{alternatives.length === 0 ? <p className="empty-note">No other products with this salt are in the catalog.</p> : <ul className="alternative-list">{alternatives.map((product) => <li key={product.id}><div><strong>{product.brand}</strong><span>{product.strength || product.form || 'Same generic'}</span></div><span className={`stock-pill ${isProductInStock(product) ? 'stock-yes' : 'stock-no'}`}>{isProductInStock(product) ? `${product.stock} in stock` : 'Out of stock'}</span></li>)}</ul>}</div></div>}
  </div>
}
