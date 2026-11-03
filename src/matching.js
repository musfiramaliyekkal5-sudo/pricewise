export const MATCH_IDENTIFIER_KEYS = ["gtin", "ean", "upc", "isbn", "gtin8", "gtin12", "gtin13", "gtin14"];

export function safeText(value, limit = 300) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

export function normalizeIdentifiers(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => typeof value === "string" || typeof value === "number")
      .map(([key, value]) => [key.trim().toLowerCase(), String(value).trim()])
      .filter(([key, value]) => key && value)
      .slice(0, 30),
  );
}

export function normalizeVariant(input) {
  if (typeof input === "string") return safeText(input, 200) || "";
  if (!input || typeof input !== "object" || Array.isArray(input)) return "";
  return Object.entries(input)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => [key.trim().toLowerCase(), String(value).trim()])
    .filter(([key, value]) => key && value)
    .sort(([left], [right]) => left.localeCompare(right));
}

export function variantSignature(variant) {
  const entries = normalizeVariant(variant);
  if (typeof entries === "string") return entries.toLowerCase();
  return entries.map(([key, value]) => `${key}=${value.toLowerCase()}`).join("|");
}

export function primaryIdentifier(identifiers) {
  const normalized = normalizeIdentifiers(identifiers);
  for (const key of MATCH_IDENTIFIER_KEYS) {
    if (normalized[key]) return { key, value: normalized[key] };
  }
  return null;
}

export function buildMatchKey({ sourceId, productId, identifiers, matchKey, variant } = {}) {
  const signature = variantSignature(variant);
  const identifier = primaryIdentifier(identifiers);
  if (identifier) return `id:${identifier.value.toLowerCase()}|${signature}`;
  const supplied = safeText(matchKey, 200);
  if (supplied) return `feed:${supplied.toLowerCase()}|${signature}`;
  const stableId = safeText(productId, 200);
  const source = safeText(sourceId, 100);
  if (!stableId || !source) return null;
  return `source:${source.toLowerCase()}:${stableId.toLowerCase()}|${signature}`;
}
