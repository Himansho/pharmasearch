# PharmaSearch · Pharmacy Tools

This PWA now has two local-first workflows:

- **Medicine catalog:** search by brand or salt/generic name, tolerate small typos, filter to in-stock products, see same-salt alternatives, and boost popular brands. Import a supplier CSV/Excel file through the column-mapping wizard.
- **Expiry audit:** import a POS stock/expiry report, review month-based expiry buckets, mark shelf status, and export return reports.

Both workflows use IndexedDB. No inventory file or product data is uploaded by this build.

## Catalog data shape

The catalog import needs `Brand` and `Salt` (or `Generic`) columns. Optional columns are `Stock`, `Price`/`MRP`, `Strength`, `Form`, `Category`, `Manufacturer`, `Famous`, and `Synonyms`. Duplicate rows with the same brand, salt, strength, form, and manufacturer are merged and their stock is added.

The catalog is deliberately local and deterministic in v1. It does not call Gemini, Google Search, or any other LLM/API at runtime. That keeps counter search private and usable offline; remote sync, multi-user authentication, and WordPress webhooks should be added only when a backend and a pharmacy-level security model are ready.

## Installable PWA

Production builds include `manifest.webmanifest` and a service worker that caches the app shell. Serve `dist/` over HTTPS (or localhost) to install it from the browser. Catalog records are held in IndexedDB, so the most recently imported catalog remains searchable offline.

## Download

[Download version 1.0](https://github.com/Himansho/pharmasearch/releases/tag/v1.0.0) · [Open the live PWA](https://pharmasearch-nine.vercel.app)

PharmaSearch is a mobile-responsive, local-first PWA for searching a pharmacy medicine catalog. It also includes a secondary expiry-audit workflow for POS stock reports.

- **Import** a `.xlsx` / `.xls` / `.csv` stock report — parsed entirely in the browser
  (SheetJS); the file never leaves the device.
- **Map columns once** — a flexible mapper handles varying Marg report layouts and
  remembers the mapping per device.
- **Expiry buckets** — Expired · This Month · Next Month · Next 3/6/12 Months ·
  Beyond 12 Months, plus a Needs Review list for unreadable expiry values.
  Month-granular only (medicine expiry is `MM/YY`); never a day count.
- **Shelf audit** — persistent search, one-tap Pending / Checked / Removed marking,
  saved instantly to IndexedDB.
- **Reports** — full audit report and a "Return to Distributor" list (Removed items
  with batch, quantity and PTR value) as CSV or Excel.
- **Re-import friendly** — weekly refreshes match items by Item Name + Batch No,
  updating quantity/expiry while preserving audit statuses.

## Stack

React 19 + TypeScript + Vite, SheetJS (`xlsx`) for Excel/CSV, Dexie (IndexedDB) for
local persistence. No backend — deployable to any static host.

## Develop

```bash
npm install
npm run dev       # local dev server
npm test          # unit tests (expiry parsing, buckets, import merge, mapping)
npm run build     # type-check + production build (dist/)
npm run preview   # serve the production build
```

## Data & privacy

All data (imported items, statuses, column mapping) lives in the browser's IndexedDB
on the device. Clearing browser data or switching devices loses it — exporting a
report is the backup mechanism in v1, by design.
