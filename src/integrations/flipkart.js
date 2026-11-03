import { buildMatchKey } from "../matching.js";

const SEARCH_ENDPOINT = "https://affiliate-api.flipkart.net/affiliate/1.0/search.json";
const MAX_RESULTS = 10;
const MAX_BODY_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_MS = 60_000;
const MIN_REQUEST_INTERVAL_MS = 100;
const DEFAULT_QUERIES = ["mobile", "laptop", "shoes", "skincare", "earbuds", "fashion"];
const FLIPKART_IMAGE_HOSTS = ["fkcdn.com", "flixcart.com", "flipkart.com"];

function safeText(value, limit = 300) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

function errorKind(error) {
  if (error?.name === "AbortError" || error?.httpStatus >= 500) return "unavailable";
  if (error?.httpStatus === 401 || error?.httpStatus === 403) return "approval";
  if (/fetch failed|network|ENOTFOUND|ECONN|EAI_AGAIN/i.test(error?.message || "")) return "unavailable";
  return "error";
}

function safeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function amountOf(money) {
  const amount = safeNumber(money?.amount);
  if (amount === null || amount < 0) return null;
  if (money?.currency && String(money.currency).toUpperCase() !== "INR") return null;
  return amount;
}

function hostAllowed(hostname, allowedHosts) {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function secureSourceUrl(value, allowedHosts) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (!hostAllowed(url.hostname, allowedHosts)) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

function pickImages(imageUrls) {
  if (!imageUrls || typeof imageUrls !== "object" || Array.isArray(imageUrls)) return [];
  return Object.entries(imageUrls)
    .map(([label, value]) => {
      const url = secureSourceUrl(value, FLIPKART_IMAGE_HOSTS);
      const match = /^(\d+)x(\d+)$/.exec(label);
      const area = match ? Number(match[1]) * Number(match[2]) : 0;
      return { url, area };
    })
    .filter(({ url }) => Boolean(url))
    .sort((left, right) => right.area - left.area)
    .map(({ url }) => url)
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, 8);
}

function parseCategoryPath(value) {
  if (typeof value !== "string" || !value.trim()) return { category: "Flipkart", subcategory: null };
  try {
    const parsed = JSON.parse(value);
    const nodes = [];
    const visit = (entry) => {
      if (Array.isArray(entry)) {
        entry.forEach(visit);
      } else if (entry && typeof entry === "object") {
        if (typeof entry.node_name === "string") nodes.push(entry.node_name.trim());
        else if (typeof entry.title === "string") {
          entry.title.split(">").forEach((part) => nodes.push(part.trim()));
        }
      }
    };
    visit(parsed);
    const names = nodes.filter((name) => name && name !== "FLIPKART_TREE");
    return {
      category: names[0] || "Flipkart",
      subcategory: names.length > 1 ? names.at(-1) : null,
    };
  } catch {
    return { category: "Flipkart", subcategory: null };
  }
}

function variantOf(base) {
  const attributes = base.attributes && typeof base.attributes === "object" ? base.attributes : {};
  const variant = {};
  for (const key of ["size", "color", "storage", "displaySize", "sizeUnit"]) {
    const value = safeText(attributes[key], 80);
    if (value) variant[key] = value;
  }
  return variant;
}

function promotionText(offers) {
  if (!Array.isArray(offers) || !offers.length) return null;
  const text = offers
    .map((offer) => {
      if (typeof offer === "string") return offer;
      if (offer && typeof offer === "object") {
        return [offer.title, offer.description].filter(Boolean).join(": ");
      }
      return "";
    })
    .filter(Boolean)
    .join(" · ");
  return safeText(text, 400);
}

function normalizeListing(entry, collectedAt) {
  const base = entry?.productBaseInfoV1 || entry?.productBaseInfo?.productAttributes;
  if (!base || typeof base !== "object") return null;
  const productId = safeText(base.productId, 100);
  const title = safeText(base.title, 300);
  const productUrl = secureSourceUrl(base.productUrl, ["flipkart.com"]);
  const sellingPrice = amountOf(base.flipkartSellingPrice);
  const specialPrice = amountOf(base.flipkartSpecialPrice);
  const price = specialPrice !== null && specialPrice > 0 ? specialPrice : sellingPrice;
  if (!productId || !title || !productUrl || price === null || price <= 0) return null;

  const mrp = amountOf(base.maximumRetailPrice);
  const shipping = amountOf(entry?.productShippingInfoV1?.shippingCharges);
  const images = pickImages(base.imageUrls);
  const variant = variantOf(base);
  const { category, subcategory } = parseCategoryPath(base.categoryPath || base.categoryPaths);
  const styleCode = safeText(base.styleCode, 100);
  const identifiers = { flipkartProductId: productId };
  if (styleCode) identifiers.styleCode = styleCode;
  const availability = base.inStock === true
    ? "in stock"
    : base.isAvailable === false
      ? "unavailable"
      : "out of stock";
  const cashback = typeof base.cashBack === "number" && Number.isFinite(base.cashBack) && base.cashBack >= 0
    ? base.cashBack
    : safeText(base.cashBack, 200);
  const matchKey = buildMatchKey({
    sourceId: "flipkart",
    productId,
    identifiers,
    variant,
  });

  return {
    matchKey,
    product: {
      id: productId,
      title,
      brand: safeText(base.productBrand, 100),
      category,
      subcategory,
      variant,
      identifiers,
      imageUrl: images[0] || null,
      imageUrls: images,
      imageUnavailable: !images.length,
    },
    offer: {
      id: `flipkart:${productId}`,
      sourceId: "flipkart",
      sourceName: "Flipkart Affiliate API",
      retailerId: "flipkart",
      retailer: "Flipkart",
      price,
      mrp: mrp !== null && mrp >= price ? mrp : null,
      offerPrice: specialPrice !== null && specialPrice > 0 && sellingPrice !== null && specialPrice < sellingPrice
        ? specialPrice
        : null,
      shipping: shipping !== null ? shipping : null,
      coupon: null,
      promotion: promotionText(base.offers),
      cashback: cashback ?? null,
      deliveryEstimate: null,
      availability,
      productUrl,
      retailerHost: new URL(productUrl).hostname.toLowerCase(),
      updatedAt: null,
      feedUpdatedAt: null,
      collectedAt,
    },
  };
}

