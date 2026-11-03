const OUT_OF_STOCK_PATTERN = /out[_ -]?of[_ -]?stock|unavailable|sold[_ -]?out|not available/i;
const IN_STOCK_PATTERN = /^(in[_ -]?stock|available|in stock)$/i;
const OFFER_TYPES = new Set(["discount", "regular", "coupon", "cashback", "price-drop"]);
const STOCK_FILTERS = new Set(["verified", "in", "out", "unknown"]);
const SORTS = new Set(["relevance", "price-asc", "price-desc", "discount", "name", "updated", "verified"]);

export const FILTER_OPTIONS = {
  offerTypes: [...OFFER_TYPES],
  stock: [...STOCK_FILTERS],
  sorts: [...SORTS],
};

export function isInStock(offer) {
  return IN_STOCK_PATTERN.test(String(offer.availability || "").trim());
}

export function isOutOfStock(offer) {
  return OUT_OF_STOCK_PATTERN.test(String(offer.availability || ""));
}

export function discountPercent(offer) {
  const price = Number(offer?.price);
  const mrp = Number(offer?.mrp);
  if (!Number.isFinite(price) || !Number.isFinite(mrp)) return 0;
  if (mrp <= price || price <= 0) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

export function offerTotal(offer) {
  const price = Number(offer?.price);
  const shipping = Number(offer?.shipping);
  if (!Number.isFinite(price)) return Number.POSITIVE_INFINITY;
  return price + (Number.isFinite(shipping) && shipping >= 0 ? shipping : 0);
}

function byPriceThenRetailer(left, right) {
  const priceDifference = offerTotal(left) - offerTotal(right);
  if (priceDifference) return priceDifference;
  return String(left.retailer || "").localeCompare(String(right.retailer || ""));
}

function decorateOffer(offer) {
  const discount = discountPercent(offer);
  return {
    ...offer,
    discountPercent: discount,
    isDiscounted: discount > 0,
    isOutOfStock: isOutOfStock(offer),
    isInStock: isInStock(offer),
    totalCost: Number.isFinite(Number(offer.shipping)) ? Number(offer.price) + Number(offer.shipping) : null,
  };
}

export function decorateProduct(item) {
  const offers = (item.offers || []).map(decorateOffer);
  const sorted = [...offers].sort((left, right) => {
    if (left.isVerifiedAvailable !== right.isVerifiedAvailable) return left.isVerifiedAvailable ? -1 : 1;
    if (left.isOutOfStock !== right.isOutOfStock) return left.isOutOfStock ? 1 : -1;
    return byPriceThenRetailer(left, right);
  });
  const verified = sorted.filter((offer) => offer.isVerifiedAvailable && !offer.isOutOfStock);
  const available = sorted.filter((offer) => !offer.isOutOfStock);
  const lowest = available.length ? [...available].sort(byPriceThenRetailer)[0] : sorted[0] || null;
  const cheapestVerified = verified.length ? [...verified].sort(byPriceThenRetailer)[0] : null;
  const bestOffer = cheapestVerified || lowest || null;
  return {
    ...item,
    offers: sorted,
    cheapestOfferId: bestOffer?.id || null,
    lowestOfferId: lowest?.id || null,
    priceRange: offers.length
      ? {
          min: Math.min(...offers.map((offer) => offer.price)),
          max: Math.max(...offers.map((offer) => offer.price)),
        }
      : null,
    lowestPrice: offers.length ? Math.min(...offers.map((offer) => offer.price)) : null,
    maxDiscountPercent: offers.reduce((max, offer) => Math.max(max, offer.discountPercent), 0),
    hasDiscount: offers.some((offer) => offer.isDiscounted),
    hasCoupon: offers.some((offer) => Boolean(offer.coupon)),
    hasCashback: offers.some((offer) => Boolean(offer.cashback)),
    hasPriceDrop: offers.some((offer) => Number(offer.priceDrop) > 0),
    verifiedOfferCount: verified.length,
    outOfStockCount: offers.filter((offer) => offer.isOutOfStock).length,
    offerCount: offers.length,
  };
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeFilters(input = {}) {
  const offerType = OFFER_TYPES.has(input.offerType) ? input.offerType : "";
  const stock = STOCK_FILTERS.has(input.stock) ? input.stock : "";
  const sort = SORTS.has(input.sort) ? input.sort : "relevance";
  return {
    category: typeof input.category === "string" ? input.category.trim().slice(0, 120) : "",
    brand: typeof input.brand === "string" ? input.brand.trim().slice(0, 120) : "",
    retailer: typeof input.retailer === "string" ? input.retailer.trim().slice(0, 120) : "",
    minPrice: finiteNumber(input.minPrice),
    maxPrice: finiteNumber(input.maxPrice),
    minDiscount: finiteNumber(input.minDiscount),
    offerType,
    stock,
    available: input.available === true && stock !== "in",
    sort,
    page: Math.max(1, Math.floor(finiteNumber(input.page) || 1)),
    pageSize: Math.min(250, Math.max(1, Math.floor(finiteNumber(input.pageSize) || 24))),
  };
}

function offerMatches(offer, filters) {
  if (filters.retailer && offer.retailer !== filters.retailer) return false;
  if (filters.minPrice !== null && offer.price < filters.minPrice) return false;
  if (filters.maxPrice !== null && offer.price > filters.maxPrice) return false;
  const discount = offer.discountPercent ?? discountPercent(offer);
  if (filters.minDiscount !== null && discount < filters.minDiscount) return false;
  if (filters.offerType === "discount" && !discount) return false;
  if (filters.offerType === "regular" && discount) return false;
  if (filters.offerType === "coupon" && !offer.coupon) return false;
  if (filters.offerType === "cashback" && !offer.cashback) return false;
  if (filters.offerType === "price-drop" && !(Number(offer.priceDrop) > 0)) return false;
  if (filters.stock === "verified" && !offer.isVerifiedAvailable) return false;
  if (filters.stock === "in" && !isInStock(offer)) return false;
  if (filters.stock === "out" && !isOutOfStock(offer)) return false;
  if (filters.stock === "unknown" && (offer.isVerifiedAvailable || isOutOfStock(offer))) return false;
  if (filters.available && !offer.isVerifiedAvailable) return false;
  return true;
}

export function filterProducts(products, input = {}) {
  const filters = normalizeFilters(input);
  const offerLevelFilter = Boolean(
    filters.retailer
    || filters.minPrice !== null
    || filters.maxPrice !== null
    || filters.minDiscount !== null
    || filters.offerType
    || filters.stock
    || filters.available,
  );
  const result = [];
  for (const item of products) {
    if (filters.category && item.product.category !== filters.category) continue;
    if (filters.brand && item.product.brand !== filters.brand) continue;
    if (!offerLevelFilter) {
      result.push(item);
      continue;
    }
    const offers = item.offers.filter((offer) => offerMatches(offer, filters));
    if (!offers.length) continue;
    result.push(decorateProduct({ ...item, offers }));
  }
  return result;
}

function lowestOfferPrice(item) {
  return item.lowestPrice ?? Math.min(...item.offers.map((offer) => offer.price));
}

function bestDiscount(item) {
  return item.maxDiscountPercent ?? Math.max(...item.offers.map((offer) => discountPercent(offer)));
}

function latestOfferTime(item) {
  return Math.max(0, ...item.offers.map((offer) => Date.parse(offer.updatedAt || offer.feedUpdatedAt || 0) || 0));
}

export function sortProducts(products, sort = "relevance") {
  const result = [...products];
  if (sort === "price-asc") result.sort((left, right) => lowestOfferPrice(left) - lowestOfferPrice(right));
  else if (sort === "price-desc") result.sort((left, right) => lowestOfferPrice(right) - lowestOfferPrice(left));
  else if (sort === "discount") result.sort((left, right) => bestDiscount(right) - bestDiscount(left));
  else if (sort === "name") result.sort((left, right) => left.product.title.localeCompare(right.product.title));
  else if (sort === "updated") result.sort((left, right) => latestOfferTime(right) - latestOfferTime(left));
  else if (sort === "verified") {
    result.sort((left, right) => {
      if (left.verifiedOfferCount !== right.verifiedOfferCount) return right.verifiedOfferCount - left.verifiedOfferCount;
      return lowestOfferPrice(left) - lowestOfferPrice(right);
    });
  }
  return result;
}

export function paginateProducts(products, page = 1, pageSize = 24) {
  const currentPage = Math.max(1, page);
  const size = Math.min(250, Math.max(1, pageSize));
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  return {
    products: products.slice(start, start + size),
    pagination: {
      page: safePage,
      pageSize: size,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
  };
}

export function computeFacets(products) {
  const categories = new Map();
  const brands = new Map();
  const retailers = new Map();
  for (const item of products) {
    const category = item.product.category;
    if (category) categories.set(category, (categories.get(category) || 0) + 1);
    const brand = item.product.brand;
    if (brand) brands.set(brand, (brands.get(brand) || 0) + 1);
    for (const offer of item.offers) {
      if (offer.retailer) retailers.set(offer.retailer, (retailers.get(offer.retailer) || 0) + 1);
    }
  }
  const toObject = (map) => Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
  return {
    categories: [...categories.keys()].sort((left, right) => left.localeCompare(right)),
    brands: [...brands.keys()].sort((left, right) => left.localeCompare(right)),
    retailers: [...retailers.keys()].sort((left, right) => left.localeCompare(right)),
    categoryCounts: toObject(categories),
    brandCounts: toObject(brands),
    retailerCounts: toObject(retailers),
  };
}

export function selectDeals(products, { mode = "demo", type = "all" } = {}) {
  const dealType = OFFER_TYPES.has(type) ? type : "all";
  const deals = [];
  for (const item of products) {
    const offers = item.offers.filter((offer) => {
      if (mode === "live" && !offer.isVerifiedAvailable) return false;
      if (dealType === "discount") return offer.discountPercent > 0;
      if (dealType === "coupon") return Boolean(offer.coupon);
      if (dealType === "cashback") return Boolean(offer.cashback);
      if (dealType === "regular") return offer.discountPercent === 0;
      if (dealType === "price-drop") return Number(offer.priceDrop) > 0;
      return offer.discountPercent > 0 || offer.coupon || offer.cashback || Number(offer.priceDrop) > 0;
    });
    if (!offers.length) continue;
    deals.push(decorateProduct({ ...item, offers }));
  }
  return deals.sort((left, right) => {
    const discountDifference = right.maxDiscountPercent - left.maxDiscountPercent;
    if (discountDifference) return discountDifference;
    return lowestOfferPrice(left) - lowestOfferPrice(right);
  });
}
