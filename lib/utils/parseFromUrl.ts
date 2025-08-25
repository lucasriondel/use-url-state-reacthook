import { Codec } from "../types";
import { defaultUrlDeserialize } from "./defaultUrlDeserialize";
import { getCurrentUrl } from "./getCurrentUrl";
import { getSearchParams } from "./getSearchParams";

type CodecsMap<T> = Partial<{ [K in keyof T]: Codec<NonNullable<T[K]>> }>;

export function parseFromUrl<T extends Record<string, unknown>>(
  namespace: string | undefined,
  codecs: CodecsMap<T>
): Partial<T> {
  const url = getCurrentUrl();
  if (!url) return {};
  const params = getSearchParams(url);
  const out: Record<string, unknown> = {};
  const entries = Array.from(params.entries());
  for (const [k, v] of entries) {
    const key = namespace
      ? k.startsWith(`${namespace}.`)
        ? k.slice(namespace.length + 1)
        : undefined
      : k;
    if (!key) continue;
    const codec = codecs[key as keyof T];
    if (codec) {
      try {
        out[key] = codec.parse(v);
      } catch {
        // ignore parse error
      }
    } else {
      out[key] = defaultUrlDeserialize<unknown>(v);
    }
  }
  return out as Partial<T>;
}
