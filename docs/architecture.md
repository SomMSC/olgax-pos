# Architecture

A technical overview of how Olgax POS is built.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Application Routes](#application-routes)
- [Data Model](#data-model)
- [Authentication Flow](#authentication-flow)
- [Offline Architecture](#offline-architecture)
- [Caching Strategy](#caching-strategy)

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | TypeScript strict, Turbopack in dev |
| UI Components | shadcn/ui | Radix primitives + Tailwind CSS 4 |
| Styling | Tailwind CSS 4 | CSS variables for theming |
| ORM | Prisma 7 | `@prisma/client` + `PrismaPg` adapter |
| Database | PostgreSQL ≥ 14 | Managed via Docker Compose |
| Offline DB | PGLite (Postgres WASM) | Runs in the browser, syncs to server |
| Auth | Better Auth 1.x | Email/password, role-based, cookie sessions |
| POS State | Zustand | Cart, held orders |
| Forms | react-hook-form + Zod | Client-side validation |
| Testing | Vitest + Playwright | Unit tests + E2E |
| Package manager | pnpm | Workspace-ready |

---

## Project Structure

```
olgax-pos/
├── docs/                        # ← Public documentation (you are here)
├── plugins/                     # Plugin folder (see PLUGIN_AUTHORING.md)
├── prisma/
│   ├── schema.prisma            # Database schema
│   ├── migrations/              # SQL migration history
│   └── seed.ts                  # Sample data seed script
├── public/
│   ├── icons/                   # PWA icons
│   ├── uploads/                 # User-uploaded images (logo, products)
│   └── manifest.json            # PWA manifest
├── src/
│   ├── app/
│   │   ├── (app)/               # Authenticated app shell
│   │   │   ├── layout.tsx       # App layout (sidebar, session guard)
│   │   │   ├── pos/             # POS checkout screen
│   │   │   ├── products/        # Product catalog (list, new, [id], [id]/edit)
│   │   │   ├── customers/       # Customer directory (list, [id] profile)
│   │   │   ├── suppliers/       # Supplier management
│   │   │   ├── sales/           # Sales history
│   │   │   ├── reports/         # Reports & analytics
│   │   │   └── settings/        # Business settings
│   │   ├── (auth)/
│   │   │   └── login/           # Login page (white theme, password toggle)
│   │   ├── setup/               # First-run setup wizard (white theme)
│   │   └── api/
│   │       ├── auth/            # Better Auth handler ([...all]/route.ts)
│   │       ├── customers/       # Customer CRUD + merge + duplicates
│   │       ├── held-orders/     # Hold & recall order queue
│   │       ├── loyalty/         # Loyalty points ledger
│   │       ├── products/search/ # Product search (name/SKU/barcode)
│   │       ├── reports/         # Aggregated sales reports
│   │       ├── sales/           # Sale create + history + export + refund
│   │       ├── settings/        # Business settings read/write
│   │       ├── setup/           # Setup wizard API routes
│   │       ├── stock-adjustments/ # Manual stock adjustment log
│   │       ├── suppliers/       # Supplier CRUD
│   │       └── upload/          # Image upload (logo, product photos)
│   ├── components/
│   │   ├── layout/              # AppSidebar, SyncStatusBadge
│   │   ├── pos/                 # Cart, ProductGrid, HeldOrdersModal, etc.
│   │   ├── products/            # ProductTable, ProductForm, StockAdjustButton
│   │   ├── receipt/             # ReceiptModal, thermal ESC/POS printer
│   │   ├── sales/               # SalesTable, SalesExportButton
│   │   ├── reports/             # ReportsSummary
│   │   ├── settings/            # SettingsForm, DeviceSettingsForm
│   │   ├── setup/               # SetupWizard multi-step form
│   │   └── ui/                  # Generic primitives (Breadcrumb, skeleton, etc.)
│   ├── hooks/
│   │   └── use-online-status.ts # Detects online/offline + triggers sync
│   ├── lib/
│   │   ├── auth.ts              # Better Auth server config
│   │   ├── auth-client.ts       # Better Auth browser client
│   │   ├── db.ts                # Prisma client singleton
│   │   ├── pglite.ts            # PGLite browser DB + offline queue
│   │   ├── plugins.ts           # Plugin registry + hook emitter
│   │   ├── sync.ts              # Offline → server sync logic
│   │   └── utils.ts             # formatCurrency, cn(), etc.
│   ├── store/
│   │   └── cart.ts              # Zustand cart store
│   ├── proxy.ts                 # Edge route guard (auth + setup cookies)
│   └── types/                   # Shared TypeScript types
├── messages/                    # i18n translation files (one per locale)
└── src/tests/                   # Vitest unit tests + Playwright E2E specs
```

---

## Application Routes

### Page Routes

| Route | Access | Description |
|---|---|---|
| `/` | Public | Redirects to `/pos` |
| `/login` | Public (unauthenticated only) | Email/password login |
| `/setup` | Public (pre-setup only) | First-run setup wizard |
| `/pos` | Admin + Cashier | POS checkout screen |
| `/products` | Admin only | Product catalog list |
| `/products/new` | Admin only | Create product form |
| `/products/[id]` | Admin only | Product detail + stock adjustment history |
| `/products/[id]/edit` | Admin only | Edit product form |
| `/customers` | Admin only | Customer directory |
| `/customers/[id]` | Admin only | Customer profile + purchase history |
| `/suppliers` | Admin only | Supplier list & management |
| `/sales` | Admin + Cashier | Sales history table |
| `/reports` | Admin only | Summary reports |
| `/settings` | Admin only | Business settings form |

### API Routes

| Route | Methods | Description |
|---|---|---|
| `/api/auth/[...all]` | All | Better Auth handler |
| `/api/products/search` | GET | Product search by name/SKU/barcode |
| `/api/sales` | GET, POST | List sales + create sale |
| `/api/sales/export` | GET | Export sales as CSV |
| `/api/sales/[id]/refund` | POST | Full or partial refund on a sale |
| `/api/customers` | GET, POST | List + create customers |
| `/api/customers/[id]` | GET, PUT, DELETE | Customer detail, update, delete |
| `/api/customers/duplicates` | GET | Find duplicate customer records |
| `/api/customers/merge` | POST | Merge duplicate customers |
| `/api/suppliers` | GET, POST | List + create suppliers |
| `/api/suppliers/[id]` | GET, PUT, DELETE | Supplier detail, update, delete |
| `/api/held-orders` | GET, POST, DELETE | Hold-order queue |
| `/api/loyalty` | POST | Update loyalty points for a customer |
| `/api/stock-adjustments` | GET, POST | Stock adjustment history + manual adjust |
| `/api/settings` | GET, PUT | Business settings (public read, admin write) |
| `/api/upload` | POST | Image upload (logo, product photos) |
| `/api/reports` | GET | Aggregated sales report data |
| `/api/ping` | GET | Health-check / DB connectivity probe |
| `/api/setup/status` | GET | DB + setup status probe |
| `/api/setup/migrate` | POST | Run Prisma migrations |
| `/api/setup/admin` | POST | Create first admin account |
| `/api/setup/complete` | POST | Finalize setup, set cookie |

---

## Data Model

Key models defined in `prisma/schema.prisma`:

### `Product`
```
id, name, sku, barcode, price (Decimal), cost (Decimal),
stock, lowStockThreshold, category, imageUrl, active,
supplierId (FK → Supplier), createdAt, updatedAt
```

### `Supplier`
```
id, name, email, phone, address, notes, createdAt, updatedAt
+ products: Product[]
```

### `Sale`
```
id, receiptNumber, status (COMPLETED | VOIDED | REFUNDED),
subtotal, taxAmount, discountAmount, tipAmount, total,
paymentMethod (CASH | CARD | OTHER), paymentLines (JSON — split tender),
amountTendered, changeDue, notes,
userId (FK → User), customerId (FK → Customer, optional),
loyaltyPointsUsed, createdAt
+ items: SaleItem[]
```

### `SaleItem`
```
id, saleId, productId (nullable), name (snapshot), sku (snapshot),
quantity, price (at time of sale), total, notes
```

### `StockAdjustment`
```
id, productId (FK → Product), userId (FK → User),
delta (positive = add, negative = remove),
reason (RECEIVED | DAMAGED | THEFT | CORRECTION | OPENING_COUNT),
note, createdAt
```

### `Customer`
```
id, name, email, phone, notes,
loyaltyPoints, createdAt, updatedAt
+ sales: Sale[]
```

### `HeldOrder`
```
id, label, items (JSON — cart snapshot), createdAt
```

### `BusinessSettings` (singleton — id = "singleton")
```
businessName, logoUrl, primaryColor, accentColor,
currency, currencyDecimals, taxRate, taxName,
receiptFooter, language, setupComplete,
loyaltyEnabled, loyaltyEarnRate, loyaltyRedeemValue, loyaltyMaxRedeemPercent
```

### `User` (managed by Better Auth)
```
id, name, email, emailVerified, image,
role (ADMIN | CASHIER), createdAt, updatedAt
```

---

## Authentication Flow

1. User submits credentials on `/login`.
2. `signIn.email()` (Better Auth client) sends `POST /api/auth/sign-in/email`.
3. Better Auth validates credentials, creates a session in the `Session` table, and sets an `httpOnly` session cookie.
4. Browser performs a hard navigation to `/pos` (via `window.location.href`) to ensure the cookie is captured.
5. `src/proxy.ts` (Edge runtime route guard) runs on every request and checks for the session cookie. If absent → redirect to `/login`.
6. Server Components call `auth.api.getSession({ headers })` for full session/user data when needed.

**Roles:**
- `ADMIN` — full access including settings, reports, product management.
- `CASHIER` — POS and own sales history only. Attempts to access admin-only routes redirect to `/pos`.

---

## Offline Architecture

Olgax POS uses **PGLite** — a full Postgres database compiled to WebAssembly — running entirely in the browser.

```
Browser
  ├── PGLite (IndexedDB-backed Postgres WASM)
  │     ├── products cache
  │     └── offline_queue table (pending writes)
  └── sync.ts
        └── on `window.online` → replay queue → POST to server API
```

When the device goes offline:
1. New sales are written to PGLite's `offline_queue`.
2. The `SyncStatusBadge` shows **"Offline"**.

When the device comes back online:
1. `useOnlineStatus` hook detects the `online` event.
2. `replayOfflineQueue()` replays each queued write to the server API.
3. Status transitions: `syncing` → `synced` (or `error`).

---

## Caching Strategy

Next.js caching is aggressively opted-out for all data-fetching pages to ensure fresh data on every navigation:

```typescript
// Applied to every page and layout that fetches data:
export const dynamic = "force-dynamic";

export default async function Page() {
  noStore(); // from "next/cache" — busts prefetch cache too
  // ...fetch data
}
```

Additionally, sidebar `<Link>` components use `prefetch={false}` to prevent Next.js from pre-loading stale RSC payloads for authenticated pages.

The router cache is disabled globally via `next.config.ts`:

```typescript
experimental: {
  staleTimes: { dynamic: 0 },
},
```
