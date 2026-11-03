export const RETAILERS = [
  {
    id: "amazon-in",
    name: "Amazon India",
    host: "amazon.in",
    category: "Marketplace",
    integration: "Amazon Product Advertising API 5.0 (approval required)",
    credentialEnv: ["AMAZON_PAAPI_ACCESS_KEY", "AMAZON_PAAPI_SECRET_KEY", "AMAZON_PAAPI_PARTNER_TAG"],
    documentation: "https://webservices.amazon.in/paapi5/documentation/",
    notes: "Requires an approved Amazon Associates India account with PA-API access. Product links must retain your affiliate tag.",
  },
  {
    id: "flipkart",
    name: "Flipkart",
    host: "flipkart.com",
    category: "Marketplace",
    integration: "Flipkart Affiliate API / approved catalog feed",
    credentialEnv: ["FLIPKART_AFFILIATE_ID", "FLIPKART_AFFILIATE_TOKEN"],
    documentation: "https://affiliate.flipkart.com/",
    notes: "Affiliate API access is granted per account. Use only the product data and link formats Flipkart authorises.",
  },
  {
    id: "myntra",
    name: "Myntra",
    host: "myntra.com",
    category: "Fashion",
    integration: "Myntra affiliate catalog feed",
    credentialEnv: ["MYNTRA_AFFILIATE_ID", "MYNTRA_AFFILIATE_TOKEN"],
    documentation: "https://www.myntra.com/",
    notes: "Variant-level matching (size, colour, pack) is required before offers can be compared.",
  },
  {
    id: "nykaa",
    name: "Nykaa",
    host: "nykaa.com",
    category: "Beauty",
    integration: "Nykaa affiliate catalog feed",
    credentialEnv: ["NYKAA_AFFILIATE_ID", "NYKAA_AFFILIATE_TOKEN"],
    documentation: "https://www.nykaa.com/",
    notes: "Beauty and skincare offers must include exact shade, size and pack quantity.",
  },
  {
    id: "deodap",
    name: "DeoDap",
    host: "deodap.com",
    category: "Wholesale / Household",
    integration: "DeoDap authorised product feed",
    credentialEnv: ["DEODAP_FEED_URL", "DEODAP_FEED_TOKEN"],
    documentation: "https://www.deodap.com/",
    notes: "Product data access must be agreed with DeoDap. Bulk-pack quantities must remain part of the comparison key.",
  },
  {
    id: "meesho",
    name: "Meesho",
    host: "meesho.com",
    category: "Marketplace",
    integration: "Meesho affiliate catalog feed",
    credentialEnv: ["MEESHO_AFFILIATE_ID", "MEESHO_AFFILIATE_TOKEN"],
    documentation: "https://www.meesho.com/",
    notes: "Third-party seller listings can differ by size and pack; do not merge similar titles.",
  },
  {
    id: "ajio",
    name: "AJIO",
    host: "ajio.com",
    category: "Fashion",
    integration: "AJIO affiliate catalog feed",
    credentialEnv: ["AJIO_AFFILIATE_ID", "AJIO_AFFILIATE_TOKEN"],
    documentation: "https://www.ajio.com/",
    notes: "Fashion comparisons require matching style code, size and colour.",
  },
  {
    id: "tata-cliq",
    name: "Tata CLiQ",
    host: "tatacliq.com",
    category: "Marketplace",
    integration: "Tata CLiQ affiliate catalog feed",
    credentialEnv: ["TATACLIQ_AFFILIATE_ID", "TATACLIQ_AFFILIATE_TOKEN"],
    documentation: "https://www.tatacliq.com/",
    notes: "Use only catalogue data and purchase links authorised through the Tata CLiQ programme.",
  },
  {
    id: "croma",
    name: "Croma",
    host: "croma.com",
    category: "Electronics",
    integration: "Croma authorised catalog feed",
    credentialEnv: ["CROMA_AFFILIATE_ID", "CROMA_AFFILIATE_TOKEN"],
    documentation: "https://www.croma.com/",
    notes: "Electronics comparisons must match model number and storage/colour variant.",
  },
  {
    id: "reliance-digital",
    name: "Reliance Digital",
    host: "reliancedigital.in",
    category: "Electronics",
    integration: "Reliance Digital authorised catalog feed",
    credentialEnv: ["RELIANCE_DIGITAL_AFFILIATE_ID", "RELIANCE_DIGITAL_AFFILIATE_TOKEN"],
    documentation: "https://www.reliancedigital.in/",
    notes: "Delivery estimates and installation offers are location-specific; do not infer them.",
  },
  {
    id: "vijay-sales",
    name: "Vijay Sales",
    host: "vijaysales.com",
    category: "Electronics",
    integration: "Vijay Sales authorised catalog feed",
    credentialEnv: ["VIJAY_SALES_AFFILIATE_ID", "VIJAY_SALES_AFFILIATE_TOKEN"],
    documentation: "https://www.vijaysales.com/",
    notes: "Use source-provided pricing and exact model numbers only.",
  },
  {
    id: "bigbasket",
    name: "BigBasket",
    host: "bigbasket.com",
    category: "Grocery",
    integration: "BigBasket authorised catalog feed",
    credentialEnv: ["BIGBASKET_AFFILIATE_ID", "BIGBASKET_AFFILIATE_TOKEN"],
    documentation: "https://www.bigbasket.com/",
    notes: "Grocery prices and availability vary by city. Location-specific prices require explicit source context.",
  },
  {
    id: "jiomart",
    name: "JioMart",
    host: "jiomart.com",
    category: "Grocery / Marketplace",
    integration: "JioMart authorised catalog feed",
    credentialEnv: ["JIOMART_AFFILIATE_ID", "JIOMART_AFFILIATE_TOKEN"],
    documentation: "https://www.jiomart.com/",
    notes: "Pack size and unit price must match before grocery listings are compared.",
  },
  {
    id: "blinkit",
    name: "Blinkit",
    host: "blinkit.com",
    category: "Quick commerce",
    integration: "Blinkit authorised catalog access (where granted)",
    credentialEnv: ["BLINKIT_AFFILIATE_ID", "BLINKIT_AFFILIATE_TOKEN"],
    documentation: "https://blinkit.com/",
    notes: "Availability is highly location-dependent. Do not show Blinkit offers without authorised access and a location context.",
  },
  {
    id: "brand-store",
    name: "Brand websites",
    host: "",
    category: "Brand store",
    integration: "Authorised brand product feed",
    credentialEnv: ["BRAND_FEED_URL", "BRAND_FEED_TOKEN"],
    documentation: "",
    notes: "Add an entry to PRICEWISE_FEEDS for each brand store you are authorised to use.",
  },
];

