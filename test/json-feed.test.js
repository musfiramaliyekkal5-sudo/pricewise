import assert from "node:assert/strict";
import { test } from "node:test";
import { JsonFeedAdapter } from "../src/integrations/json-feed.js";

test("normalizes authorized INR offers and rejects unsupported product data", async (context) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let authorizationHeader;
  const updatedAt = new Date().toISOString();
  globalThis.fetch = async (url, options) => {
    calls += 1;
    authorizationHeader = options.headers.Authorization;
    assert.ok(["shoe", "absent"].includes(new URL(url).searchParams.get("q")));
    return new Response(JSON.stringify({
      updatedAt,
      listings: [
        {
          product: {
            id: "source-item-1",
            title: "Sourced running shoe",
            brand: "Source brand",
            category: "Footwear",
            variant: { size: "7", colour: "Black" },
            identifiers: { gtin: "1234567890123" },
            imageUrl: "https://cdn.example/shoe.jpg",
          },
          offer: {
            retailer: "Authorized store",
            price: 499,
            currency: "INR",
            mrp: 799,
            shipping: null,
            offerPrice: 479,
            coupon: "SAVE20",
            promotion: "Source-provided promotion",
            cashback: 25,
            deliveryEstimate: "2-4 days",
            availability: "In stock",
            updatedAt,
            productUrl: "https://shop.example/products/1",
          },
        },
        {
          product: { id: "source-item-2", title: "Unapproved link" },
          offer: {
            retailer: "Unapproved store",
            price: 499,
            currency: "INR",
            productUrl: "https://other.example/item",
          },
        },
        {
          product: { id: "source-item-3", title: "Wrong currency" },
          offer: { price: 10, currency: "USD", productUrl: "https://shop.example/item" },
        },
        {
          product: { id: "source-item-4", title: "Missing currency" },
          offer: { price: 10, productUrl: "https://shop.example/item" },
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const adapter = new JsonFeedAdapter({
    id: "test-feed",
    name: "Test feed",
    endpoint: "https://partner.example/products",
    retailerDomains: ["shop.example"],
    authEnv: "TEST_FEED_TOKEN",
  }, { TEST_FEED_TOKEN: "test-token" });

  const listings = await adapter.search("shoe");
  assert.equal(listings.length, 1);
  assert.equal(listings[0].offer.price, 499);
  assert.equal(listings[0].offer.retailer, "Authorized store");
  assert.equal(listings[0].offer.shipping, null);
  assert.equal(listings[0].offer.mrp, 799);
  assert.equal(listings[0].offer.offerPrice, 479);
  assert.equal(listings[0].offer.coupon, "SAVE20");
  assert.equal(listings[0].offer.promotion, "Source-provided promotion");
  assert.equal(listings[0].offer.cashback, 25);
  assert.equal(listings[0].offer.deliveryEstimate, "2-4 days");
  assert.equal(listings[0].offer.productUrl, "https://shop.example/products/1");
  assert.equal(new URL(listings[0].offer.productUrl).origin, "https://shop.example");
  assert.equal(listings[0].product.imageUrl, "https://cdn.example/shoe.jpg");
  assert.match(listings[0].matchKey, /colour=black\|size=7/);
  assert.equal(authorizationHeader.startsWith("Bearer "), true);
  assert.equal((await adapter.search("shoe")).length, 1);
  assert.equal(calls, 1, "same-query results should use the short cache");
  assert.equal((await adapter.search("absent")).length, 0);
  assert.equal(calls, 2, "different queries must make their own feed request");
});

test("coalesces simultaneous feed calls and reports missing credentials", async (context) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(JSON.stringify({ listings: [] }), { status: 200 });
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const adapter = new JsonFeedAdapter({
    id: "public-feed",
    name: "Public feed",
    endpoint: "https://partner.example/products",
    retailerDomains: ["shop.example"],
    requestIntervalMs: 0,
  }, {});
  const [first, second] = await Promise.all([adapter.search("shoe"), adapter.search("shoe")]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(adapter.status().available, true);

  const protectedAdapter = new JsonFeedAdapter({
    id: "protected-feed",
    name: "Protected feed",
    endpoint: "https://partner.example/products",
    retailerDomains: ["shop.example"],
    authEnv: "MISSING_FEED_TOKEN",
    requestIntervalMs: 0,
  }, {});
  await assert.rejects(protectedAdapter.search("shoe"), /credential environment variable/);
  assert.equal(protectedAdapter.status().available, null);
  assert.equal(protectedAdapter.status().error, "Feed unavailable; check server logs.");
  assert.equal(calls, 1, "a missing credential must fail before making an upstream request");
});
