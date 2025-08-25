export function defaultUrlSerialize<T>(value: T): string {
  if (typeof value === "string") {
    return encodeURIComponent(value as unknown as string);
  }
  return encodeURIComponent(JSON.stringify(value));
}
