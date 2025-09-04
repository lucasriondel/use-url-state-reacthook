export function defaultUrlDeserialize<T>(raw: string): T {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch (error) {
    // Handle URI malformed errors by returning the raw string
    console.warn(`Failed to decode URI component "${raw}":`, error);
    decoded = raw;
  }
  
  try {
    return JSON.parse(decoded) as T;
  } catch {
    return decoded as unknown as T;
  }
}
