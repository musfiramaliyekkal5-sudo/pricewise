const state = {
  products: [],
  facets: { categories: [], brands: [], retailers: [], categoryCounts: {}, brandCounts: {}, retailerCounts: {} },
  mode: "unconfigured",
  sources: [],
  route: "home",
  query: "",
  category: "",
  visibleCount: 12,
  dataLoaded: false,
  savedKeys: readStorage("pricewise:saved", []),
  recentKeys: readStorage("pricewise:recent", []),
  filters: defaultFilters(),
  toastTimer: null,
};

const elements = {
  home: document.querySelector("#home-view"),
  homeExtras: document.querySelector("#home-extras"),
  results: document.querySelector("#results-view"),
  detail: document.querySelector("#detail-view"),
  retailers: document.querySelector("#retailers-view"),
  about: document.querySelector("#about-view"),
  legal: document.querySelector("#legal-view"),
  banner: document.querySelector("#data-mode-banner"),
  searchInput: document.querySelector("#search-input"),
  resultSearchInput: document.querySelector("#results-search-input"),
  form: document.querySelector("#search-form"),
  resultsForm: document.querySelector("#results-search-form"),
  grid: document.querySelector("#product-grid"),
  resultStatus: document.querySelector("#result-status"),
  resultsTitle: document.querySelector("#results-title"),
  resultsSummary: document.querySelector("#results-summary"),
  resultsEyebrow: document.querySelector("#results-eyebrow"),
  empty: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyCopy: document.querySelector("#empty-copy"),
  loadMore: document.querySelector("#load-more"),
  toast: document.querySelector("#toast"),
  heroSpotlight: document.querySelector("#hero-spotlight"),
  homeCategories: document.querySelector("#home-categories"),
  homeCategoryGrid: document.querySelector("#home-category-grid"),
  homeDeals: document.querySelector("#home-deals"),
  homeTrending: document.querySelector("#home-trending"),
  homeRetailers: document.querySelector("#home-retailers"),
  categoriesNote: document.querySelector("#categories-note"),
  recentNote: document.querySelector("#recent-note"),
  detailContent: document.querySelector("#detail-content"),
  retailersContent: document.querySelector("#retailers-content"),
  retailersSummary: document.querySelector("#retailers-summary"),
};

const priceFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const shortDateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
document.querySelector("#year").textContent = new Date().getFullYear();

function defaultFilters() {
  return {
    category: "",
    brand: "",
    retailer: "",
    minPrice: null,
    maxPrice: null,
    minDiscount: null,
    offerType: "",
    stock: "",
    available: false,
    sort: "relevance",
  };
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Your browser could not save this change.");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? priceFormatter.format(number) : "Unavailable";
}

function formatDate(value, withTime = true) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return (withTime ? dateFormatter : shortDateFormatter).format(date);
}

function safeUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function variantText(product) {
  const variant = product.variant;
  if (!variant) return "";
  if (typeof variant === "string") return variant;
  return Object.entries(variant)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function discountPercent(offer) {
  const price = Number(offer?.price);
  const mrp = Number(offer?.mrp);
  if (!Number.isFinite(price) || !Number.isFinite(mrp) || mrp <= price || price <= 0) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

function isOutOfStock(offer) {
  return /out[_ -]?of[_ -]?stock|unavailable|sold[_ -]?out|not available/i.test(offer?.availability || "");
}

function isInStock(offer) {
  return /^(in[_ -]?stock|available|in stock)$/i.test(String(offer?.availability || "").trim());
}

function hasKnownShipping(offer) {
  return Number.isFinite(Number(offer?.shipping)) && Number(offer.shipping) >= 0;
}

function totalCost(offer) {
  const price = Number(offer?.price);
  if (!Number.isFinite(price)) return Number.POSITIVE_INFINITY;
  return price + (hasKnownShipping(offer) ? Number(offer.shipping) : 0);
}

function offerTimestamp(offer) {
  return offer?.updatedAt || offer?.feedUpdatedAt || offer?.collectedAt || null;
}

function freshnessLabel(offer) {
  const providedAt = offer?.updatedAt || offer?.feedUpdatedAt;
  const timestamp = offerTimestamp(offer);
  if (!timestamp) return "Freshness not provided";
  const ageMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ageMs) || ageMs < 0) return "Freshness unavailable";
  const verb = providedAt ? "Updated" : "Fetched";
  if (ageMs < 60 * 60 * 1000) return `${verb} ${Math.max(1, Math.floor(ageMs / 60_000))}m ago`;
  if (ageMs < 24 * 60 * 60 * 1000) return `${verb} ${Math.floor(ageMs / (60 * 60 * 1000))}h ago`;
  return `Stale · ${formatDate(timestamp, false)}`;
}

function availabilityLabel(offer) {
  if (!offer?.availability) return "Stock status not provided";
  return offer.availability;
}

function sourceTimeLabel(offer) {
  const providedAt = offer.updatedAt || offer.feedUpdatedAt;
  const timestampValue = offerTimestamp(offer);
  if (!timestampValue) return "Source update time unavailable";
  const timestamp = Date.parse(timestampValue);
  if (!Number.isFinite(timestamp)) return "Source update time unavailable";
  const stale = Date.now() - timestamp > 24 * 60 * 60 * 1000;
  const label = providedAt ? "Source updated" : "Fetched from source";
  return `${stale ? "Stale · " : ""}${label} ${formatDate(timestampValue)}`;
}

function bestOffer(item) {
  if (!item?.offers?.length) return null;
  return item.offers.find((offer) => offer.id === item.cheapestOfferId)
    || item.offers.find((offer) => offer.id === item.lowestOfferId)
    || item.offers.slice().sort((left, right) => totalCost(left) - totalCost(right))[0];
}

function sortedOffers(offers) {
  return [...offers].sort((left, right) => {
    if (left.isVerifiedAvailable !== right.isVerifiedAvailable) return left.isVerifiedAvailable ? -1 : 1;
    if (isOutOfStock(left) !== isOutOfStock(right)) return isOutOfStock(left) ? 1 : -1;
    const costDifference = totalCost(left) - totalCost(right);
    if (costDifference) return costDifference;
    return String(left.retailer || "").localeCompare(String(right.retailer || ""));
  });
}

