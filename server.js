import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { configuredConnectors, createConnectors } from "./src/integrations/index.js";
import {
  computeFacets,
  decorateProduct,
  filterProducts,
  normalizeFilters,
  paginateProducts,
  selectDeals,
  sortProducts,
} from "./src/catalog.js";
import { getRetailerStatuses, getRetailerSummary } from "./src/retailers.js";
import { createCatalogStore } from "./src/store.js";
import { DEMO_PRODUCTS, searchDemoProducts } from "./src/demo-catalog.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};
const MAX_REQUESTS_PER_MINUTE = 120;
const requestCounts = new Map();
const allFeeds = createConnectors(process.env);
const feeds = configuredConnectors(allFeeds);
const configuredFeeds = feeds;
const demoEnabled = /^(1|true|yes)$/i.test(process.env.PRICEWISE_DEMO || "");
const dataMode = configuredFeeds.length ? "live" : demoEnabled ? "demo" : "unconfigured";
const MAX_QUERY_LENGTH = 120;
const MAX_BODY_AGE_MS = 24 * 60 * 60 * 1000;
const OBSERVATION_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const refreshInput = Number.parseInt(process.env.PRICEWISE_REFRESH_MINUTES || "30", 10);
const REFRESH_MINUTES = Number.isFinite(refreshInput) ? Math.max(0, Math.min(1440, refreshInput)) : 30;

