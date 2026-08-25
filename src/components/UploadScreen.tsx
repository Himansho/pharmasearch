import { useRef, useState, type DragEvent } from 'react'

interface UploadScreenProps {
  onFile: (file: File) => void
  onSample: () => void
  onBack: (() => void) | null
  error: string | null
  busy: boolean
  onCatalog: () => void
}

export function UploadScreen({ onFile, onSample, onBack, error, busy, onCatalog }: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className="screen">
      {onBack && (
        <button type="button" className="link-back" onClick={onBack}>
          ← Back to dashboard
        </button>
      )}

      <header className="hero">
        <p className="eyebrow">PHARMASEARCH</p>
        <h1>Pharmacy tools</h1>
        <p>
          Search your medicine catalog offline, or import a stock report for a focused expiry audit.
        </p>
      </header>

      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <p className="dropzone-title">
          {busy ? 'Reading file…' : 'Drop your stock report here'}
        </p>
        <p className="dropzone-sub">Excel (.xlsx, .xls) or CSV — e.g. Marg&apos;s Expiry Stock report</p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="btn btn-ghost" onClick={onSample} disabled={busy}>
        Try with sample data
      </button>

      <div className="catalog-entry">
        <div><strong>Medicine catalog</strong><p>Search by brand or generic salt, even offline.</p></div>
        <button type="button" className="btn btn-primary" onClick={onCatalog}>Open catalog</button>
      </div>

      <ol className="steps">
        <li>
          <strong>Export</strong> the Batch Stock / Expiry Stock report from Marg (or your POS)
          as Excel.
        </li>
        <li>
          <strong>Upload</strong> it here and confirm the columns — a one-time setup.
        </li>
        <li>
          <strong>Audit</strong> the shelf with expiry buckets and search, marking each item as
          you go.
        </li>
        <li>
          <strong>Export</strong> your report and the return-to-distributor list.
        </li>
      </ol>

      <p className="privacy-note">
        <strong>Private by design:</strong> your file is read entirely in this browser and never
        uploaded anywhere. Data stays on this device only — clearing browser data or switching
        devices will lose it, so export a report as your backup.
      </p>
    </div>
  )
}
