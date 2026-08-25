import { useCallback, useEffect, useState } from 'react'
import type { Item, LastImport, Status } from './lib/types.ts'
import type { Product } from './lib/catalog.ts'
import { parseFile, type ParsedSheet } from './lib/parse.ts'
import {
  autoDetectMapping,
  resolveInitialMapping,
  type ColumnMapping,
} from './lib/mapping.ts'
import { runImport, type ImportSummary } from './lib/importer.ts'
import {
  clearAllData,
  getMeta,
  loadItems,
  loadProducts,
  replaceItems,
  replaceProducts,
  saveStatus,
  setMeta,
} from './lib/db.ts'
import { sampleSheet } from './lib/sample.ts'
import { UploadScreen } from './components/UploadScreen.tsx'
import { MappingScreen } from './components/MappingScreen.tsx'
import { Dashboard } from './components/Dashboard.tsx'
import { CatalogView } from './components/CatalogView.tsx'

type Phase = 'loading' | 'upload' | 'mapping' | 'dashboard'

interface PendingSheet {
  sheet: ParsedSheet
  initial: ColumnMapping
  mode: 'import' | 'edit'
  usingSaved: boolean
}

/** Enough of the last import kept around to re-open the mapping editor (MAP-03). */
interface StoredSheet {
  fileName: string
  headers: string[]
  previewRows: unknown[][]
}

