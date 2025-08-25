import * as React from "react";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type Codec<V> = {
  parse: (raw: string) => V;
  format: (value: V) => string;
};

export type UrlStateOptions<T extends Record<string, unknown>> = {
  codecs?: Partial<{ [K in keyof T]: Codec<NonNullable<T[K]>> }>;
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