const databasePath = path.resolve(ROOT, process.env.PRICEWISE_DB || "./data/pricewise.sqlite");
await mkdir(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS price_observations (
    id INTEGER PRIMARY KEY,
    product_key TEXT NOT NULL,
    title TEXT NOT NULL,
    retailer TEXT NOT NULL,
    source_id TEXT NOT NULL,
    price REAL NOT NULL,
    observed_at TEXT NOT NULL,
    source_updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_price_observations_product_time
    ON price_observations(product_key, observed_at);
  CREATE INDEX IF NOT EXISTS idx_price_observations_product_retailer
    ON price_observations(product_key, retailer, observed_at);
`);
const saveObservation = db.prepare(`
  INSERT INTO price_observations
    (product_key, title, retailer, source_id, price, observed_at, source_updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const latestObservation = db.prepare(`
  SELECT price, observed_at
  FROM price_observations
  WHERE product_key = ? AND retailer = ?
  ORDER BY observed_at DESC
  LIMIT 1
`);
const readHistory = db.prepare(`
  SELECT retailer, price, observed_at, source_updated_at
  FROM price_observations
  WHERE product_key = ? AND observed_at >= ?
  ORDER BY observed_at ASC
  LIMIT 1000
`);
const historyStats = db.prepare(`
  SELECT MIN(price) AS lowest, MAX(price) AS highest, COUNT(*) AS count
  FROM price_observations
  WHERE product_key = ? AND observed_at >= ?
`);
const catalogStore = createCatalogStore(db);
const deleteOldHistory = db.prepare("DELETE FROM price_observations WHERE observed_at < ?");
const pruneHistory = () => {
  const retentionCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  deleteOldHistory.run(retentionCutoff);
};
pruneHistory();
const historyCleanup = setInterval(pruneHistory, 24 * 60 * 60 * 1000);
historyCleanup.unref();

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https: data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
}

function isRateLimited(request) {
  const now = Date.now();
  const address = request.socket.remoteAddress || "unknown";
  const state = requestCounts.get(address);
  if (!state || now >= state.resetAt) {
    requestCounts.set(address, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  state.count += 1;
  return state.count > MAX_REQUESTS_PER_MINUTE;
}

function stringParam(url, name, maxLength = MAX_QUERY_LENGTH) {
  const value = url.searchParams.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function numberParam(url, name) {
  const value = url.searchParams.get(name);
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function filtersFromUrl(url) {
  return normalizeFilters({
    category: stringParam(url, "category"),
    brand: stringParam(url, "brand"),
    retailer: stringParam(url, "retailer"),
    minPrice: numberParam(url, "minPrice"),
    maxPrice: numberParam(url, "maxPrice"),
    minDiscount: numberParam(url, "minDiscount"),
    offerType: stringParam(url, "offerType", 30),
    stock: stringParam(url, "stock", 30),
    available: url.searchParams.get("available") === "true",
    sort: stringParam(url, "sort", 30),
    page: numberParam(url, "page"),
    pageSize: numberParam(url, "pageSize"),
  });
}

function isVerifiedStock(offer) {
  const timestamp = offer.updatedAt || offer.feedUpdatedAt || offer.collectedAt;
  const age = timestamp ? Date.now() - Date.parse(timestamp) : Number.POSITIVE_INFINITY;
  const inStock = /^(in[_ -]?stock|available|in stock)$/i.test(offer.availability || "");
  return inStock && age >= 0 && age <= MAX_BODY_AGE_MS;
}

function persistListings(listings) {
  try {
    catalogStore.saveListings(listings);
  } catch (error) {
    console.error(`[PriceWise] Central catalogue write failed: ${error.message}`);
  }
}

async function collectProducts(query = "") {
  if (dataMode === "demo") {
    return {
      products: searchDemoProducts(query).map((item) => decorateProduct(item)),
      sources: [],
      demoProductCount: DEMO_PRODUCTS.length,
    };
  }
  if (!feeds.length) {
    return { products: [], sources: [], demoProductCount: 0 };
  }

  const results = await Promise.all(feeds.map(async (feed) => {
    try {
      return await feed.search(query);
    } catch (error) {
      console.error(`[PriceWise] Feed "${feed.status().name}" failed: ${error.message}`);
      return [];
    }
  }));

  persistListings(results.flat());
  const groups = new Map();
  for (const listing of results.flat()) {
    const offer = {
      ...listing.offer,
      isVerifiedAvailable: isVerifiedStock(listing.offer),
    };

    try {
      const previous = latestObservation.get(listing.matchKey, offer.retailer);
      if (previous && Number.isFinite(previous.price) && previous.price > offer.price) {
        offer.previousPrice = previous.price;
        offer.priceDrop = previous.price - offer.price;
        offer.priceDropSince = previous.observed_at;
      }
      const observedTime = previous ? Date.parse(previous.observed_at) : Number.NaN;
      const shouldStore = !previous
        || previous.price !== offer.price
        || !Number.isFinite(observedTime)
        || Date.now() - observedTime >= OBSERVATION_MIN_INTERVAL_MS;
      if (shouldStore) {
        saveObservation.run(
          listing.matchKey,
          listing.product.title,
          offer.retailer,
          offer.sourceId,
          offer.price,
          offer.collectedAt,
          offer.updatedAt || offer.feedUpdatedAt,
        );
      }
    } catch (error) {
      console.error(`[PriceWise] Price history write failed: ${error.message}`);
    }

    let group = groups.get(listing.matchKey);
    if (!group) {
      group = { key: listing.matchKey, matchKey: listing.matchKey, product: listing.product, offers: [] };
      groups.set(listing.matchKey, group);
    }
    group.offers.push(offer);
  }

  const products = [...groups.values()]
    .map((group) => decorateProduct(group))
    .sort((left, right) => {
      const leftPrice = left.lowestPrice ?? Number.POSITIVE_INFINITY;
      const rightPrice = right.lowestPrice ?? Number.POSITIVE_INFINITY;
      if (leftPrice !== rightPrice) return leftPrice - rightPrice;
      return left.product.title.localeCompare(right.product.title);
    });

  return { products, sources: feeds.map((feed) => feed.status()), demoProductCount: 0 };
}

function publicSearchPayload(products, filters, sources, extra = {}) {
  const facets = computeFacets(products);
  const searched = sortProducts(filterProducts(products, filters), filters.sort);
  const paged = paginateProducts(searched, filters.page, filters.pageSize);
  return {
    mode: dataMode,
    disclosure: dataMode === "live"
      ? "Live mode: offers are returned by the configured authorised retailer feeds. Confirm the final price on the retailer's page."
      : dataMode === "demo"
        ? "DEMO DATA — Not live prices. These are sample products for interface development only; they have no real retailer identity, purchase link or verified stock."
        : "No live retailer feed is configured. Add your Flipkart Affiliate API credentials to show real products and prices.",
    products: paged.products,
    facets,
    sources,
    pagination: paged.pagination,
    retrievedAt: new Date().toISOString(),
    ...extra,
  };
}

function findProduct(products, key) {
  return products.find((item) => item.key === key || item.matchKey === key) || null;
}

function historyPayload(key) {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const observations = readHistory.all(key, since);
  const stats = historyStats.get(key, since);
  return {
    key,
    observations,
    observationCount: Number(stats?.count || 0),
    lowestRecordedPrice: stats?.lowest ?? null,
    highestRecordedPrice: stats?.highest ?? null,
    since,
    disclosure: "History is built only from verified observations recorded by this PriceWise installation. No historical prices are invented.",
  };
}

function decodeKey(value) {
  try {
    return decodeURIComponent(value).slice(0, 500);
  } catch {
    return "";
  }
}

async function handleApi(request, response, url) {
  if ((url.pathname === "/api/status" || url.pathname === "/api/health") && request.method === "GET") {
    jsonResponse(response, 200, {
      ok: true,
      mode: dataMode,
      configuredFeeds: configuredFeeds.length,
      demoProducts: dataMode === "demo" ? DEMO_PRODUCTS.length : 0,
      retailers: getRetailerSummary(allFeeds),
      feeds: allFeeds.map((feed) => feed.status()),
      database: catalogStore.stats(),
      refreshMinutes: REFRESH_MINUTES,
      setupRequired: dataMode === "unconfigured" ? ["FLIPKART_AFFILIATE_ID", "FLIPKART_AFFILIATE_TOKEN"] : [],
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/api/retailers" && request.method === "GET") {
    const { products } = await collectProducts("");
    const facets = computeFacets(products);
    const statuses = getRetailerStatuses(allFeeds);
    jsonResponse(response, 200, {
      mode: dataMode,
      values: facets.retailers,
      counts: facets.retailerCounts,
      summary: getRetailerSummary(allFeeds),
      retailers: statuses,
      sources: allFeeds.map((feed) => feed.status()),
      database: catalogStore.stats(),
    });
    return;
  }

  if (["/api/categories", "/api/brands"].includes(url.pathname) && request.method === "GET") {
    const { products } = await collectProducts("");
    const facets = computeFacets(products);
    const key = url.pathname.slice("/api/".length);
    jsonResponse(response, 200, {
      mode: dataMode,
      values: key === "categories" ? facets.categories : facets.brands,
      counts: key === "categories" ? facets.categoryCounts : facets.brandCounts,
      facets,
    });
    return;
  }

  if (url.pathname === "/api/deals" && request.method === "GET") {
    const filters = filtersFromUrl(url);
    const { products, sources } = await collectProducts("");
    const type = stringParam(url, "type", 30) || "all";
    const deals = selectDeals(products, { mode: dataMode, type });
    const paged = paginateProducts(deals, filters.page, filters.pageSize);
    jsonResponse(response, 200, {
      mode: dataMode,
      disclosure: dataMode === "live"
        ? "Deals include recently verified in-stock offers with source-provided discounts, coupons, cashback, or recorded price drops."
        : dataMode === "demo"
          ? "DEMO DATA — Not live prices. Sample deals are illustrative only and cannot be purchased."
          : "No live retailer feed is configured. Add your Flipkart Affiliate API credentials to show real products and prices.",
      type,
      products: paged.products,
      facets: computeFacets(deals),
      sources,
      pagination: paged.pagination,
      retrievedAt: new Date().toISOString(),
    });
    return;
  }

  if ((url.pathname === "/api/search" || url.pathname === "/api/products") && request.method === "GET") {
    const query = stringParam(url, "q");
    const filters = filtersFromUrl(url);
    const { products, sources } = await collectProducts(query);
    jsonResponse(response, 200, publicSearchPayload(products, filters, sources, {
      query,
      filters: {
        category: filters.category,
        brand: filters.brand,
        retailer: filters.retailer,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minDiscount: filters.minDiscount,
        offerType: filters.offerType,
        stock: filters.stock,
        sort: filters.sort,
      },
    }));
    return;
  }

  if (url.pathname.startsWith("/api/products/")) {
    const remainder = url.pathname.slice("/api/products/".length);
    const offersSuffix = remainder.endsWith("/offers");
    const encodedKey = offersSuffix ? remainder.slice(0, -"/offers".length) : remainder;
    const key = decodeKey(encodedKey);
    if (!key) {
      jsonResponse(response, 400, { error: "A valid product key is required." });
      return;
    }
    const query = stringParam(url, "q");
    let { products, sources } = await collectProducts(query);
    let product = findProduct(products, key);
    if (!product && query) {
      const fallback = await collectProducts("");
      products = fallback.products;
      sources = fallback.sources;
      product = findProduct(products, key);
    }
    if (!product) {
      jsonResponse(response, 404, {
        error: "That exact product was not returned by the active data sources.",
        mode: dataMode,
      });
      return;
    }
    if (request.method !== "GET") {
      jsonResponse(response, 405, { error: "Method not allowed." });
      return;
    }
    if (offersSuffix) {
      jsonResponse(response, 200, {
        mode: dataMode,
        key: product.key,
        product: product.product,
        offers: product.offers,
        sources,
        retrievedAt: new Date().toISOString(),
      });
      return;
    }
    jsonResponse(response, 200, {
      mode: dataMode,
      product,
      sources,
      retrievedAt: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/api/history" && request.method === "GET") {
    const key = stringParam(url, "key", 500);
    if (!key) {
      jsonResponse(response, 400, { error: "A valid product key is required." });
      return;
    }
    jsonResponse(response, 200, historyPayload(key));
    return;
  }

  if (url.pathname.startsWith("/api/price-history/") && request.method === "GET") {
    const key = decodeKey(url.pathname.slice("/api/price-history/".length));
    if (!key) {
      jsonResponse(response, 400, { error: "A valid product key is required." });
      return;
    }
    jsonResponse(response, 200, historyPayload(key));
    return;
  }

  jsonResponse(response, 404, { error: "API endpoint not found." });
}

async function serveStatic(request, response, url) {
  const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const resolvedPath = path.resolve(PUBLIC, `.${relativePath}`);
  if (!resolvedPath.startsWith(`${PUBLIC}${path.sep}`) && resolvedPath !== PUBLIC) {
    jsonResponse(response, 403, { error: "Forbidden." });
    return;
  }
  try {
    const body = await readFile(resolvedPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(resolvedPath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT" && !path.extname(url.pathname)) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await readFile(path.join(PUBLIC, "index.html")));
      return;
    }
    jsonResponse(response, 404, { error: "File not found." });
  }
}

const server = createServer(async (request, response) => {
  securityHeaders(response);
  if (isRateLimited(request)) {
    jsonResponse(response, 429, { error: "Too many requests. Please try again shortly." });
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response, url);
    } else {
      jsonResponse(response, 405, { error: "Method not allowed." });
    }
  } catch (error) {
    console.error(`[PriceWise] Request failed: ${error.message}`);
    if (!response.headersSent) {
      jsonResponse(response, 500, { error: "The request could not be completed." });
    } else {
      response.end();
    }
  }
});

async function runScheduledRefresh() {
  if (!feeds.length) return;
  try {
    const { products } = await collectProducts("");
    console.log(`[PriceWise] Scheduled refresh stored ${products.length} grouped product${products.length === 1 ? "" : "s"}.`);
  } catch (error) {
    console.error(`[PriceWise] Scheduled refresh failed: ${error.message}`);
  }
}

let refreshTimer = null;
let initialRefresh = null;
if (feeds.length && REFRESH_MINUTES > 0) {
  initialRefresh = setTimeout(() => { void runScheduledRefresh(); }, 5_000);
  initialRefresh.unref();
  refreshTimer = setInterval(() => { void runScheduledRefresh(); }, REFRESH_MINUTES * 60_000);
  refreshTimer.unref();
}

const port = Number.parseInt(process.env.PORT || "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const host = process.env.HOST || "127.0.0.1";
let activePort = port;
for (let attempt = 0; attempt <= 20; attempt += 1) {
  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(activePort, host);
    });
    break;
  } catch (error) {
    if (error.code !== "EADDRINUSE" || attempt === 20 || activePort === 65535) {
      throw new Error(`Could not start PriceWise on ${host}:${activePort}. ${error.message}`);
    }
    activePort += 1;
  }
}

if (activePort !== port) {
  console.warn(`Port ${port} is already in use; PriceWise selected the next available port.`);
}
console.log(`PriceWise is running at http://localhost:${activePort}`);
if (dataMode === "live") {
  console.log(`Live mode: ${configuredFeeds.length} authorised feed${configuredFeeds.length === 1 ? "" : "s"} configured.`);
} else if (dataMode === "demo") {
  console.log(`DEMO mode: showing ${DEMO_PRODUCTS.length} clearly labelled sample products. Demo prices are not live or purchasable.`);
} else {
  console.log("Setup required: add FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN to .env to show real Flipkart prices.");
}

function close() {
  clearInterval(historyCleanup);
  if (refreshTimer) clearInterval(refreshTimer);
  if (initialRefresh) clearTimeout(initialRefresh);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
