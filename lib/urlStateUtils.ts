export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function getCurrentUrl(): URL | undefined {
  if (!isBrowser()) return undefined;
  try {
    return new URL(window.location.href);
  } catch {
    return undefined;
  }
}

export function getSearchParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.search);
}

export function setUrl(url: URL, method: "replace" | "push" = "replace"): void {
  if (!isBrowser()) return;
  const newUrl = url.toString();
  try {
    if (method === "replace") {
      window.history.replaceState(window.history.state, "", newUrl);
      try {
        Object.defineProperty(window, "location", {
          value: new URL(newUrl),
          writable: true,
        });
      } catch {
        /* noop */
      }
    } else {
      window.history.pushState(window.history.state, "", newUrl);
      try {
        Object.defineProperty(window, "location", {
          value: new URL(newUrl),
          writable: true,
        });
      } catch {
        /* noop */
      }
    }
  } catch {
    (window as unknown as { location: { href: string } }).location.href =
      newUrl;
  }
}

export function defaultUrlSerialize<T>(value: T): string {
  if (typeof value === "string") {
    return encodeURIComponent(value as unknown as string);
  }
  return encodeURIComponent(JSON.stringify(value));
}

export function defaultUrlDeserialize<T>(raw: string): T {
  const decoded = decodeURIComponent(raw);
  try {
    return JSON.parse(decoded) as T;
  } catch {
    return decoded as unknown as T;
  }
}
