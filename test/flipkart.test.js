import assert from "node:assert/strict";
import { test } from "node:test";
import { FlipkartAffiliateAdapter } from "../src/integrations/flipkart.js";

function payloadFor(productId = "MOB123", overrides = {}) {
  return {
    productInfoList: [{
      productBaseInfoV1: {
        productId,
        title: "Sony Xperia Test Phone",
        productBrand: "Sony",
        categoryPath: JSON.stringify([[
          { node_id: 20001, node_name: "FLIPKART_TREE" },
          { node_id: 20143, node_name: "Mobiles" },
          { node_id: 20144, node_name: "Handsets" },
        ]]),
        imageUrls: {
          "200x200": "http://img.fkcdn.com/image/phone-200x200.jpeg",
          "800x800": "http://img.fkcdn.com/image/phone-800x800.jpeg",
        },
        maximumRetailPrice: { amount: 24490, currency: "INR" },
        flipkartSellingPrice: { amount: 20570, currency: "INR" },
        flipkartSpecialPrice: { amount: 19999, currency: "INR" },
        productUrl: `http://dl.flipkart.com/dl/sony-xperia/p/itm123?pid=${productId}&affid=myaffiliate`,
        inStock: true,
        isAvailable: true,
        discountPercentage: 18,
        offers: [],
        attributes: { size: "128 GB", color: "White" },
        styleCode: "STYLE-1",
        ...overrides,
      },
      productShippingInfoV1: {
        shippingCharges: { amount: 100, currency: "INR" },
        sellerName: "Approved Seller",
      },
    }],
  };
}

function response(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Flipkart adapter stays unconfigured without affiliate credentials", async () => {
  let called = false;
  const adapter = new FlipkartAffiliateAdapter({
    trackingId: "",
    token: "",
    fetchImpl: async () => {
      called = true;
      return response(payloadFor());
    },
  }, {});
  assert.equal(adapter.configured, false);
  assert.deepEqual(await adapter.search("phone"), []);
  assert.equal(called, false);
  assert.equal(adapter.status().configured, false);
});

test("Flipkart search authorizes correctly and normalizes real offer fields", async () => {
  let request = null;
  const adapter = new FlipkartAffiliateAdapter({
    trackingId: "my-affiliate-id",
    token: "my-token",
    defaultQueries: "mobile",
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return response(payloadFor());
    },
  }, {});

  const listings = await adapter.search("sony phone");
  assert.equal(listings.length, 1);
  assert.equal(request.url.origin, "https://affiliate-api.flipkart.net");
  assert.equal(request.url.pathname, "/affiliate/1.0/search.json");
  assert.equal(request.url.searchParams.get("query"), "sony phone");
  assert.equal(request.url.searchParams.get("resultCount"), "10");
  assert.equal(request.options.headers["Fk-Affiliate-Id"], "my-affiliate-id");
  assert.equal(request.options.headers["Fk-Affiliate-Token"], "my-token");

  const [listing] = listings;
  assert.equal(listing.product.title, "Sony Xperia Test Phone");
  assert.equal(listing.product.brand, "Sony");
  assert.equal(listing.product.category, "Mobiles");
  assert.equal(listing.product.subcategory, "Handsets");
  assert.deepEqual(listing.product.variant, { size: "128 GB", color: "White" });
  assert.equal(listing.product.imageUrl, "https://img.fkcdn.com/image/phone-800x800.jpeg");
  assert.equal(listing.offer.price, 19999);
  assert.equal(listing.offer.offerPrice, 19999);
  assert.equal(listing.offer.mrp, 24490);
  assert.equal(listing.offer.shipping, 100);
  assert.equal(listing.offer.availability, "in stock");
  assert.equal(listing.offer.updatedAt, null);
  assert.equal(listing.offer.retailer, "Flipkart");
  assert.equal(listing.offer.retailerId, "flipkart");
  assert.match(listing.offer.productUrl, /^https:\/\/dl\.flipkart\.com\/dl\/sony-xperia\/p\/itm123\?pid=MOB123&affid=myaffiliate$/);
  assert.equal(listing.offer.retailerHost, "dl.flipkart.com");
  assert.equal(adapter.status().available, true);
});

test("Flipkart default catalogue queries deduplicate real products", async () => {
  const seenQueries = [];
  const adapter = new FlipkartAffiliateAdapter({
    trackingId: "id",
    token: "token",
    defaultQueries: "mobile,laptop",
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams.get("query");
      seenQueries.push(query);
      return response(payloadFor(query === "mobile" ? "MOBILE1" : "LAPTOP1"));
    },
  }, {});
  const listings = await adapter.search("");
  assert.deepEqual(seenQueries.sort(), ["laptop", "mobile"]);
  assert.equal(listings.length, 2);
  assert.deepEqual(listings.map(({ product }) => product.id).sort(), ["LAPTOP1", "MOBILE1"]);
});

test("Flipkart adapter rejects unsupported URLs and reports HTTP errors", async () => {
  const adapter = new FlipkartAffiliateAdapter({
    trackingId: "id",
    token: "token",
    defaultQueries: "mobile",
    fetchImpl: async () => response({ productInfoList: [] }, { status: 401 }),
  }, {});
  await assert.rejects(() => adapter.search("phone"), /HTTP 401/);
  assert.match(adapter.status().error, /unavailable/);

  const unsafe = new FlipkartAffiliateAdapter({
    trackingId: "id",
    token: "token",
    fetchImpl: async () => response(payloadFor("SAFE", {
      productUrl: "https://evil.example/product",
    })),
  }, {});
  assert.deepEqual(await unsafe.search("phone"), []);
});