function summaryText(s: ImportSummary, fileName: string): string {
  const parts = [`${s.added} new`, `${s.updated} updated`]
  if (s.dropped > 0) parts.push(`${s.dropped} no longer in the report (removed)`)
  if (s.needsReview > 0) parts.push(`${s.needsReview} need review`)
  return `Imported ${s.total} items from ${fileName}: ${parts.join(', ')}.`
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [items, setItems] = useState<Item[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [lastImport, setLastImport] = useState<LastImport | null>(null)
  const [pending, setPending] = useState<PendingSheet | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [canEditMapping, setCanEditMapping] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [catalogOpen, setCatalogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [storedItems, storedProducts, storedMapping, storedLast, storedSheet] = await Promise.all([
        loadItems(),
        loadProducts(),
        getMeta<ColumnMapping>('mapping'),
        getMeta<LastImport>('lastImport'),
        getMeta<StoredSheet>('lastSheet'),
      ])
      if (cancelled) return
      setItems(storedItems)
      setProducts(storedProducts)
      setMapping(storedMapping ?? null)
      setLastImport(storedLast ?? null)
      setCanEditMapping(storedSheet != null)
      setPhase(storedItems.length > 0 ? 'dashboard' : 'upload')
    })().catch(() => {
      if (!cancelled) setPhase('upload')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const openForImport = useCallback(
    (sheet: ParsedSheet) => {
      const { mapping: initial, usingSaved } = resolveInitialMapping(mapping, sheet.headers)
      setPending({ sheet, initial, mode: 'import', usingSaved })
      setPhase('mapping')
    },
    [mapping],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true)
      setUploadError(null)
      try {
        const buffer = await file.arrayBuffer()
        openForImport(await parseFile(buffer, file.name))
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'Could not read this file.')
      } finally {
        setBusy(false)
      }
    },
    [openForImport],
  )

  const handleSample = useCallback(() => {
    setUploadError(null)
    openForImport(sampleSheet(new Date()))
  }, [openForImport])

  const handleMappingConfirm = useCallback(
    async (m: ColumnMapping) => {
      if (!pending) return
      if (pending.mode === 'edit') {
        setMapping(m)
        await setMeta('mapping', m)
        setPending(null)
        setPhase('dashboard')
        setBanner('Column mapping updated — it will be used for your next import.')
        return
      }
      const now = new Date()
      const { sheet } = pending
      const outcome = runImport(sheet.rows, m, items, now)
      const last: LastImport = {
        fileName: sheet.fileName,
        at: now.getTime(),
        added: outcome.summary.added,
        updated: outcome.summary.updated,
        dropped: outcome.summary.dropped,
        needsReview: outcome.summary.needsReview,
        total: outcome.summary.total,
      }
      const storedSheet: StoredSheet = {
        fileName: sheet.fileName,
        headers: sheet.headers,
        previewRows: sheet.previewRows,
      }
      await replaceItems(outcome.items)
      await Promise.all([
        setMeta('mapping', m),
        setMeta('lastImport', last),
        setMeta('lastSheet', storedSheet),
      ])
      setItems(outcome.items)
      setMapping(m)
      setLastImport(last)
      setCanEditMapping(true)
      setPending(null)
      setPhase('dashboard')
      setBanner(summaryText(outcome.summary, sheet.fileName))
    },
    [pending, items],
  )

  const handleMappingCancel = useCallback(() => {
    setPending(null)
    setPhase(items.length > 0 ? 'dashboard' : 'upload')
  }, [items.length])

  const handleStatus = useCallback((id: string, status: Status) => {
    const ts = Date.now()
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status, lastUpdated: ts } : i)))
    saveStatus(id, status, ts).catch(() => {
      // IndexedDB write failed (private mode / storage full) — the in-memory
      // state still reflects the tap; nothing actionable for the user mid-audit.
    })
  }, [])

  const handleEditMapping = useCallback(async () => {
    const stored = await getMeta<StoredSheet>('lastSheet')
    if (!stored) return
    const rows = stored.previewRows.slice(1).map((r) => {
      const obj: Record<string, unknown> = {}
      stored.headers.forEach((h, i) => {
        obj[h] = r[i] ?? null
      })
      return obj
    })
    const sheet: ParsedSheet = {
      fileName: stored.fileName,
      sheetName: '',
      headers: stored.headers,
      rows,
      previewRows: stored.previewRows,
      totalDataRows: rows.length,
    }
    setPending({
      sheet,
      initial: mapping ?? autoDetectMapping(stored.headers),
      mode: 'edit',
      usingSaved: mapping != null,
    })
    setPhase('mapping')
  }, [mapping])

  const handleClearAll = useCallback(async () => {
    const ok = window.confirm(
      'Delete all expiry items, catalog products, audit statuses and settings from this device? This cannot be undone.',
    )
    if (!ok) return
    await clearAllData()
    setItems([])
    setMapping(null)
    setLastImport(null)
    setCanEditMapping(false)
    setBanner(null)
    setPending(null)
    setPhase('upload')
  }, [])

  const handleProducts = useCallback(async (next: Product[]) => {
    await replaceProducts(next)
    setProducts(next)
  }, [])

  if (phase === 'loading') {
    return <div className="splash">Loading…</div>
  }

  if (catalogOpen) {
    return <CatalogView products={products} onProducts={handleProducts} onBack={() => setCatalogOpen(false)} />
  }

  if (phase === 'upload') {
    return (
      <UploadScreen
        onFile={handleFile}
        onSample={handleSample}
        onBack={items.length > 0 ? () => setPhase('dashboard') : null}
        error={uploadError}
        busy={busy}
        onCatalog={() => setCatalogOpen(true)}
      />
    )
  }

  if (phase === 'mapping' && pending) {
    return (
      <MappingScreen
        sheet={pending.sheet}
        initial={pending.initial}
        mode={pending.mode}
        usingSaved={pending.usingSaved}
        onConfirm={handleMappingConfirm}
        onCancel={handleMappingCancel}
      />
    )
  }

  return (
    <Dashboard
      items={items}
      lastImport={lastImport}
      banner={banner}
      onDismissBanner={() => setBanner(null)}
      onStatus={handleStatus}
      onImportClick={() => {
        setUploadError(null)
        setPhase('upload')
      }}
      mapping={mapping}
      canEditMapping={canEditMapping}
      onEditMapping={handleEditMapping}
      onClearAll={handleClearAll}
      onCatalog={() => setCatalogOpen(true)}
    />
  )
}
