# PriceWise

**Compare Smart. Shop for Less.**

PriceWise is a live-only product price comparison app for Indian shoppers. It displays real listings returned by authorised retailer feeds. It does not include a demo catalogue at runtime, does not scrape retailer websites, does not bypass login/CAPTCHA/anti-bot controls, and does not invent prices, discounts, stock, coupons, reviews, delivery dates or historical prices.

With no source configured, PriceWise shows an explicit setup state with no products and no placeholder prices.

## Requirements

- Node.js 24 or later (`node:sqlite` is used for local price history).
- Flipkart Affiliate API credentials (`Fk-Affiliate-Id` and token), or another authorised JSON feed you are permitted to use.

No npm packages are required.

## Run locally

From this project folder in the VS Code terminal:

```powershell
Copy-Item .env.example .env
npm.cmd start
```

Open the URL printed in the terminal. PriceWise uses port 3000 by default and automatically tries the next available port (up to 20 ports later) if that port is already in use.

For automatic restarts while editing, use `npm.cmd run dev`. Run `npm.cmd run check` for JavaScript syntax checks and `npm.cmd test` for tests.

## Connect Flipkart (live prices)

1. Join the [Flipkart Affiliate Programme](https://affiliate.flipkart.com) and obtain your affiliate ID and token.
2. Open `.env` and set:

   ```dotenv
   FLIPKART_AFFILIATE_ID=your-affiliate-id
   FLIPKART_AFFILIATE_TOKEN=your-affiliate-token
   FLIPKART_DEFAULT_QUERIES=mobile,laptop,shoes,skincare,earbuds,fashion
   ```

3. Restart with `npm.cmd start`, then open `http://localhost:3000`.

Keep the token server-side. Never put credentials in frontend files or commit `.env`.

The adapter calls `https://affiliate-api.flipkart.net/affiliate/1.0/search.json` with the required `Fk-Affiliate-Id` and `Fk-Affiliate-Token` headers. Flipkart limits each search to 10 results. When no query is entered, PriceWise fetches the configured default queries and deduplicates the combined results. Responses are cached for 60 seconds, simultaneous identical searches share one request, outgoing requests are spaced by at least 100 ms, responses are limited to 2 MB, and requests time out after 8 seconds.

The adapter upgrades Flipkart product and image URLs from HTTP to HTTPS and keeps any affiliate parameters supplied by Flipkart. Buy Now is enabled only for an exact HTTPS product URL returned by the source.

## Data behaviour

- Results come only from configured authorised sources. Feed errors or empty responses never fall back to sample data.
- The homepage and deals sections may make several upstream searches. Flipkart's per-query limit and rate limits mean coverage is smaller than a full catalogue.
- An offer is marked **verified in stock** only when the source explicitly reports it as in stock or available and the source or fetch time is within 24 hours. For Flipkart, which does not return a price timestamp, the authorised fetch time is shown as **Fetched from source** and used for freshness.
- Unknown shipping is displayed as unknown rather than assumed free. Coupons, cashback, promotions and delivery estimates appear only when supplied by the source.
- Price history is built only from real observations recorded by this installation. The local SQLite database retains observations for up to one year.

## Pages and features

- Home: hero search, category cards, spotlight product, live deal cards, recently fetched products, retailer coverage and setup/live disclosure.
- Search/results: keyword search, category/brand/retailer filters, minimum/maximum price, minimum discount, offer type, stock status, available-only toggle, sorting, pagination, skeletons, empty states and load more.
- Product detail: exact offer comparison, price range, discount, shipping, coupon/cashback/promotion details when supplied, stock verification, recorded price history and Buy Now actions.
- Retailer coverage: requested retailers with integration status, required credential names, documentation links and notes. Retailers without credentials are shown as awaiting access, not falsely connected.
- About and legal pages: source status, data-mode explanation, privacy and terms starter disclosures.

## Optional authorised JSON feeds

You can also connect another source you are authorised to use by setting `PRICEWISE_FEEDS` in `.env` to a JSON array. Each entry needs a unique `id`, display `name`, HTTPS `endpoint` and `retailerDomains` allowlist. Optional fields are `retailerId`, `retailerName`, `authEnv` (environment variable sent as a Bearer token) and `requestIntervalMs`.

```dotenv
PRICEWISE_FEEDS=[{"id":"partner-feed","name":"Partner feed","retailerId":"amazon-in","retailerName":"Amazon India","endpoint":"https://api.partner.example/products","retailerDomains":["amazon.in"],"authEnv":"PARTNER_FEED_TOKEN","requestIntervalMs":1000}]
PARTNER_FEED_TOKEN=replace-with-your-secret
```

The endpoint receives the search as a `q` query parameter and must return:

```json
{
  "updatedAt": "<source-generated ISO-8601 timestamp>",
  "listings": [
    {
      "product": {
        "id": "<source product id>",
        "matchKey": "<optional verified cross-retailer canonical id>",
        "title": "<source product title>",
        "brand": "<source brand>",
        "category": "<source category>",
        "subcategory": "<optional source subcategory>",
        "variant": { "size": "<exact size>", "colour": "<exact colour>" },
        "identifiers": { "gtin": "<GTIN, EAN, UPC, ISBN or MPN>" },
        "imageUrl": "<authorised HTTPS product image URL>",
        "imageUrls": ["<optional authorised HTTPS image URL>"]
      },
      "offer": {
        "retailer": "<retailer display name>",
        "price": 0,
        "currency": "INR",
        "mrp": 0,
        "offerPrice": 0,
        "shipping": 0,
        "coupon": "<source-provided coupon details>",
        "promotion": "<source-provided promotion details>",
        "cashback": "<source-provided cashback details>",
        "deliveryEstimate": "<source-provided estimate>",
        "availability": "<source-provided stock status>",
        "updatedAt": "<source-generated ISO-8601 price timestamp>",
        "productUrl": "https://shop.partner.example/exact-product"
      }
    }
  ]
}
```

`price` must be a positive INR amount. Optional `mrp` and `shipping` are numeric INR amounts. Listings with a missing or invalid exact product URL, non-HTTPS product URL, invalid price or non-INR currency are rejected. Purchase links must use a host in that feed's `retailerDomains` (subdomains allowed). Image URLs must use HTTPS. Responses are limited to 2 MB and 500 listings, requests time out after 8 seconds, and results are cached for 30 seconds per query.

Product offers are combined only when the source provides the same GTIN/EAN/UPC/ISBN or an explicit `matchKey`, with matching variant data. `matchKey` must only be set by a source mapping that has verified the products are equivalent. Otherwise listings stay separate.

## Retailer coverage

PriceWise includes a registry for:

Amazon India, Flipkart, Myntra, Nykaa, DeoDap, Meesho, AJIO, Tata CLiQ, Croma, Reliance Digital, Vijay Sales, BigBasket, JioMart, Blinkit, and brand websites.

Flipkart is connected when its affiliate credentials are present. The other retailers remain awaiting credentials/access until the operator configures a compatible authorised feed. Do not claim a retailer is connected until its feed has been authorised and verified.

## Project structure

- `server.js` — raw Node HTTP server, API routing, static serving, security headers, rate limiting, SQLite price history and retailer status reporting.
- `src/catalog.js` — normalized discount, total-cost, filtering, sorting, pagination, facet and deals logic.
- `src/retailers.js` — retailer registry, credential metadata and connection status.
- `src/integrations/flipkart.js` — Flipkart Affiliate API 1.0 adapter, normalisation, caching, rate limiting and status.
- `src/integrations/json-feed.js` — optional generic authorised JSON feed adapter.
- `src/demo-catalog.js` — legacy sample fixture used only by unit tests; it is not loaded by the server.
- `public/index.html`, `public/app.js`, `public/styles.css` — responsive browser app, routes, comparison UI and interactions.
- `test/` — Node test-runner coverage for the Flipkart adapter, generic feed adapter, catalog logic and legacy fixture.
- `data/pricewise.sqlite` — created on first run; retains source-backed observations for up to one year.

Saved and recently viewed product keys are stored in the user's browser.

## Backend endpoints

- `GET /api/health` and `GET /api/status` — server health, current data mode, configured feed status, retailer summary and required setup variables.
- `GET /api/search?q=<query>` — searches the active sources. With no query, live sources use their configured default queries. `GET /api/products?q=<query>` is an alias.
- `GET /api/products/<key>` — returns one normalised product with all offers.
- `GET /api/products/<key>/offers` — returns the product and its offers.
- `GET /api/categories`, `/api/brands`, `/api/retailers` — facets and retailer coverage from the active catalogue.
- `GET /api/deals` — recently verified in-stock offers with source-provided discounts, coupons, cashback or recorded price drops.
- `GET /api/history?key=<product-key>` and `GET /api/price-history/<key>` — stored source-backed observations and recorded min/max/count.

Search supports `category`, `brand`, `retailer`, `minPrice`, `maxPrice`, `minDiscount`, `offerType`, `stock`, `available`, `sort`, `page` and `pageSize`. `offerType` values are `discount`, `regular`, `coupon`, `cashback` and `price-drop`. `stock` values are `verified`, `in`, `out` and `unknown`. Sorts include `relevance`, `price-asc`, `price-desc`, `discount`, `name`, `updated` and `verified`. Page size is capped at 250.

## Limitations and safety

- Flipkart Affiliate API access must be approved by Flipkart. Without valid credentials the app stays in its setup state.
- The API returns at most 10 products per query and is subject to Flipkart's rate limits and terms.
- The app does not scrape or automate retailer sites, and does not bypass authentication, CAPTCHA or anti-bot systems.
- Prices, availability, delivery estimates, coupons and cashback are shown only when supplied by an authorised source. Confirm the final price on the retailer's page before purchase.
- The included privacy and terms pages are starter disclosures. Update them with the operator's legal entity, contact details, privacy practices and jurisdiction-specific requirements before public deployment.
- Use HTTPS at the deployment edge, restrict access to `.env` and the SQLite database, and monitor server logs and source errors.
- For multiple application instances or large feeds, replace the local SQLite history and in-memory rate limiter with infrastructure suited to the deployment.