function withOffers(item, offers) {
  const list = sortedOffers(offers);
  const lowest = list.length ? Math.min(...list.map((offer) => Number(offer.price))) : null;
  const maxDiscountPercent = list.reduce((max, offer) => Math.max(max, discountPercent(offer)), 0);
  return {
    ...item,
    offers: list,
    offerCount: list.length,
    lowestPrice: lowest,
    maxDiscountPercent,
    cheapestOfferId: list[0]?.id || null,
    lowestOfferId: list[0]?.id || null,
    hasDiscount: list.some((offer) => discountPercent(offer) > 0),
    hasCoupon: list.some((offer) => Boolean(offer.coupon)),
    hasCashback: list.some((offer) => Boolean(offer.cashback)),
    hasPriceDrop: list.some((offer) => Number(offer.priceDrop) > 0),
    verifiedOfferCount: list.filter((offer) => offer.isVerifiedAvailable).length,
  };
}

async function api(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function setMode(mode) {
  state.mode = ["live", "demo"].includes(mode) ? mode : "unconfigured";
  const isLive = state.mode === "live";
  const isDemo = state.mode === "demo";
  elements.banner.hidden = false;
  elements.banner.className = `data-mode-banner ${isDemo ? "demo-mode" : isLive ? "live-mode" : "setup-mode"}`;
  elements.banner.innerHTML = isDemo
    ? '<strong>DEMO DATA — Not live prices.</strong> These sample products are for interface development only. They have no real retailer identity, purchase link or verified stock. <a href="#/retailers">See integration status</a>.'
    : isLive
      ? '<strong>Live prices.</strong> Offers are supplied by your configured authorised retailer sources. Confirm the final price, variant and availability on the retailer’s page. <a href="#/retailers">See connected retailers</a>.'
      : '<strong>Live data source required.</strong> Add your Flipkart Affiliate API credentials to show real products and prices. <a href="#/retailers">Setup instructions</a>.';
  const verifiedOption = document.querySelector('#sort-select option[value="verified"]');
  if (verifiedOption) verifiedOption.textContent = isDemo ? "Lowest demo price" : isLive ? "Cheapest verified" : "Recommended";
  const availableFilter = document.querySelector("#available-filter");
  if (availableFilter) {
    availableFilter.disabled = !isLive;
    if (!isLive) availableFilter.checked = false;
  }
  const sourceNote = document.querySelector("#source-note-copy");
  if (sourceNote) {
    sourceNote.textContent = isDemo
      ? "Sample prices are not live, verified or purchasable. They are shown only to develop the comparison interface."
      : isLive
        ? "“Verified” requires a source-reported in-stock status from a recent authorised fetch."
        : "No live retailer source is configured yet. The app will not invent or display placeholder prices.";
  }
  document.querySelector("#search-hint").textContent = isDemo
    ? "Demo mode: sample products only. Real offers appear when an authorised source is configured."
    : isLive
      ? "Live mode: comparing real offers from configured authorised retailer sources."
      : "Add Flipkart Affiliate API credentials to enable real product search and prices.";
}

function applyPayload(data) {
  state.products = Array.isArray(data.products) ? data.products : [];
  state.facets = data.facets || { categories: [], brands: [], retailers: [], categoryCounts: {}, brandCounts: {}, retailerCounts: {} };
  state.sources = Array.isArray(data.sources) ? data.sources : [];
  state.dataLoaded = true;
  setMode(data.mode);
}

function readRoute() {
  const hash = location.hash || "#/";
  const [pathname, search = ""] = hash.slice(1).split("?");
  const route = pathname.split("/").filter(Boolean);
  const params = new URLSearchParams(search);
  if (!route.length) return { name: "home" };
  if (route[0] === "search") return { name: "search", query: params.get("q") || "" };
  if (route[0] === "deals") return { name: "deals" };
  if (route[0] === "category" && route[1]) return { name: "category", category: decodeURIComponent(route.slice(1).join("/")) };
  if (route[0] === "saved") return { name: "saved" };
  if (route[0] === "recent") return { name: "recent" };
  if (route[0] === "product" && route[1]) return { name: "product", key: decodeURIComponent(route.slice(1).join("/")), query: params.get("q") || "" };
  if (route[0] === "retailers") return { name: "retailers" };
  if (route[0] === "about") return { name: "about" };
  if (["privacy", "terms", "contact"].includes(route[0])) return { name: route[0] };
  return { name: "home" };
}

function setRouteVisibility(route) {
  elements.home.hidden = route !== "home";
  elements.homeExtras.hidden = route !== "home";
  elements.results.hidden = !["search", "deals", "category", "saved", "recent"].includes(route);
  elements.detail.hidden = route !== "product";
  elements.retailers.hidden = route !== "retailers";
  elements.about.hidden = route !== "about";
  elements.legal.hidden = !["privacy", "terms", "contact"].includes(route);
  document.querySelectorAll(".nav-link").forEach((link) => {
    const nav = link.dataset.nav;
    const active = nav === route
      || (nav === "search" && ["search", "category", "saved", "recent", "product"].includes(route))
      || (nav === "deals" && route === "deals");
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

async function showRoute() {
  const route = readRoute();
  state.route = route.name;
  state.query = route.query || "";
  state.category = route.category || "";
  setRouteVisibility(route.name);
  window.scrollTo({ top: 0, behavior: "auto" });
  if (route.name === "home") {
    await loadHome();
    return;
  }
  if (route.name === "retailers") {
    await loadRetailersPage();
    return;
  }
  if (route.name === "about") {
    void loadSourceStatus();
    return;
  }
  if (["privacy", "terms", "contact"].includes(route.name)) {
    renderLegal(route.name);
    return;
  }
  if (route.name === "product") {
    await showProduct(route.key, route.query);
    return;
  }
  await loadResults(route);
}

function renderSkeletons(container, count) {
  container.innerHTML = Array.from({ length: count }, () => '<div class="skeleton skeleton-card"></div>').join("");
}

async function loadHome() {
  renderSkeletons(elements.homeDeals, 4);
  renderSkeletons(elements.homeTrending, 3);
  try {
    const data = await api("/api/search?pageSize=250");
    applyPayload(data);
    renderHeroSpotlight();
    renderHomeCategories();
    renderHomeDeals();
    renderHomeTrending();
    updateSuggestions();
    void loadRetailerStrip();
  } catch (error) {
    elements.heroSpotlight.className = "spotlight-card spotlight-empty";
    elements.heroSpotlight.innerHTML = `<p><strong>We couldn't load the catalogue.</strong><br>${escapeHtml(error.message)}</p><a class="button button-outline button-small" href="#/retailers">Check data sources</a>`;
    elements.homeDeals.innerHTML = '<p class="home-empty">Products are temporarily unavailable. Please try again.</p>';
    elements.homeTrending.innerHTML = "";
    elements.homeCategories.innerHTML = "";
    elements.homeCategoryGrid.innerHTML = "";
  }
}

function renderHeroSpotlight() {
  const featured = state.products
    .filter((item) => item.offers.length)
    .slice()
    .sort((left, right) => (right.maxDiscountPercent || 0) - (left.maxDiscountPercent || 0))[0];
  if (!featured) {
    elements.heroSpotlight.className = "spotlight-card spotlight-empty";
    elements.heroSpotlight.innerHTML = '<p><strong>No live product offers are available yet.</strong><br>Add your Flipkart Affiliate API credentials to load real products and prices.</p><a class="button button-outline button-small" href="#/retailers">View setup instructions</a>';
    return;
  }
  const product = featured.product;
  const offer = bestOffer(featured);
  const offers = sortedOffers(featured.offers).slice(0, 3);
  const image = product.imageUrl
    ? `<img data-fallback-image src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" loading="eager">`
    : createFallbackMarkup();
  elements.heroSpotlight.className = "hero-spotlight-wrap";
  elements.heroSpotlight.innerHTML = `<div class="spotlight-card">
    <div class="spotlight-top">
      <span class="spotlight-label">Live comparison</span>
      <span class="spotlight-badge">${featured.offers.length} offer${featured.offers.length === 1 ? "" : "s"}</span>
    </div>
    <div class="spotlight-main">
      <div class="spotlight-image">${image}</div>
      <div>
        <p class="spotlight-brand">${escapeHtml(product.brand || product.category || "Product")}</p>
        <p class="spotlight-title">${escapeHtml(product.title)}</p>
        <div class="spotlight-price"><strong>${offer ? formatPrice(offer.price) : "Unavailable"}</strong><span>${offer ? "lowest shown price" : "no offer"}</span></div>
      </div>
    </div>
    <div class="spotlight-offers">
      ${offers.map((item, index) => `<div class="spotlight-offer ${index === 0 ? "best" : ""}">
        <span class="spotlight-offer-name">${escapeHtml(item.retailer || "Retailer offer")}<small>${escapeHtml(item.isVerifiedAvailable ? "Verified in stock" : freshnessLabel(item))}</small></span>
        <span class="spotlight-offer-price">${formatPrice(item.price)}</span>
      </div>`).join("")}
    </div>
    <a class="button button-primary spotlight-cta" href="${productHref(featured)}">Compare all offers <span aria-hidden="true">→</span></a>
  </div>`;
  bindImageFallbacks(elements.heroSpotlight);
}

function renderHomeCategories() {
  const categories = state.facets.categories || [];
  const counts = state.facets.categoryCounts || {};
  elements.categoriesNote.textContent = state.mode === "live"
    ? "Categories are built from the products returned by the configured retailer sources."
    : "Categories will appear after a live retailer source is configured.";
  if (!categories.length) {
    elements.homeCategories.innerHTML = '<span class="section-note">No categories were returned by the active data source.</span>';
    elements.homeCategoryGrid.innerHTML = "";
    return;
  }
  const ordered = [...categories].sort((left, right) => (counts[right] || 0) - (counts[left] || 0));
  elements.homeCategories.innerHTML = ordered
    .map((category) => `<a class="category-chip" href="#/category/${encodeURIComponent(category)}">${escapeHtml(category)} <span>${counts[category] || 0}</span></a>`)
    .join("");
  elements.homeCategoryGrid.innerHTML = ordered.slice(0, 6).map((category) => `<a class="category-card" href="#/category/${encodeURIComponent(category)}">
    <strong>${escapeHtml(category)}</strong>
    <span>${counts[category] || 0} product${(counts[category] || 0) === 1 ? "" : "s"} available</span>
  </a>`).join("");
}

function dealsList() {
  return state.products.map((item) => {
    const candidates = item.offers.filter((offer) => discountPercent(offer) > 0 || offer.coupon || offer.cashback || Number(offer.priceDrop) > 0);
    const eligible = state.mode === "live"
      ? candidates.filter((offer) => offer.isVerifiedAvailable)
      : candidates;
    if (!eligible.length) return null;
    return withOffers(item, eligible);
  }).filter(Boolean).sort((left, right) => right.maxDiscountPercent - left.maxDiscountPercent);
}

function renderHomeDeals() {
  const deals = dealsList().slice(0, 4);
  if (!deals.length) {
    elements.homeDeals.innerHTML = `<p class="home-empty">${state.mode === "live"
      ? "No recently verified in-stock offers with a source-provided discount, coupon or cashback were returned. Check back after the next source refresh."
      : "Live deals will appear after a retailer source is configured."}</p>`;
    return;
  }
  renderCardList(deals, elements.homeDeals);
}

function renderHomeTrending() {
  const hasLiveTimestamps = state.products.some((item) => item.offers.some((offer) => offerTimestamp(offer)));
  const list = [...state.products].sort((left, right) => {
    const leftTime = latestTime(left);
    const rightTime = latestTime(right);
    if (leftTime !== rightTime) return rightTime - leftTime;
    return (right.maxDiscountPercent || 0) - (left.maxDiscountPercent || 0);
  }).slice(0, 6);
  elements.recentNote.textContent = state.mode === "live"
    ? hasLiveTimestamps
      ? "Ordered by the most recent source or fetch timestamp."
      : "The configured sources did not provide update timestamps for these offers."
    : "Trending products will appear after a live retailer source is configured.";
  if (!list.length) {
    elements.homeTrending.innerHTML = '<p class="home-empty">No products were returned by the configured sources.</p>';
    return;
  }
  elements.homeTrending.innerHTML = list.map((item) => {
    const product = item.product;
    const offer = bestOffer(item);
    const image = product.imageUrl
      ? `<img data-fallback-image src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" loading="lazy">`
      : createFallbackMarkup();
    return `<a class="trending-card" href="${productHref(item)}">
      <span class="trending-image">${image}</span>
      <span class="trending-copy">
        <strong>${escapeHtml(product.title)}</strong>
        <span>${escapeHtml(offer?.retailer || "No retailer offer")} · ${escapeHtml(offer?.isVerifiedAvailable ? "Verified in stock" : offer ? freshnessLabel(offer) : "Price unavailable")}</span>
        <span class="trending-price">${offer ? formatPrice(offer.price) : "Price unavailable"}${offer && discountPercent(offer) ? ` <small>${discountPercent(offer)}% off</small>` : ""}</span>
      </span>
    </a>`;
  }).join("");
  bindImageFallbacks(elements.homeTrending);
}

async function loadRetailerStrip() {
  try {
    const data = await api("/api/retailers");
    const retailers = data.retailers || [];
    elements.homeRetailers.innerHTML = retailers.slice(0, 10).map((retailer) => `<span class="retailer-chip">
      <span class="status-dot ${retailer.status === "connected" || retailer.status === "configured" ? "connected" : retailer.status === "unavailable" ? "error" : ""}"></span>
      ${escapeHtml(retailer.name)}
      <small>${escapeHtml(retailer.statusLabel)}</small>
    </span>`).join("");
  } catch {
    elements.homeRetailers.innerHTML = '<span class="section-note">Retailer status is temporarily unavailable.</span>';
  }
}

function productHref(item) {
  const title = item?.product?.title || "";
  return `#/product/${encodeURIComponent(item.key)}${title ? `?q=${encodeURIComponent(title)}` : ""}`;
}

function createFallbackMarkup() {
  return '<div class="image-unavailable"><div><span class="image-placeholder-icon" aria-hidden="true">◇</span><span>Image unavailable</span></div></div>';
}

function createFallbackNode() {
  const fallback = document.createElement("div");
  fallback.className = "image-unavailable";
  fallback.innerHTML = '<div><span class="image-placeholder-icon" aria-hidden="true">◇</span><span>Image unavailable</span></div>';
  return fallback;
}

function bindImageFallbacks(root) {
  root.querySelectorAll("img[data-fallback-image]").forEach((image) => {
    image.addEventListener("error", () => image.replaceWith(createFallbackNode()), { once: true });
  });
}

function productCardMarkup(item) {
  const product = item.product;
  const offer = bestOffer(item);
  const saved = state.savedKeys.includes(item.key);
  const discount = offer ? discountPercent(offer) : 0;
  const url = safeUrl(offer?.productUrl);
  const image = product.imageUrl
    ? `<img class="product-image" data-fallback-image src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" loading="lazy">`
    : createFallbackMarkup();
  const badges = [];
  if (offer?.isVerifiedAvailable) badges.push('<span class="badge badge-verified">✓ Verified in stock</span>');
  else if (offer) badges.push(`<span class="badge badge-neutral">${escapeHtml(freshnessLabel(offer))}</span>`);
  if (offer && isOutOfStock(offer)) badges.push('<span class="badge badge-out">Out of stock</span>');
  if (item.hasCoupon) badges.push('<span class="badge badge-offer">Coupon available</span>');
  if (item.hasCashback) badges.push('<span class="badge badge-offer">Cashback</span>');
  if (item.hasPriceDrop) badges.push('<span class="badge badge-offer">Price drop</span>');
  const buyAction = url
    ? `<a class="button button-buy button-small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Buy ${escapeHtml(product.title)} at ${escapeHtml(offer.retailer || "the retailer")} (opens in a new tab)">Buy now</a>`
    : "";
  return `<article class="product-card">
    <a class="product-card-media" href="${productHref(item)}" aria-label="View ${escapeHtml(product.title)}">
      ${image}
    </a>
    <button class="save-button ${saved ? "saved" : ""}" type="button" data-save="${escapeHtml(item.key)}" aria-label="${saved ? "Remove saved product" : "Save product"}" aria-pressed="${saved}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
    </button>
    <div class="product-card-body">
      ${product.brand ? `<p class="product-brand">${escapeHtml(product.brand)}</p>` : ""}
      <h3 class="product-title">${escapeHtml(product.title)}</h3>
      ${variantText(product) ? `<p class="product-variant">${escapeHtml(variantText(product))}</p>` : ""}
      <div class="product-card-price">
        <strong class="price-current">${offer ? formatPrice(offer.price) : "Price unavailable"}</strong>
        ${offer?.mrp && offer.mrp > offer.price ? `<span class="price-mrp">${formatPrice(offer.mrp)}</span><span class="discount-badge">${discount}% off</span>` : ""}
      </div>
      <p class="product-source"><strong>${escapeHtml(offer?.retailer || "No retailer offer")}</strong>${offer ? ` · ${escapeHtml(availabilityLabel(offer))}` : ""}</p>
      <div class="product-badges">${badges.join("")}</div>
      <div class="card-actions">
        <a class="button button-outline button-small" href="${productHref(item)}">Compare ${item.offers.length} offer${item.offers.length === 1 ? "" : "s"}</a>
        ${buyAction}
      </div>
    </div>
  </article>`;
}

function renderCardList(products, container) {
  if (!products.length) {
    container.innerHTML = '<p class="home-empty">No matching products.</p>';
    return;
  }
  container.innerHTML = products.map((item) => productCardMarkup(item)).join("");
  bindImageFallbacks(container);
}

function updateSuggestions() {
  const values = [...new Set([
    ...state.products.map(({ product }) => product.title),
    ...(state.facets.brands || []),
    ...(state.facets.categories || []),
  ])].slice(0, 40);
  document.querySelector("#search-suggestions").innerHTML = values
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join("");
}

async function loadResults(route) {
  state.visibleCount = 12;
  state.filters = defaultFilters();
  if (route.name === "category") state.filters.category = route.category;
  elements.resultsTitle.textContent = route.name === "saved"
    ? "Saved products"
    : route.name === "recent"
      ? "Recently viewed"
      : route.name === "deals"
        ? "Today’s deals"
        : route.name === "category"
          ? route.category
          : route.query
            ? `Results for “${route.query}”`
            : "All products";
  elements.resultsEyebrow.textContent = route.name === "deals" ? "DISCOUNTS AND OFFERS" : route.name === "saved" || route.name === "recent" ? "YOUR PRODUCTS" : "PRICE COMPARISON";
  elements.resultsSummary.textContent = "Search by product name, brand, category or model number, then filter and compare available offers.";
  elements.resultSearchInput.value = route.query || "";
  elements.searchInput.value = route.query || "";
  elements.resultStatus.textContent = "Loading products…";
  elements.grid.hidden = true;
  elements.empty.hidden = true;
  renderSkeletons(elements.grid, 6);
  elements.grid.hidden = false;
  try {
    let data;
    if (route.name === "deals") data = await api("/api/deals?pageSize=250");
    else if (route.name === "saved" || route.name === "recent") data = await api("/api/search?pageSize=250");
    else data = await api(`/api/search?q=${encodeURIComponent(route.query || "")}&pageSize=250`);
    applyPayload(data);
    if (route.name === "category") state.filters.category = route.category;
    renderFilterOptions();
    renderResults();
    updateSuggestions();
  } catch (error) {
    state.products = [];
    state.facets = { categories: [], brands: [], retailers: [], categoryCounts: {}, brandCounts: {}, retailerCounts: {} };
    renderFilterOptions();
    elements.grid.hidden = true;
    elements.grid.innerHTML = "";
    elements.resultStatus.textContent = "";
    elements.empty.hidden = false;
    elements.emptyTitle.textContent = "We couldn't load the catalogue";
    elements.emptyCopy.textContent = `${error.message} Please retry in a moment.`;
  }
}

function offerMatchesFilters(offer, filters) {
  if (filters.retailer && offer.retailer !== filters.retailer) return false;
  if (filters.minPrice !== null && Number(offer.price) < filters.minPrice) return false;
  if (filters.maxPrice !== null && Number(offer.price) > filters.maxPrice) return false;
  const discount = discountPercent(offer);
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

function filteredProducts() {
  let products = [...state.products];
  if (state.route === "saved") products = products.filter((product) => state.savedKeys.includes(product.key));
  if (state.route === "recent") products = products.filter((product) => state.recentKeys.includes(product.key));
  const filters = state.filters;
  const offerLevel = Boolean(
    filters.retailer
    || filters.minPrice !== null
    || filters.maxPrice !== null
    || filters.minDiscount !== null
    || filters.offerType
    || filters.stock
    || filters.available,
  );
  products = products.map((item) => {
    if (filters.category && item.product.category !== filters.category) return null;
    if (filters.brand && item.product.brand !== filters.brand) return null;
    if (!offerLevel) return item;
    const offers = item.offers.filter((offer) => offerMatchesFilters(offer, filters));
    return offers.length ? withOffers(item, offers) : null;
  }).filter(Boolean);
  if (filters.sort === "price-asc") products.sort((left, right) => (left.lowestPrice ?? Infinity) - (right.lowestPrice ?? Infinity));
  else if (filters.sort === "price-desc") products.sort((left, right) => (right.lowestPrice ?? -Infinity) - (left.lowestPrice ?? -Infinity));
  else if (filters.sort === "discount") products.sort((left, right) => (right.maxDiscountPercent || 0) - (left.maxDiscountPercent || 0));
  else if (filters.sort === "name") products.sort((left, right) => left.product.title.localeCompare(right.product.title));
  else if (filters.sort === "updated") products.sort((left, right) => latestTime(right) - latestTime(left));
  else if (filters.sort === "verified") {
    products.sort((left, right) => {
      if (left.verifiedOfferCount !== right.verifiedOfferCount) return right.verifiedOfferCount - left.verifiedOfferCount;
      return (left.lowestPrice ?? Infinity) - (right.lowestPrice ?? Infinity);
    });
  }
  return products;
}

function latestTime(item) {
  return Math.max(0, ...item.offers.map((offer) => Date.parse(offerTimestamp(offer) || 0) || 0));
}

function renderResults() {
  const products = filteredProducts();
  const page = products.slice(0, state.visibleCount);
  elements.grid.innerHTML = page.map((item) => productCardMarkup(item)).join("");
  elements.grid.hidden = products.length === 0;
  bindImageFallbacks(elements.grid);
  elements.empty.hidden = products.length > 0;
  elements.loadMore.hidden = products.length <= state.visibleCount;
  const offerCount = products.reduce((sum, item) => sum + item.offers.length, 0);
  if (products.length) {
    const label = state.route === "deals" || state.filters.offerType
      ? `${products.length} matching product${products.length === 1 ? "" : "s"} · ${offerCount} offer${offerCount === 1 ? "" : "s"}`
      : `${products.length} product${products.length === 1 ? "" : "s"} · ${offerCount} source-backed offers`;
    elements.resultStatus.textContent = `${label}${state.sources.some((source) => source.error) ? " · Some retailer feeds could not be reached" : ""}`;
  } else {
    elements.resultStatus.textContent = "";
  }
  if (state.route === "saved" && state.savedKeys.length === 0) {
    elements.emptyTitle.textContent = "No saved products yet";
    elements.emptyCopy.textContent = "Save a product with the bookmark icon and it will be easy to find here.";
  } else if (state.route === "recent" && state.recentKeys.length === 0) {
    elements.emptyTitle.textContent = "No recently viewed products";
    elements.emptyCopy.textContent = "Products you open will appear here while they remain available in the connected sources.";
  } else {
    elements.emptyTitle.textContent = "No matching offers";
    elements.emptyCopy.textContent = state.products.length
      ? "Try adjusting your filters to see more listings."
      : state.mode === "live"
        ? "No offers were returned by the configured sources. Check the retailer integrations page for source status."
        : "No live retailer source is configured. Add Flipkart Affiliate API credentials to search real products.";
  }
}

function setFilterOptions(selector, values, placeholder, selected) {
  const select = document.querySelector(selector);
  select.replaceChildren(new Option(placeholder, ""));
  values.forEach((value) => select.add(new Option(value, value)));
  select.value = values.includes(selected) ? selected : "";
}

function renderFilterOptions() {
  setFilterOptions("#category-filter", state.facets.categories || [], "All categories", state.filters.category);
  setFilterOptions("#brand-filter", state.facets.brands || [], "All brands", state.filters.brand);
  setFilterOptions("#retailer-filter", state.facets.retailers || [], "All retailers", state.filters.retailer);
  document.querySelector("#min-price").value = state.filters.minPrice ?? "";
  document.querySelector("#max-price").value = state.filters.maxPrice ?? "";
  document.querySelector("#min-discount").value = state.filters.minDiscount ?? "";
  document.querySelector("#offer-filter").value = state.filters.offerType;
  document.querySelector("#stock-filter").value = state.filters.stock;
  document.querySelector("#available-filter").checked = state.filters.available;
  document.querySelector("#sort-select").value = state.filters.sort;
}

function readFiltersFromDom() {
  const numberValue = (selector) => {
    const value = document.querySelector(selector).value;
    return value === "" ? null : Number(value);
  };
  state.filters = {
    category: document.querySelector("#category-filter").value,
    brand: document.querySelector("#brand-filter").value,
    retailer: document.querySelector("#retailer-filter").value,
    minPrice: numberValue("#min-price"),
    maxPrice: numberValue("#max-price"),
    minDiscount: numberValue("#min-discount"),
    offerType: document.querySelector("#offer-filter").value,
    stock: document.querySelector("#stock-filter").value,
    available: document.querySelector("#available-filter").checked,
    sort: document.querySelector("#sort-select").value,
  };
}

function updateSavedCount() {
  document.querySelector("#saved-count").textContent = String(state.savedKeys.length);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function toggleSaved(key) {
  const saved = state.savedKeys.includes(key);
  state.savedKeys = saved
    ? state.savedKeys.filter((item) => item !== key)
    : [key, ...state.savedKeys].slice(0, 100);
  writeStorage("pricewise:saved", state.savedKeys);
  updateSavedCount();
  if (state.route === "home") {
    renderHomeDeals();
    renderHomeTrending();
  } else if (["search", "deals", "category", "saved", "recent"].includes(state.route)) {
    renderResults();
  } else if (state.route === "product") {
    document.querySelectorAll(`[data-save="${CSS.escape(key)}"]`).forEach((button) => {
      const isSaved = state.savedKeys.includes(key);
      button.classList.toggle("saved", isSaved);
      button.classList.toggle("button-primary", isSaved);
      button.classList.toggle("button-outline", !isSaved);
      button.setAttribute("aria-pressed", String(isSaved));
      button.textContent = isSaved ? "✓ Saved" : "♡ Save product";
    });
  }
  showToast(saved ? "Product removed from saved" : "Product saved");
}

function addRecent(key) {
  state.recentKeys = [key, ...state.recentKeys.filter((item) => item !== key)].slice(0, 20);
  writeStorage("pricewise:recent", state.recentKeys);
}

async function showProduct(key, query) {
  elements.detailContent.innerHTML = '<div class="detail-error"><p>Loading product details…</p></div>';
  let item = state.products.find((product) => product.key === key);
  try {
    if (!item) {
      const data = await api(`/api/products/${encodeURIComponent(key)}?q=${encodeURIComponent(query || "")}`);
      setMode(data.mode);
      item = data.product;
    }
    if (!item) {
      elements.detailContent.innerHTML = '<div class="detail-error"><h1>Product no longer available</h1><p>This exact listing was not returned by the active sources. Try a new search.</p><a class="button button-outline" href="#/search">Search products</a></div>';
      return;
    }
    addRecent(item.key);
    renderProductDetail(item);
    if (state.mode === "live") void loadHistory(item.key);
  } catch (error) {
    elements.detailContent.innerHTML = `<div class="detail-error"><h1>Product details unavailable</h1><p>${escapeHtml(error.message)}</p><a class="button button-outline" href="#/search">Back to search</a></div>`;
  }
}

function renderProductDetail(item) {
  const product = item.product;
  const galleryImages = [...new Set([product.imageUrl, ...(product.imageUrls || [])].filter(Boolean))].slice(0, 8);
  const imageMarkup = galleryImages.length
    ? `<img data-main-image data-fallback-image src="${escapeHtml(galleryImages[0])}" alt="${escapeHtml(product.title)}">
      ${galleryImages.length > 1 ? `<div class="detail-thumbnails">${galleryImages.map((url, index) => `<button class="detail-thumb ${index === 0 ? "active" : ""}" type="button" data-image="${escapeHtml(url)}" aria-label="Show product image ${index + 1}" aria-pressed="${index === 0}"><img src="${escapeHtml(url)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}`
    : createFallbackMarkup();
  const identifiers = Object.entries(product.identifiers || {}).map(([identifier, value]) => `<span>${escapeHtml(identifier.toUpperCase())}: ${escapeHtml(value)}</span>`).join("");
  const variant = variantText(product);
  const saved = state.savedKeys.includes(item.key);
  const best = bestOffer(item);
  const bestDiscount = best ? discountPercent(best) : 0;
  elements.detailContent.innerHTML = `<div class="detail-layout">
    <div class="detail-gallery"><div class="detail-image">${imageMarkup}</div></div>
    <div class="detail-copy">
      <p class="product-brand">${escapeHtml(product.brand || product.category || "Product listing")}</p>
      <h1>${escapeHtml(product.title)}</h1>
      ${variant ? `<p class="detail-variant">${escapeHtml(variant)}</p>` : ""}
      <div class="detail-identifiers">${identifiers || "<span>No product identifier supplied</span>"}</div>
      <button class="button ${saved ? "button-primary" : "button-outline"}" type="button" data-save="${escapeHtml(item.key)}" aria-pressed="${saved}">${saved ? "✓ Saved" : "♡ Save product"}</button>
      ${best ? `<div class="detail-best">
        <div><small>${best.isVerifiedAvailable ? "Lowest verified eligible price" : "Lowest shown price"}</small><strong>${formatPrice(best.price)}</strong>${bestDiscount ? ` <span>${bestDiscount}% below MRP</span>` : ""}</div>
        <div><span>Best shown at <strong>${escapeHtml(best.retailer || "retailer")}</strong></span></div>
      </div>` : ""}
      <div class="offers-heading"><div><h2>Compare retailer offers</h2><p>Offers for this matched product and exact variant only.${state.mode === "live" ? " Sorted by verified availability and price." : ""}</p></div></div>
      <div class="offer-list" role="list">${item.offers.length ? sortedOffers(item.offers).map((offer) => renderOfferRow(offer, item)).join("") : '<p class="history-empty">Price currently unavailable.</p>'}</div>
      <p class="section-note">Delivery charges and location-specific prices may be unknown before checkout. Cashback and bank offers are shown separately and are not treated as guaranteed price reductions.</p>
    </div>
  </div>
  <section class="history-section">
    <h2>Observed price history</h2>
    <p>Built only from real observations recorded by this PriceWise installation.</p>
    <div id="history-visual" class="history-empty">Loading observed history…</div>
  </section>`;

  const mainImage = elements.detailContent.querySelector("[data-main-image]");
  mainImage?.addEventListener("error", () => {
    elements.detailContent.querySelector(".detail-image").innerHTML = createFallbackMarkup();
  }, { once: true });
  elements.detailContent.querySelectorAll("[data-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const image = elements.detailContent.querySelector("[data-main-image]");
      if (!image) return;
      image.src = button.dataset.image;
      elements.detailContent.querySelectorAll(".detail-thumb").forEach((thumbnail) => {
        const active = thumbnail === button;
        thumbnail.classList.toggle("active", active);
        thumbnail.setAttribute("aria-pressed", String(active));
      });
    });
    button.querySelector("img")?.addEventListener("error", () => button.remove(), { once: true });
  });
}

function renderOfferRow(offer, item) {
  const url = safeUrl(offer.productUrl);
  const discount = discountPercent(offer);
  const best = offer.id === item.cheapestOfferId;
  const offerDetails = [
    offer.offerPrice ? `Offer price ${formatPrice(offer.offerPrice)}` : "",
    hasKnownShipping(offer) ? `Shipping ${formatPrice(offer.shipping)}` : "Shipping not provided",
    hasKnownShipping(offer) ? `Est. total ${formatPrice(Number(offer.price) + Number(offer.shipping))}` : "",
    offer.coupon ? `Coupon: ${offer.coupon}` : "",
    offer.promotion || "",
    offer.cashback ? `Cashback: ${typeof offer.cashback === "number" ? formatPrice(offer.cashback) : offer.cashback} (separate; conditional)` : "",
    offer.deliveryEstimate ? `Delivery estimate: ${offer.deliveryEstimate}` : "",
    `Stock: ${availabilityLabel(offer)}`,
    offer.retailerHost ? `Host: ${offer.retailerHost}` : "",
  ].filter(Boolean);
  const purchase = url
    ? `<a class="buy-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Buy Now at ${escapeHtml(offer.retailer)} (opens in a new tab)">Buy Now <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg></a><span class="buy-note">Opens the retailer’s product page</span>`
    : '<button class="buy-link" type="button" disabled aria-label="Buy Now unavailable: exact retailer product link is missing">Buy Now</button><span class="buy-note">Exact product link unavailable</span>';
  return `<article class="offer-row ${best ? "best" : ""}" role="listitem">
    <div class="offer-retailer">${escapeHtml(offer.retailer)}<span class="offer-host">${escapeHtml(offer.retailerHost || offer.sourceName || "Retailer")}</span>${best ? '<span class="best-price-badge">Best price shown</span>' : ""}</div>
    <div class="offer-price">${formatPrice(offer.price)}<small>${offer.mrp && offer.mrp > offer.price ? `MRP ${formatPrice(offer.mrp)} · ${discount}% off` : "Regular price · no MRP discount provided"}</small></div>
    <div class="offer-status">
      <span class="${offer.isVerifiedAvailable ? "verified-badge" : "freshness-badge"}">${escapeHtml(offer.isVerifiedAvailable ? "✓ Verified in stock" : isOutOfStock(offer) ? "Out of stock" : availabilityLabel(offer))}</span>
      <div class="offer-detail">${offerDetails.map((detail) => escapeHtml(detail)).join("<br>")}</div>
      <span class="freshness-badge">${escapeHtml(sourceTimeLabel(offer))} · ${escapeHtml(offer.sourceName || "source")}</span>
    </div>
    <div class="offer-actions">${purchase}</div>
  </article>`;
}

async function loadHistory(key) {
  const visual = document.querySelector("#history-visual");
  if (!visual) return;
  try {
    const data = await api(`/api/price-history/${encodeURIComponent(key)}`);
    const retailers = new Map();
    for (const point of data.observations) {
      const series = retailers.get(point.retailer) || [];
      if (series.at(-1)?.observed_at !== point.observed_at) series.push(point);
      retailers.set(point.retailer, series);
    }
    const series = [...retailers.entries()].map(([retailer, values]) => ({ retailer, values })).filter((entry) => entry.values.length > 1);
    const stats = `<div class="history-stats">
      <span class="history-stat">Observations<strong>${Number(data.observationCount || 0)}</strong></span>
      ${data.lowestRecordedPrice !== null ? `<span class="history-stat">Lowest recorded<strong>${formatPrice(data.lowestRecordedPrice)}</strong></span>` : ""}
      ${data.highestRecordedPrice !== null ? `<span class="history-stat">Highest recorded<strong>${formatPrice(data.highestRecordedPrice)}</strong></span>` : ""}
    </div>`;
    if (!series.length) {
      visual.textContent = data.observations?.length
        ? "Real observations are recorded. A chart appears after a second observation from the same retailer."
        : "No historical observations have been collected yet.";
      visual.insertAdjacentHTML("afterend", stats);
      return;
    }
    const values = series.flatMap((entry) => entry.values);
    const min = Math.min(...values.map((point) => point.price));
    const max = Math.max(...values.map((point) => point.price));
    const spread = Math.max(max - min, 1);
    const width = 720;
    const height = 130;
    const margin = 18;
    const times = values.map((point) => Date.parse(point.observed_at));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const colors = ["#0f6b54", "#cf7953", "#5276a8", "#8b6ba8", "#749744", "#bb5876"];
    const plotted = series.map((entry, seriesIndex) => {
      const coordinates = entry.values.map((point, index) => {
        const time = Date.parse(point.observed_at);
        const x = maxTime === minTime
          ? margin + (index / (entry.values.length - 1)) * (width - margin * 2)
          : margin + ((time - minTime) / (maxTime - minTime)) * (width - margin * 2);
        return {
          x,
          y: height - margin - ((point.price - min) / spread) * (height - margin * 2),
        };
      });
      const path = coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
      const color = colors[seriesIndex % colors.length];
      return {
        retailer: entry.retailer,
        color,
        index: seriesIndex % colors.length,
        path: `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
        points: coordinates.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"/>`).join(""),
      };
    });
    visual.className = "history-chart";
    visual.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Observed source prices ranging from ${escapeHtml(formatPrice(min))} to ${escapeHtml(formatPrice(max))} across ${series.length} retailer${series.length === 1 ? "" : "s"}">
      ${plotted.map((entry) => entry.path + entry.points).join("")}
      <text x="${margin}" y="${height - 1}" fill="#738078" font-size="10">${escapeHtml(formatPrice(min))}</text>
      <text x="${width - margin}" y="${height - 1}" fill="#738078" font-size="10" text-anchor="end">${escapeHtml(formatPrice(max))}</text>
    </svg><div class="history-legend">${plotted.map((entry) => `<span><i data-color="${entry.index}"></i>${escapeHtml(entry.retailer)}</span>`).join("")}</div>${stats}`;
  } catch {
    visual.textContent = "Price history is temporarily unavailable.";
  }
}

async function loadRetailersPage() {
  elements.retailersSummary.innerHTML = '<span class="skeleton skeleton-chip"></span><span class="skeleton skeleton-chip"></span><span class="skeleton skeleton-chip"></span>';
  elements.retailersContent.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';
  try {
    const data = await api("/api/retailers");
    setMode(data.mode);
    const summary = data.summary || { connected: 0, awaiting: 0, total: 0 };
    elements.retailersSummary.innerHTML = `
      <div class="summary-stat"><span>Retailers in registry</span><strong>${summary.total}</strong></div>
      <div class="summary-stat"><span>Configured / connected</span><strong>${summary.connected}</strong></div>
      <div class="summary-stat"><span>Awaiting access</span><strong>${summary.awaiting}</strong></div>
      <div class="summary-stat"><span>Data mode</span><strong>${data.mode === "live" ? "Live" : "Setup required"}</strong></div>`;
    if (!data.retailers?.length) {
      elements.retailersContent.innerHTML = '<p class="home-empty">No retailer definitions are available.</p>';
      return;
    }
    elements.retailersContent.innerHTML = data.retailers.map((retailer) => {
      const docs = safeUrl(retailer.documentation);
      return `<article class="retailer-card">
        <div class="retailer-card-head">
          <div><h2>${escapeHtml(retailer.name)}</h2><span class="retailer-category">${escapeHtml(retailer.category)}</span></div>
          <span class="retailer-status ${escapeHtml(retailer.status)}">${escapeHtml(retailer.statusLabel)}</span>
        </div>
        <p class="retailer-meta"><strong>Integration:</strong> ${escapeHtml(retailer.integration)}</p>
        <p class="retailer-meta"><strong>Status:</strong> ${escapeHtml(retailer.statusDetail)}</p>
        <div class="retailer-env" aria-label="Required environment variables">${(retailer.credentialEnv || []).map((name) => `<code>${escapeHtml(name)}</code>`).join("")}</div>
        <p class="retailer-note">${escapeHtml(retailer.notes)}</p>
        ${docs ? `<a class="retailer-doc" href="${escapeHtml(docs)}" target="_blank" rel="noopener noreferrer">Programme documentation ↗</a>` : ""}
      </article>`;
    }).join("");
  } catch (error) {
    elements.retailersSummary.innerHTML = "";
    elements.retailersContent.innerHTML = `<p class="home-empty">Retailer status is temporarily unavailable: ${escapeHtml(error.message)}</p>`;
  }
}

async function loadSourceStatus() {
  try {
    const status = await api("/api/status");
    setMode(status.mode);
    const copy = document.querySelector("#source-status-copy");
    const list = document.querySelector("#source-list");
    if (status.mode !== "live") {
      copy.textContent = "No live retailer feed is configured. Add the required Flipkart Affiliate credentials to .env, then restart the server. PriceWise will not show placeholder prices.";
      list.innerHTML = `<div class="source-row"><span>Flipkart Affiliate API</span><span class="source-state">Credentials required</span></div>${(status.setupRequired || []).map((name) => `<div class="source-row"><span><code>${escapeHtml(name)}</code></span><span class="source-state">Missing</span></div>`).join("")}`;
      return;
    }
    const summary = status.retailers || { connected: 0, total: 0 };
    copy.textContent = `${summary.connected} of ${summary.total} registry retailers have a configured feed. A configured feed is not a guarantee of product coverage; response status updates after requests.`;
    list.innerHTML = (status.feeds || []).map((feed) => {
      const label = feed.error
        ? "Unavailable"
        : feed.available === null
          ? "Configured · not checked yet"
          : feed.available
            ? "Connected"
            : "Error";
      return `<div class="source-row"><span>${escapeHtml(feed.name || feed.id)}</span><span class="source-state ${feed.available ? "connected" : ""}">${escapeHtml(label)}</span></div>`;
    }).join("") || '<div class="source-row"><span>No feeds configured</span><span class="source-state">Not connected</span></div>';
  } catch {
    const copy = document.querySelector("#source-status-copy");
    if (copy) copy.textContent = "Source status is temporarily unavailable.";
  }
}

function renderLegal(route) {
  const content = route === "privacy"
    ? `<article class="legal-copy"><p class="eyebrow">PRICEWISE</p><h1>Privacy notice</h1>
        <p>This application does not provide user accounts. Saved and recently viewed product identifiers are stored in your browser's local storage. Search requests are sent to the PriceWise server and, where configured, to its authorised retailer feeds.</p>
        <h2>Information handled</h2><p>The server processes the search query, request metadata needed to operate and rate-limit the service, and source-backed price observations for price history. Retailer credentials are read from server environment variables and are not sent to the browser.</p>
        <h2>Retention and choices</h2><p>You can clear saved and recently viewed items from your browser storage. The local SQLite database retains price observations for up to one year. Operators should update this notice with their business contact, jurisdiction-specific requirements and retention practices before deploying publicly.</p>
        <h2>Contact</h2><p>For privacy questions, contact the operator of this PriceWise deployment.</p></article>`
    : route === "terms"
      ? `<article class="legal-copy"><p class="eyebrow">PRICEWISE</p><h1>Terms of use</h1>
        <p>PriceWise displays information from configured authorised retailer feeds as a convenience. Feed data may be delayed, incomplete or unavailable. Confirm the final price, variant, delivery charges and stock directly with the retailer before making a purchase.</p>
        <h2>No retailer affiliation</h2><p>PriceWise is an independent comparison application. Retailer names, product images, trademarks and listing details belong to their respective owners and are shown only as provided by an authorised source.</p>
        <h2>Affiliate disclosure</h2><p>Some retailer links may include authorised affiliate tracking parameters. PriceWise does not assume an affiliate relationship exists for any retailer. Product comparison remains useful whether or not affiliate tracking is present.</p>
        <h2>Operator responsibilities</h2><p>Operators must configure only feeds they are authorised to access, follow the source's licence and rate limits, and provide accurate contact and legal information for their deployment.</p>
        <h2>Availability</h2><p>The service is provided as-is. PriceWise does not guarantee continuous availability, accuracy of a retailer feed or any particular offer.</p></article>`
      : `<article class="legal-copy"><p class="eyebrow">PRICEWISE</p><h1>Contact</h1>
        <p>Contact details have not been configured for this PriceWise installation. If you operate this site, add your verified support email or contact form here before deploying it publicly.</p>
        <p>For a privacy or data-source concern, contact the operator responsible for this installation.</p></article>`;
  document.querySelector("#legal-content").innerHTML = content;
}

function runSearch(value) {
  const query = value.trim();
  location.hash = query ? `#/search?q=${encodeURIComponent(query)}` : "#/search";
}

function resetFilters() {
  state.filters = defaultFilters();
  if (state.route === "category") state.filters.category = state.category;
  renderFilterOptions();
  state.visibleCount = 12;
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(elements.searchInput.value);
});
elements.resultsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(elements.resultSearchInput.value);
});
document.querySelector("#saved-nav").addEventListener("click", () => {
  location.hash = "#/saved";
});
document.querySelector("#load-more").addEventListener("click", () => {
  state.visibleCount += 12;
  renderResults();
});
document.querySelector("#clear-filters").addEventListener("click", () => {
  if (state.route === "category") {
    location.hash = "#/search";
    return;
  }
  resetFilters();
  renderResults();
});
document.querySelector("#empty-retry").addEventListener("click", () => {
  void showRoute();
});
document.querySelector("#category-filter").addEventListener("change", (event) => {
  if (state.route === "category" && !event.target.value) {
    location.hash = "#/search";
    return;
  }
  readFiltersFromDom();
  state.visibleCount = 12;
  renderResults();
});
["#brand-filter", "#retailer-filter", "#min-price", "#max-price", "#min-discount", "#offer-filter", "#stock-filter", "#available-filter", "#sort-select"]
  .forEach((selector) => {
    const element = document.querySelector(selector);
    element.addEventListener("input", () => {
      readFiltersFromDom();
      state.visibleCount = 12;
      renderResults();
    });
    if (element.tagName === "SELECT") {
      element.addEventListener("change", () => {
        readFiltersFromDom();
        state.visibleCount = 12;
        renderResults();
      });
    }
  });

document.addEventListener("click", (event) => {
  const saveButton = event.target.closest("[data-save]");
  if (saveButton) {
    toggleSaved(saveButton.dataset.save);
  }
});

window.addEventListener("hashchange", () => { void showRoute(); });
updateSavedCount();
void showRoute();