function parseDefaultQueries(value) {
  const source = typeof value === "string" && value.trim() ? value : DEFAULT_QUERIES.join(",");
  return source
    .split(",")
    .map((query) => query.trim().slice(0, 60))
    .filter(Boolean)
    .filter((query, index, list) => list.indexOf(query) === index)
    .slice(0, 12);
}

async function readLimitedBody(response) {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error("Flipkart response exceeds the 2 MB limit");
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Flipkart response exceeds the 2 MB limit");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

export class FlipkartAffiliateAdapter {
  constructor(options = {}, env = process.env) {
    this.trackingId = safeText(options.trackingId ?? env.FLIPKART_AFFILIATE_ID, 100);
    this.token = safeText(options.token ?? env.FLIPKART_AFFILIATE_TOKEN, 200);
    this.defaultQueries = parseDefaultQueries(options.defaultQueries ?? env.FLIPKART_DEFAULT_QUERIES);
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.cache = new Map();
    this.inflight = new Map();
    this.lastError = null;
    this.lastErrorKind = null;
    this.lastCheckedAt = null;
    this.nextRequestAt = 0;
    this.definition = {
      id: "flipkart",
      name: "Flipkart Affiliate API",
      retailerId: "flipkart",
      retailerDomains: ["flipkart.com"],
    };
  }

  get configured() {
    return Boolean(this.trackingId && this.token);
  }

  async waitForSlot() {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextRequestAt - now);
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + MIN_REQUEST_INTERVAL_MS;
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  async fetchQuery(query) {
    await this.waitForSlot();
    const endpoint = new URL(SEARCH_ENDPOINT);
    endpoint.searchParams.set("query", query);
    endpoint.searchParams.set("resultCount", String(MAX_RESULTS));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(endpoint, {
        headers: {
          Accept: "application/json",
          "Fk-Affiliate-Id": this.trackingId,
          "Fk-Affiliate-Token": this.token,
        },
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        const error = new Error(`Flipkart responded with HTTP ${response.status}`);
        error.httpStatus = response.status;
        throw error;
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        throw new Error("Flipkart response exceeds the 2 MB limit");
      }
      const payload = JSON.parse(await readLimitedBody(response));
      if (!payload || !Array.isArray(payload.productInfoList)) {
        throw new Error("Flipkart response did not contain a productInfoList array");
      }
      const collectedAt = new Date().toISOString();
      this.lastCheckedAt = collectedAt;
      this.lastError = null;
      this.lastErrorKind = null;
      return payload.productInfoList
        .slice(0, MAX_RESULTS)
        .map((entry) => normalizeListing(entry, collectedAt))
        .filter(Boolean);
    } catch (error) {
      this.lastError = error.name === "AbortError" ? "Flipkart request timed out." : error.message;
      this.lastErrorKind = errorKind(error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async search(query = "") {
    if (!this.configured) return [];
    const needle = String(query).trim().slice(0, 120);
    const cacheKey = needle || "__default_queries__";
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt <= CACHE_MS) return cached.listings;
    const pending = this.inflight.get(cacheKey);
    if (pending) return pending;
    const request = (async () => {
      if (needle) {
        const listings = await this.fetchQuery(needle);
        this.cache.set(cacheKey, { listings, cachedAt: Date.now() });
        return listings;
      }
      const results = await Promise.allSettled(this.defaultQueries.map((value) => this.fetchQuery(value)));
      const listings = [];
      const seen = new Set();
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const listing of result.value) {
          if (seen.has(listing.matchKey)) continue;
          seen.add(listing.matchKey);
          listings.push(listing);
        }
      }
      if (!listings.length) {
        const failure = results.find((result) => result.status === "rejected");
        if (failure) throw failure.reason;
      }
      this.cache.set(cacheKey, { listings, cachedAt: Date.now() });
      return listings;
    })();
    this.inflight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  status() {
    return {
      id: "flipkart",
      name: "Flipkart Affiliate API",
      retailerId: "flipkart",
      configured: this.configured,
      checkedAt: this.lastCheckedAt,
      available: this.lastCheckedAt ? !this.lastError : null,
      errorKind: this.configured ? this.lastErrorKind : "credentials",
      error: this.configured
        ? this.lastError
          ? "Flipkart feed unavailable; check server logs."
          : null
        : "Add FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN to enable live Flipkart prices.",
    };
  }
}

export function createFlipkartFeed(env = process.env) {
  return new FlipkartAffiliateAdapter({}, env);
}
