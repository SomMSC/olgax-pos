/**
 * PGLite singleton — browser-embedded Postgres stored in IndexedDB.
 * Used for offline-capable reads/writes in the POS.
 *
 * Import this only in client components or hooks (never in server code).
 */

import type { PGlite } from "@electric-sql/pglite";

let instance: PGlite | null = null;
let initPromise: Promise<PGlite> | null = null;

export async function getPGlite(): Promise<PGlite> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamic import keeps the heavy WASM out of the server bundle
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite("idb://olgax-pos");

    // Bootstrap local schema (sync_queue + products cache)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id         SERIAL PRIMARY KEY,
        endpoint   TEXT    NOT NULL,
        method     TEXT    NOT NULL DEFAULT 'POST',
        payload    JSONB   NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attempts   INT     NOT NULL DEFAULT 0,
        synced     BOOLEAN NOT NULL DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS products_cache (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        sku         TEXT,
        barcode     TEXT,
        price       NUMERIC NOT NULL,
        stock       INT  NOT NULL DEFAULT 0,
        category    TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    instance = db;
    return db;
  })();

  return initPromise;
}

/** Enqueue an offline write to be replayed when back online. */
export async function enqueueOfflineWrite(
  endpoint: string,
  method: string,
  payload: unknown
): Promise<void> {
  const db = await getPGlite();
  await db.query(
    `INSERT INTO sync_queue (endpoint, method, payload) VALUES ($1, $2, $3)`,
    [endpoint, method, JSON.stringify(payload)]
  );
}

/** Return all pending (unsynced) items in the queue. */
export async function getPendingQueue(): Promise<
  { id: number; endpoint: string; method: string; payload: unknown }[]
> {
  const db = await getPGlite();
  const result = await db.query<{
    id: number;
    endpoint: string;
    method: string;
    payload: unknown;
  }>(
    `SELECT id, endpoint, method, payload FROM sync_queue WHERE synced = FALSE ORDER BY id ASC`
  );
  return result.rows;
}

/** Mark a queued item as synced. */
export async function markSynced(id: number): Promise<void> {
  const db = await getPGlite();
  await db.query(`UPDATE sync_queue SET synced = TRUE WHERE id = $1`, [id]);
}

/** Upsert a product into the local cache (used when seeding from server). */
export async function upsertProductCache(product: {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price: number;
  stock: number;
  category?: string | null;
}): Promise<void> {
  const db = await getPGlite();
  await db.query(
    `INSERT INTO products_cache (id, name, sku, barcode, price, stock, category, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       sku  = EXCLUDED.sku,
       barcode = EXCLUDED.barcode,
       price = EXCLUDED.price,
       stock = EXCLUDED.stock,
       category = EXCLUDED.category,
       updated_at = NOW()`,
    [
      product.id,
      product.name,
      product.sku ?? null,
      product.barcode ?? null,
      product.price,
      product.stock,
      product.category ?? null,
    ]
  );
}

/** Search the local product cache (offline fallback). */
export async function searchProductsOffline(query: string): Promise<
  {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    price: number;
    stock: number;
    category: string | null;
  }[]
> {
  const db = await getPGlite();
  const like = `%${query.toLowerCase()}%`;
  const result = await db.query<{
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    price: number;
    stock: number;
    category: string | null;
  }>(
    `SELECT id, name, sku, barcode, price, stock, category
     FROM products_cache
     WHERE LOWER(name) LIKE $1
        OR LOWER(COALESCE(sku, '')) LIKE $1
        OR LOWER(COALESCE(barcode, '')) LIKE $1
     LIMIT 20`,
    [like]
  );
  return result.rows;
}
