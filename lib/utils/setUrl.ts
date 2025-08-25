import { isBrowser } from "./isBrowser";

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
