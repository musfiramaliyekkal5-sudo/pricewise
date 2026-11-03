import { createFlipkartFeed } from "./flipkart.js";
import { parseFeedDefinitions } from "./json-feed.js";

export function createConnectors(env = process.env) {
  return [
    createFlipkartFeed(env),
    ...parseFeedDefinitions(env.PRICEWISE_FEEDS || "[]", env),
  ];
}

export function configuredConnectors(connectors = []) {
  return connectors.filter((connector) => connector.status().configured);
}
