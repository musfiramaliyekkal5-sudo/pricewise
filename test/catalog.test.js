import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_PRODUCTS } from "../src/demo-catalog.js";
import {
  computeFacets,
  decorateProduct,
  discountPercent,
  filterProducts,
  offerTotal,
  paginateProducts,
  selectDeals,
  sortProducts,
} from "../src/catalog.js";

const products = DEMO_PRODUCTS.map((item) => decorateProduct(item));

test("discounts are calculated only from a valid MRP above the selling price", () => {
  assert.equal(discountPercent({ price: 800, mrp: 1000 }), 20);
  assert.equal(discountPercent({ price: 1000, mrp: 1000 }), 0);
  assert.equal(discountPercent({ price: 1200, mrp: 1000 }), 0);
  assert.equal(discountPercent({ price: 800, mrp: null }), 0);
  assert.equal(discountPercent({ price: 0, mrp: 1000 }), 0);
});

test("total cost includes known shipping but does not invent unknown shipping", () => {
  assert.equal(offerTotal({ price: 500, shipping: 40 }), 540);
  assert.equal(offerTotal({ price: 500, shipping: null }), 500);
  assert.equal(offerTotal({ price: 500 }), 500);
});

test("products are decorated with the lowest eligible offer and discount metrics", () => {
  const item = products.find(({ product }) => product.id === "sample-android-smartphone");
  assert.ok(item);
  assert.equal(item.lowestPrice, 19499);
  assert.ok(item.maxDiscountPercent > 0);
  assert.equal(item.cheapestOfferId, item.offers[0].id);
  assert.equal(item.offers[0].isVerifiedAvailable, false);
  assert.equal(item.offerCount, 3);
});

test("filters narrow offers without merging unrelated products", () => {
  const byRetailer = filterProducts(products, { retailer: "Demo Retailer B" });
  assert.ok(byRetailer.length > 0);
  for (const item of byRetailer) {
    assert.ok(item.offers.every((offer) => offer.retailer === "Demo Retailer B"));
  }

  const discounted = filterProducts(products, { offerType: "discount", minDiscount: 15 });
  assert.ok(discounted.length > 0);
  for (const item of discounted) {
    assert.ok(item.maxDiscountPercent >= 15);
  }

  const inRange = filterProducts(products, { minPrice: 500, maxPrice: 800 });
  assert.ok(inRange.length > 0);
  for (const item of inRange) {
    assert.ok(item.offers.every((offer) => offer.price >= 500 && offer.price <= 800));
  }
});

test("sorting, pagination, facets and deals operate on normalised products", () => {
  const sorted = sortProducts(products, "price-asc");
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok(sorted[index - 1].lowestPrice <= sorted[index].lowestPrice);
  }

  const paged = paginateProducts(products, 1, 5);
  assert.equal(paged.products.length, 5);
  assert.equal(paged.pagination.total, products.length);
  assert.equal(paged.pagination.hasNextPage, true);

  const facets = computeFacets(products);
  assert.ok(facets.categories.includes("Groceries"));
  assert.ok(facets.brands.includes("Samsung"));
  assert.ok(facets.retailers.includes("Demo Retailer A"));
  assert.ok(facets.categoryCounts.Groceries >= 1);

  const deals = selectDeals(products, { mode: "demo" });
  assert.ok(deals.length > 0);
  assert.ok(deals.every((item) => item.maxDiscountPercent > 0 || item.hasCoupon || item.hasCashback || item.hasPriceDrop));
  assert.equal(selectDeals(products, { mode: "live" }).length, 0);
});
