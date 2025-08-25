import * as React from "react";
import { DeepPartial, UrlApiActions, UrlStateOptions } from "./types";
import { mergeWithDefaults } from "./utils/mergeWithDefaults";
import { parseFromUrl } from "./utils/parseFromUrl";
import { resolveDefaults } from "./utils/resolveDefaults";
import { writeToUrl } from "./utils/writeToUrl";

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
    const persistedPartial = parseFromUrl<T>(namespace as string, codecs);
    const sanitized = sanitize ? sanitize(persistedPartial) : persistedPartial;
    return mergeWithDefaults<T>(sanitized as Partial<T>, defaults);
  }, [namespace, codecs, defaults, sanitize]);

  const [state, setState] = React.useState<T>(readInitial);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const scheduleWriteRef = React.useRef<number | null>(null);
  const pendingWriteRef = React.useRef<Partial<T> | null>(null);

  const flushWrite = React.useCallback(
    (partial: Partial<T>, source: "set" | "patch") => {
      const payload = sanitize ? sanitize(partial) : partial;
      writeToUrl<T>(
        payload as Partial<T>,
        namespace as string,
        codecs,
        history
      );
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
      const partial = parseFromUrl<T>(namespace as string, codecs);
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
