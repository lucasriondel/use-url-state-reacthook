/**
 * Serializes a value for use with URLSearchParams without double encoding.
 * Unlike defaultUrlSerialize, this doesn't use encodeURIComponent since
 * URLSearchParams.set() will handle encoding automatically.
 */
export function urlSerializeForParams<T>(value: T): string {
  if (typeof value === "string") {
    return value; // Let URLSearchParams handle encoding
  }
  return JSON.stringify(value); // Let URLSearchParams handle encoding
}