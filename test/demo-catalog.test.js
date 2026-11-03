import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_CATEGORIES, DEMO_PRODUCTS, searchDemoProducts } from "../src/demo-catalog.js";

test("demo catalogue covers the required extensible categories", () => {
  assert.ok(DEMO_PRODUCTS.length >= 40);
  const categories = new Set(DEMO_PRODUCTS.map(({ product }) => product.category));
  for (const category of [
    "Skincare",
    "Cosmetics",
    "Clothing",
    "Accessories",
    "Electronics",
    "Footwear",
    "Mobiles",
    "Computers",
    "Kitchen Appliances",
    "Home Appliances",
    "Groceries",
    "Personal Care",
    "Furniture",
    "Toys",
    "Household",
  ]) {
    assert.ok(categories.has(category), `missing ${category} samples`);
  }
  assert.deepEqual(DEMO_CATEGORIES, [...categories].sort());

  for (const item of DEMO_PRODUCTS) {
    assert.ok(item.product.title);
    assert.ok(item.product.brand);
    assert.ok(item.product.category);
    assert.match(item.product.imageUrl, /^https:\/\/images\.unsplash\.com\//);
    assert.equal(item.isSampleData, true);
    assert.ok(item.offers.length > 0);
    for (const offer of item.offers) {
      assert.ok(offer.price > 0);
      assert.equal(offer.currency, "INR");
      assert.match(offer.retailer, /^Demo Retailer/);
      assert.equal(offer.retailerId, "demo");
      assert.equal(offer.isSampleData, true);
      assert.equal(offer.isVerifiedAvailable, false);
      assert.equal(offer.productUrl, null);
      assert.equal(offer.updatedAt, null);
      assert.equal(offer.retailerHost, null);
      assert.ok(offer.mrp === null || offer.mrp > offer.price);
    }
  }
});

test("demo search matches product names, brands, categories and subcategories", () => {
  assert.ok(searchDemoProducts("niacinamide").some(({ product }) => product.title.includes("Niacinamide")));
  assert.ok(searchDemoProducts("Maybelline").some(({ product }) => product.brand === "Maybelline"));
  assert.ok(searchDemoProducts("Footwear").every(({ product }) => product.category === "Footwear"));
  assert.ok(searchDemoProducts("cookware").some(({ product }) => product.subcategory === "Cookware"));
  assert.ok(searchDemoProducts("Furniture").every(({ product }) => product.category === "Furniture"));
  assert.equal(searchDemoProducts("no-such-sample").length, 0);
  assert.equal(searchDemoProducts(" ").length, DEMO_PRODUCTS.length);
});

test("multi-offer sample comparisons identify the actual lowest offer", () => {
  const item = DEMO_PRODUCTS.find(({ product }) => product.id === "sample-android-smartphone");
  assert.ok(item);
  const cheapest = Math.min(...item.offers.map(({ price }) => price));
  assert.equal(item.offers[0].price, cheapest);
  assert.equal(item.cheapestOfferId, item.offers[0].id);
  assert.equal(item.cheapestOfferId, "sample:android-smartphone:1");
});
