export function getSearchParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.search);
}
