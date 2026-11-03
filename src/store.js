import { primaryIdentifier } from "./matching.js";

function jsonValue(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function text(value, limit = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createCatalogStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_products (
      product_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      subcategory TEXT,
      variant_json TEXT NOT NULL DEFAULT '{}',
      identifiers_json TEXT NOT NULL DEFAULT '{}',
      primary_identifier_key TEXT,
      primary_identifier_value TEXT,
      image_url TEXT,
      image_urls_json TEXT NOT NULL DEFAULT '[]',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_offers (
      offer_id TEXT PRIMARY KEY,
      product_key TEXT NOT NULL,
      retailer_id TEXT,
      retailer_name TEXT NOT NULL,
      product_url TEXT NOT NULL,
      current_price REAL NOT NULL,
      original_price REAL,
      offer_price REAL,
      shipping REAL,
      availability TEXT,
      last_updated_at TEXT,
      observed_at TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT,
      data_source TEXT NOT NULL,
      coupon TEXT,
      cashback TEXT,
      promotion TEXT,
      delivery_estimate TEXT,
      is_sample INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_offers_product
      ON catalog_offers(product_key, current_price);
    CREATE INDEX IF NOT EXISTS idx_catalog_offers_retailer
      ON catalog_offers(retailer_id, last_updated_at);
    CREATE INDEX IF NOT EXISTS idx_catalog_offers_source
      ON catalog_offers(source_id, observed_at);
  `);

  const upsertProduct = db.prepare(`
    INSERT INTO catalog_products (
      product_key, title, brand, category, subcategory, variant_json, identifiers_json,
      primary_identifier_key, primary_identifier_value, image_url, image_urls_json,
      first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_key) DO UPDATE SET
      title = excluded.title,
      brand = excluded.brand,
      category = excluded.category,
      subcategory = excluded.subcategory,
      variant_json = excluded.variant_json,
      identifiers_json = excluded.identifiers_json,
      primary_identifier_key = excluded.primary_identifier_key,
      primary_identifier_value = excluded.primary_identifier_value,
      image_url = excluded.image_url,
      image_urls_json = excluded.image_urls_json,
      last_seen_at = excluded.last_seen_at
  `);

  const upsertOffer = db.prepare(`
    INSERT INTO catalog_offers (
      offer_id, product_key, retailer_id, retailer_name, product_url, current_price,
      original_price, offer_price, shipping, availability, last_updated_at, observed_at,
      source_id, source_name, data_source, coupon, cashback, promotion, delivery_estimate,
      is_sample, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(offer_id) DO UPDATE SET
      product_key = excluded.product_key,
      retailer_id = excluded.retailer_id,
      retailer_name = excluded.retailer_name,
      product_url = excluded.product_url,
      current_price = excluded.current_price,
      original_price = excluded.original_price,
      offer_price = excluded.offer_price,
      shipping = excluded.shipping,
      availability = excluded.availability,
      last_updated_at = excluded.last_updated_at,
      observed_at = excluded.observed_at,
      source_id = excluded.source_id,
      source_name = excluded.source_name,
      data_source = excluded.data_source,
      coupon = excluded.coupon,
      cashback = excluded.cashback,
      promotion = excluded.promotion,
      delivery_estimate = excluded.delivery_estimate,
      is_sample = excluded.is_sample,
      last_seen_at = excluded.last_seen_at
  `);

  const productCount = db.prepare("SELECT COUNT(*) AS count FROM catalog_products");
  const offerCount = db.prepare("SELECT COUNT(*) AS count FROM catalog_offers");
  const latestSync = db.prepare("SELECT MAX(last_seen_at) AS value FROM catalog_offers");

  function saveListings(listings = []) {
    const savedAt = new Date().toISOString();
    let saved = 0;
    db.exec("BEGIN");
    try {
      for (const listing of listings) {
        const product = listing?.product;
        const offer = listing?.offer;
        const productKey = text(listing?.matchKey || listing?.key, 500);
        const title = text(product?.title, 300);
        const price = number(offer?.price);
        const productUrl = text(offer?.productUrl, 2048);
        if (!productKey || !title || price === null || price <= 0 || !productUrl || offer?.isSampleData) continue;
        const identifiers = product.identifiers && typeof product.identifiers === "object" ? product.identifiers : {};
        const primary = primaryIdentifier(identifiers);
        const offerId = text(offer.id, 500) || `${offer.sourceId || "source"}:${productKey}:${offer.retailer}`;
        const sourceId = text(offer.sourceId, 100) || "unknown";
        const sourceName = text(offer.sourceName, 150) || sourceId;
        const observedAt = text(offer.collectedAt, 100) || savedAt;
        const lastUpdatedAt = text(offer.updatedAt || offer.feedUpdatedAt, 100) || observedAt;

        upsertProduct.run(
          productKey,
          title,
          text(product.brand, 100),
          text(product.category, 100),
          text(product.subcategory, 100),
          jsonValue(product.variant, {}),
          jsonValue(identifiers, {}),
          primary?.key || null,
          primary?.value || null,
          text(product.imageUrl, 2048),
          jsonValue(Array.isArray(product.imageUrls) ? product.imageUrls.slice(0, 8) : [], []),
          savedAt,
          savedAt,
        );

        upsertOffer.run(
          offerId,
          productKey,
          text(offer.retailerId, 100),
          text(offer.retailer, 100) || sourceName,
          productUrl,
          price,
          number(offer.mrp),
          number(offer.offerPrice),
          number(offer.shipping),
          text(offer.availability, 100),
          lastUpdatedAt,
          observedAt,
          sourceId,
          sourceName,
          sourceName,
          text(offer.coupon, 200),
          typeof offer.cashback === "number" ? String(offer.cashback) : text(offer.cashback, 200),
          text(offer.promotion, 400),
          text(offer.deliveryEstimate, 100),
          offer.isSampleData ? 1 : 0,
          savedAt,
        );
        saved += 1;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return saved;
  }

  function stats() {
    return {
      products: Number(productCount.get()?.count || 0),
      offers: Number(offerCount.get()?.count || 0),
      lastSyncAt: latestSync.get()?.value || null,
    };
  }

  return { saveListings, stats };
}
