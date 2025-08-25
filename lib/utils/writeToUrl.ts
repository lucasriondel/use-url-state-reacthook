import { Codec } from "../types";
import { buildParamName } from "./buildParamName";
import { defaultUrlSerialize } from "./defaultUrlSerialize";
import { getCurrentUrl } from "./getCurrentUrl";
import { getSearchParams } from "./getSearchParams";
import { setUrl } from "./setUrl";

type CodecsMap<T> = Partial<{ [K in keyof T]: Codec<NonNullable<T[K]>> }>;

export function writeToUrl<T extends Record<string, unknown>>(
  next: Partial<T>,
  namespace: string | undefined,
  codecs: CodecsMap<T>,
  history: "replace" | "push"
): void {
  const url = getCurrentUrl();
  if (!url) return;
  const params = getSearchParams(url);

  if (namespace) {
    for (const key of Array.from(params.keys())) {
      if (key.startsWith(`${namespace}.`)) params.delete(key);
    }
  }

  Object.entries(next).forEach(([k, value]) => {
    const paramKey = buildParamName(namespace, k);
    if (value === undefined) {
      params.delete(paramKey);
      return;
    }
    const codec = codecs[k as keyof T];
    const encoded = codec
      ? codec.format(value)
      : defaultUrlSerialize<unknown>(value);
    params.set(paramKey, encoded);
  });

  url.search = params.toString();
  setUrl(url, history);
}
