import * as React from "react";
import {
  defaultUrlDeserialize,
  defaultUrlSerialize,
  getCurrentUrl,
  getSearchParams,
  setUrl,
} from "./urlStateUtils";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type Codec<V> = {
  parse: (raw: string) => V;
  format: (value: V) => string;
};

type CodecsMap<T> = Partial<{ [K in keyof T]: Codec<NonNullable<T[K]>> }>;

export type UrlStateOptions<T extends Record<string, unknown>> = {
  codecs?: CodecsMap<T>;
  sanitize?: (draft: DeepPartial<T>) => DeepPartial<T>;
  onChange?: (next: T, meta: { source: "set" | "patch" | "external" }) => void;
  history?: "replace" | "push";
  debounceMs?: number;
  syncOnPopState?: boolean;
  namespace?: string;
};

export type UrlApiActions<T extends Record<string, unknown>> = {
  setState: React.Dispatch<React.SetStateAction<T>>;
  get: <K extends keyof T>(key: K) => T[K] | undefined;
  set: <K extends keyof T>(key: K, value: T[K] | undefined) => void;
  patch: (partial: DeepPartial<T>) => void;
  remove: <K extends keyof T>(...keys: K[]) => void;
  clear: () => void;
};

function resolveDefaults<T>(
  defaults?: DeepPartial<T> | (() => DeepPartial<T>)
): DeepPartial<T> {
  if (!defaults) return {};
  return typeof defaults === "function"
    ? defaults()
    : defaults;
}

function mergeWithDefaults<T extends Record<string, unknown>>(
  persisted: Partial<T>,
  defaults: DeepPartial<T>
): T {
  return Object.assign({}, defaults, persisted) as T;
}

function buildParamName(namespace: string | undefined, key: string): string {
  return namespace ? `${namespace}.${key}` : key;
}

function parseFromUrl<T extends Record<string, unknown>>(
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
  return out;
}

function writeToUrl<T extends Record<string, unknown>>(
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

export function useUrlState<T extends Record<string, unknown>>(
  defaultsOption?: DeepPartial<T> | (() => DeepPartial<T>),
  options: UrlStateOptions<T> = {}
): [T, UrlApiActions<T>] {
  const {
    codecs = {},
    sanitize,
    onChange,
    history = "replace",
    debounceMs,
    syncOnPopState = true,
    namespace,
  } = options;

  const defaults = React.useMemo(
    () => resolveDefaults<T>(defaultsOption),
    [defaultsOption]
  );

  const readInitial = React.useCallback((): T => {
    const persistedPartial = parseFromUrl<T>(
      namespace as string,
      codecs
    );
    const sanitized = sanitize
      ? sanitize(persistedPartial)
      : persistedPartial;
    return mergeWithDefaults<T>(sanitized, defaults);
  }, [namespace, codecs, defaults, sanitize]);

  const [state, setState] = React.useState<T>(readInitial);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const scheduleWriteRef = React.useRef<number | null>(null);
  const pendingWriteRef = React.useRef<Partial<T> | null>(null);

  const flushWrite = React.useCallback(
    (partial: Partial<T>, source: "set" | "patch") => {
      const payload = sanitize ? sanitize(partial) : partial;
      writeToUrl<T>(payload, namespace as string, codecs, history);
      const effectiveNext = (() => {
        const base = { ...stateRef.current } as Record<string, unknown>;
        (Object.keys(payload) as Array<keyof T>).forEach((k) => {
          const v = payload[k as keyof T] as unknown;
          if (v === undefined) {
            delete base[k as string];
          } else {
            base[k as string] = v;
          }
        });
        return base as T;
      })();
      onChange?.(effectiveNext, { source });
    },
    [namespace, codecs, history, onChange, sanitize]
  );

  const scheduleWrite = React.useCallback(
    (partial: Partial<T>, source: "set" | "patch") => {
      if (!debounceMs || debounceMs <= 0) {
        flushWrite(partial, source);
        return;
      }
      pendingWriteRef.current = pendingWriteRef.current
        ? { ...pendingWriteRef.current, ...partial }
        : partial;
      if (scheduleWriteRef.current)
        window.clearTimeout(scheduleWriteRef.current);
      scheduleWriteRef.current = window.setTimeout(() => {
        const payload = pendingWriteRef.current || {};
        pendingWriteRef.current = null;
        flushWrite(payload, source);
      }, debounceMs);
    },
    [debounceMs, flushWrite]
  );

  React.useEffect(() => {
    if (!syncOnPopState) return;
    const handler = () => {
      const partial = parseFromUrl<T>(
        namespace as string,
        codecs
      );
      const sanitized = sanitize ? sanitize(partial) : partial;
      const current = { ...stateRef.current } as Record<string, unknown>;
      (Object.keys(sanitized) as Array<keyof T>).forEach((k) => {
        const v = sanitized[k];
        if (v === undefined) delete current[k as string];
        else current[k as string] = v as unknown;
      });
      const next = current as T;
      setState(next);
      onChange?.(next, { source: "external" });
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [onChange, syncOnPopState, namespace, codecs, sanitize]);

  const api: UrlApiActions<T> = React.useMemo(
    () => ({
      setState: (updater) => {
        setState((prev) => {
          const next =
            typeof updater === "function"
              ? (updater as (p: T) => T)(prev)
              : updater;
          const toPersist: Partial<T> = {};
          (Object.keys(next) as Array<keyof T>).forEach((k) => {
            const v = next[k];
            if (v === undefined) return;
            (toPersist as Record<string, unknown>)[k as string] = v as unknown;
          });
          scheduleWrite(toPersist, "set");
          return next;
        });
      },
      get: (key) => stateRef.current[key],
      set: (key, value) => {
        setState((prev) => {
          const next: T = { ...prev };
          const dict = next as unknown as Record<string, unknown>;
          if (value === undefined) delete dict[key as string];
          else dict[key as string] = value as unknown;
          scheduleWrite({ [key]: value } as unknown as Partial<T>, "patch");
          return next;
        });
      },
      patch: (partial) => {
        setState((prev) => {
          const next = { ...prev, ...(partial as Partial<T>) } as T;
          scheduleWrite(partial as Partial<T>, "patch");
          return next;
        });
      },
      remove: (...keys) => {
        setState((prev) => {
          const next: T = { ...prev };
          const dict = next as unknown as Record<string, unknown>;
          const persist: Partial<T> = {};
          for (const k of keys) {
            delete dict[k as string];
            (persist as Record<string, unknown>)[k as string] = undefined;
          }
          scheduleWrite(persist, "patch");
          return next;
        });
      },
      clear: () => {
        setState(() => {
          scheduleWrite({}, "patch");
          return {} as T;
        });
      },
    }),
    [scheduleWrite]
  );

  return [state, api];
}

export function useUrlProp<
  T extends Record<string, unknown>,
  K extends keyof T
>(
  key: K,
  defaultsOption?: DeepPartial<T> | (() => DeepPartial<T>),
  options: UrlStateOptions<T> = {}
): [T[K] | undefined, (value: T[K] | undefined) => void] {
  const [state, api] = useUrlState<T>(defaultsOption, options);
  const value = state[key];
  const setValue = React.useCallback(
    (v: T[K] | undefined) => api.set(key, v),
    [api, key]
  );
  return [value, setValue];
}
