# PharmaSearch PWA — implementation PRD (v2)

## Decision

The supplied research report combines two different products: a local pharmacy tool and a multi-user cloud catalog. This implementation makes the local catalog the first shippable slice and keeps the existing expiry audit available in the same PWA.

The app must be useful with no network after the first load. Product data is stored in IndexedDB, not in a service-worker cache. The service worker caches only the application shell.

## v1 user promise

Given a supplier/POS export, a pharmacist can:

1. map Brand and Salt/Generic columns once;
2. search by brand, generic salt, alias, or a small typo;
3. filter to products with stock greater than zero;
4. see deterministic ranking with admin-marked popular brands first;
5. open alternatives that share the same normalized salt; and
6. continue searching the last imported catalog offline.

No result is medical advice. This is an inventory/availability lookup only.

## v1 data contract

Required: `brand`, `salt`.

Optional: `stock`, `price`, `strength`, `form`, `category`, `manufacturer`, `famous`, `synonyms`.

The product identity is `brand + salt + strength + form + manufacturer`, after normalization. Duplicate import rows merge and add stock. A stock value of zero is different from an unknown stock value; unknown stock is not advertised as in stock.

Every import is a full replacement of the catalog. The import summary reports imported, merged, and skipped rows so an accidental empty/malformed export is visible before it replaces data.

## Search behavior

- Exact, prefix, substring, alias, and bounded edit-distance matches are supported.
- Brand matches score above salt matches.
- `famous` adds a deterministic boost; in-stock status is a tie-breaker.
- Results are capped at 100 in the UI to keep low-end phones responsive.
- The UI never claims that a product is available when stock is null.

## Offline and privacy requirements

- The production build includes a manifest and service worker.
- The service worker uses stale app-shell caching and an offline fallback; it does not try to cache a million-record search index.
- IndexedDB schema version 2 stores catalog products alongside expiry items and migrates existing v1 users.
- No product data, supplier file, API key, or search query leaves the browser in v1.
- Users must export/retain their source report; clearing browser storage loses local catalog and audit data.

## Deliberately deferred

DOC/DOCX parsing, WordPress/WooCommerce webhooks, multi-user accounts, remote sync, tenant isolation, audit logs, server-side MeiliSearch/Elastic, and runtime LLM calls are phase 2. They require a backend security model, a backup strategy, rate limits, and an explicit decision about what inventory data may leave the pharmacy.

Gemini/Google Search is not a runtime dependency. LLMs are unnecessary for exact inventory lookup and would add latency, cost, and privacy ambiguity. If synonym generation is later added, it must be an admin-only, opt-in job with a paid/private data policy and human review.

## Phase 2 gates

Before adding cloud sync, define a `shopId`, immutable product/import IDs, source version, `updatedAt`, batch/location stock semantics, conflict resolution, retention/backup, admin authentication with secure HttpOnly cookies + CSRF protection, upload limits, server-side parsing, and an audit trail. Do not store WordPress credentials or JWTs in the PWA.

## Acceptance checks

- A fresh build opens at `/` and installs from an HTTPS/static host.
- Existing expiry audit imports and tests remain green.
- A sample catalog import creates seven products and merges duplicate rows.
- `paracetmol` finds the paracetamol products; stock-only hides zero-stock products.
- Toggling Popular persists after reload.
- Turning off the network after import still allows catalog search and expiry-dashboard navigation.

