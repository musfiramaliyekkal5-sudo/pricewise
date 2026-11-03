import { buildMatchKey, normalizeIdentifiers } from "../matching.js";

const MAX_FEED_BYTES = 2_000_000;
const MAX_AGE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;

function isAllowedHost(hostname, allowedDomains) {
  const host = hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const allowed = domain.toLowerCase().replace(/^\*\./, "");
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

function safeHttpsUrl(value, domains) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (domains && !isAllowedHost(url.hostname, domains)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function errorKind(error) {
  if (error?.name === "AbortError" || error?.httpStatus >= 500) return "unavailable";
  if (error?.httpStatus === 401 || error?.httpStatus === 403) return "approval";
  if (/fetch failed|network|ENOTFOUND|ECONN|EAI_AGAIN/i.test(error?.message || "")) return "unavailable";
  return "error";
}

function safeText(value, limit = 300) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : null;
}

function sourceNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return Number.NaN;
  if (typeof value === "string" && !value.trim()) return Number.NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

async function readLimitedBody(response) {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_FEED_BYTES) {
      throw new Error("Feed response exceeds the 2 MB limit");
    }
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
      if (size > MAX_FEED_BYTES) {
        await reader.cancel();
        throw new Error("Feed response exceeds the 2 MB limit");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

function validTimestamp(value) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeListing(entry, feed, collectedAt) {
  if (!entry || typeof entry !== "object" || !entry.product || !entry.offer) return null;
  const { product, offer } = entry;
  const price = sourceNumber(offer.price);
  const productUrl = safeHttpsUrl(offer.productUrl, feed.retailerDomains);
  const imageUrl = safeHttpsUrl(product.imageUrl);
  const retailer = safeText(offer.retailer, 100);
  const updatedAt = validTimestamp(offer.updatedAt || entry.updatedAt);
  const feedUpdatedAt = validTimestamp(entry.feedUpdatedAt);
  if (!Number.isFinite(price) || price <= 0 || !productUrl || !retailer || !safeText(product.title)) return null;
  if (String(offer.currency || "").toUpperCase() !== "INR") return null;

  const identifiers = normalizeIdentifiers(product.identifiers);
  const variant = product.variant && typeof product.variant === "object" && !Array.isArray(product.variant)
    ? Object.fromEntries(
      Object.entries(product.variant)
        .filter(([, value]) => typeof value === "string" || typeof value === "number")
        .map(([key, value]) => [key, String(value).trim()])
        .filter(([, value]) => value),
    )
    : safeText(product.variant);
  const sourceProductId = safeText(product.id, 200);
  const matchKey = buildMatchKey({
    sourceId: feed.id,
    productId: sourceProductId,
    identifiers,
    matchKey: product.matchKey,
    variant,
  });
  if (!matchKey) return null;
  const mrp = sourceNumber(offer.mrp);
  const offerPrice = sourceNumber(offer.offerPrice);
  const shipping = sourceNumber(offer.shipping);
  const imageUrls = Array.isArray(product.imageUrls)
    ? product.imageUrls.map((url) => safeHttpsUrl(url)).filter(Boolean).slice(0, 8)
    : [];
  const availability = safeText(offer.availability, 100);
  const retailerUrl = new URL(productUrl).hostname.toLowerCase();

  return {
    matchKey,
    product: {
      id: sourceProductId || matchKey,
      title: safeText(product.title),
      brand: safeText(product.brand, 100),
      category: safeText(product.category, 100),
      subcategory: safeText(product.subcategory, 100),
      variant,
      identifiers,
      imageUrl,
      imageUrls,
      imageUnavailable: !imageUrl,
    },
    offer: {
      id: `${feed.id}:${sourceProductId || matchKey}:${retailer}`,
      sourceId: feed.id,
      sourceName: feed.name,
      retailerId: feed.retailerId,
      retailer,
      price,
      mrp: Number.isFinite(mrp) && mrp >= price ? mrp : null,
      offerPrice: Number.isFinite(offerPrice) && offerPrice > 0 ? offerPrice : null,
      shipping: Number.isFinite(shipping) && shipping >= 0 ? shipping : null,
      coupon: safeText(offer.coupon, 200),
      promotion: safeText(offer.promotion, 300),
      cashback: typeof offer.cashback === "number" && Number.isFinite(offer.cashback) && offer.cashback >= 0
        ? offer.cashback
        : safeText(offer.cashback, 200),
      deliveryEstimate: safeText(offer.deliveryEstimate, 100),
      availability,
      productUrl,
      retailerHost: retailerUrl,
      updatedAt,
      feedUpdatedAt,
      collectedAt,
    },
  };
}

export class JsonFeedAdapter {
  constructor(definition, env = process.env) {
    this.definition = {
      id: safeText(definition.id, 100),
      name: safeText(definition.name, 100),
      retailerId: safeText(definition.retailerId, 100),
      retailerName: safeText(definition.retailerName, 100),
      endpoint: safeHttpsUrl(definition.endpoint),
      retailerDomains: Array.isArray(definition.retailerDomains)
        ? definition.retailerDomains.filter((domain) => typeof domain === "string")
        : [],
      authEnv: safeText(definition.authEnv, 100),
      requestIntervalMs: Number.isFinite(Number(definition.requestIntervalMs))
        ? Math.max(0, Math.min(120_000, Number(definition.requestIntervalMs)))
        : 1_000,
    };
    this.env = env;
    this.cache = new Map();
    this.inflight = new Map();
    this.lastError = null;
    this.lastErrorKind = null;
    this.lastCheckedAt = null;
    this.nextRequestAt = 0;
  }

  get configured() {
    return Boolean(
      this.definition.id
      && this.definition.name
      && this.definition.endpoint
      && this.definition.retailerDomains.length,
    );
  }

  async search(query) {
    if (!this.configured) return [];
    const needle = query.toLocaleLowerCase();
    const cached = this.cache.get(needle);
    if (cached && Date.now() - cached.cachedAt <= MAX_AGE_MS) return cached.listings;
    const pending = this.inflight.get(needle);
    if (pending) return pending;
    const request = this.refresh(query, needle);
    this.inflight.set(needle, request);
    try {
      return await request;
    } finally {
      this.inflight.delete(needle);
    }
  }

  async refresh(query, needle) {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextRequestAt - now);
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + this.definition.requestIntervalMs;
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.lastErrorKind = null;
    const endpoint = new URL(this.definition.endpoint);
    if (query) endpoint.searchParams.set("q", query);
    const headers = { Accept: "application/json" };
    if (this.definition.authEnv) {
      const token = this.env[this.definition.authEnv];
      if (!token) {
        this.lastError = `Required credential environment variable "${this.definition.authEnv}" is not set`;
        this.lastErrorKind = "credentials";
        throw new Error(this.lastError);
      }
      headers.Authorization = `Bearer ${token}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        headers,
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        const error = new Error(`Feed responded with HTTP ${response.status}`);
        error.httpStatus = response.status;
        throw error;
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
        throw new Error("Feed response exceeds the 2 MB limit");
      }
      const body = await readLimitedBody(response);
      const payload = JSON.parse(body);
      if (!payload || !Array.isArray(payload.listings)) {
        throw new Error("Feed response must contain a listings array");
      }
      const collectedAt = new Date().toISOString();
      const listings = payload.listings
        .slice(0, 500)
        .map((entry) => normalizeListing(
          { ...entry, feedUpdatedAt: entry.feedUpdatedAt || payload.updatedAt },
          this.definition,
          collectedAt,
        ))
        .filter(Boolean);
      const filtered = needle
        ? listings.filter(({ product, offer }) => [
          product.title,
          product.brand,
          product.category,
          product.subcategory,
          product.identifiers.gtin,
          product.identifiers.ean,
          product.identifiers.mpn,
          offer.retailer,
        ].some((value) => value?.toLocaleLowerCase().includes(needle)))
        : listings;
      this.lastCheckedAt = new Date().toISOString();
      this.cache.set(needle, { listings: filtered, cachedAt: Date.now() });
      for (const [key, entry] of this.cache) {
        if (Date.now() - entry.cachedAt > MAX_AGE_MS) this.cache.delete(key);
      }
      if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value);
      this.lastError = null;
      this.lastErrorKind = null;
      return filtered;
    } catch (error) {
      this.cache.delete(needle);
      this.lastError = error.name === "AbortError"
        ? "The authorized feed timed out."
        : error.message;
      if (this.lastErrorKind !== "credentials") this.lastErrorKind = errorKind(error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  status() {
    return {
      id: this.definition.id,
      name: this.definition.name,
      retailerId: this.definition.retailerId,
      configured: this.configured,
      checkedAt: this.lastCheckedAt,
      available: this.lastCheckedAt ? !this.lastError : null,
      errorKind: this.configured ? this.lastErrorKind : "credentials",
      error: this.lastError ? "Feed unavailable; check server logs." : null,
    };
  }
}

export function parseFeedDefinitions(value, env = process.env) {
  if (!value || value.trim() === "" || value.trim() === "[]") return [];
  const definitions = JSON.parse(value);
  if (!Array.isArray(definitions)) throw new Error("PRICEWISE_FEEDS must be a JSON array");
  return definitions.map((definition) => new JsonFeedAdapter(definition, env));
}
