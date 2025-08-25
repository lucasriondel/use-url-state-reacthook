export function defaultUrlDeserialize<T>(raw: string): T {
  const decoded = decodeURIComponent(raw);
  try {
    return JSON.parse(decoded) as T;
  } catch {
    return decoded as unknown as T;
  }
}
