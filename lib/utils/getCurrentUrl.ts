import { isBrowser } from "./isBrowser";

export function getCurrentUrl(): URL | undefined {
  if (!isBrowser()) return undefined;
  try {
    return new URL(window.location.href);
  } catch {
    return undefined;
  }
}