function retailerMatchesFeed(retailer, feed) {
  const definition = feed.definition || {};
  if (definition.retailerId === retailer.id) return true;
  if (!retailer.host) return false;
  return (definition.retailerDomains || []).some((domain) => {
    const value = domain.toLowerCase().replace(/^\*\./, "");
    return value === retailer.host || value.endsWith(`.${retailer.host}`);
  });
}

function connectionState(feeds) {
  if (!feeds.length) {
    return {
      key: "awaiting_credentials",
      label: "Awaiting credentials",
      detail: "No authorised feed is configured for this retailer.",
    };
  }
  const errored = feeds.find((feed) => feed.status().error);
  if (errored) {
    const status = errored.status();
    if (status.errorKind === "credentials") {
      return {
        key: "awaiting_credentials",
        label: "Awaiting credentials",
        detail: status.error,
      };
    }
    if (status.errorKind === "approval") {
      return {
        key: "awaiting_approval",
        label: "Awaiting approval",
        detail: "The source rejected the configured access. Confirm programme approval and credentials.",
      };
    }
    if (status.errorKind === "unavailable") {
      return {
        key: "feed_unavailable",
        label: "Feed unavailable",
        detail: "The source could not be reached on its last request.",
      };
    }
    return {
      key: "error",
      label: "Error",
      detail: status.error,
    };
  }
  const checked = feeds.find((feed) => feed.status().checkedAt);
  if (!checked) {
    return {
      key: "configured",
      label: "Awaiting first sync",
      detail: "A feed is configured but has not been requested yet.",
    };
  }
  return {
    key: "connected",
    label: "Connected",
    detail: "Authorised feed responded on its last request.",
  };
}

export function getRetailerStatuses(feeds = []) {
  return RETAILERS.map((retailer) => {
    const matched = feeds.filter((feed) => retailerMatchesFeed(retailer, feed));
    const state = connectionState(matched);
    return {
      id: retailer.id,
      name: retailer.name,
      host: retailer.host,
      category: retailer.category,
      integration: retailer.integration,
      credentialEnv: retailer.credentialEnv,
      documentation: retailer.documentation,
      notes: retailer.notes,
      connected: state.key === "connected",
      status: state.key,
      statusLabel: state.label,
      statusDetail: state.detail,
      feeds: matched.map((feed) => feed.status()),
    };
  });
}

export function getRetailerSummary(feeds = []) {
  const statuses = getRetailerStatuses(feeds);
  return {
    connected: statuses.filter((retailer) => retailer.status === "connected").length,
    awaiting: statuses.filter((retailer) => retailer.status !== "connected").length,
    total: statuses.length,
  };
}
