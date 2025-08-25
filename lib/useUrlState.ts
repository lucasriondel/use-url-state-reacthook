import * as React from "react";
import { DeepPartial, UrlApiActions, UrlStateOptions } from "./types";
import { mergeWithDefaults } from "./utils/mergeWithDefaults";
import { parseFromUrl } from "./utils/parseFromUrl";
import { resolveDefaults } from "./utils/resolveDefaults";
import { writeToUrl } from "./utils/writeToUrl";

/**
 * A powerful React hook for managing state synchronized with URL search parameters.
 *
 * This hook provides a complete solution for persisting React state in the URL, enabling
 * shareable URLs and browser history integration. It automatically serializes/deserializes
 * state to/from URL search parameters and provides a rich API for state management.
 *
 * Key features:
 * - Automatic URL synchronization with debouncing support
 * - Type-safe state management with TypeScript generics
 * - Custom serialization through codecs
 * - Browser history integration (back/forward button support)
 * - Namespace support for multiple hook instances
 * - Sanitization and validation hooks
 *
 * @template T - The shape of the state object. Must extend Record<string, unknown>
 *
 * @param defaultsOption - Default values for the state, can be a static object or a function that returns defaults.
 *                        Used when URL parameters are missing or invalid.
 * @param options - Configuration options for URL state behavior
 * @param options.codecs - Custom serialization/deserialization functions for specific properties.
 *                        By default, values are serialized as strings using JSON.stringify for complex types.
 * @param options.sanitize - Function to validate and transform state data before it's set.
 *                          Useful for data validation, type coercion, or filtering.
 * @param options.onChange - Callback fired whenever the state changes, receives the new state and metadata about the change source.
 * @param options.history - History mode: 'replace' (default) replaces current entry, 'push' creates new history entries.
 * @param options.debounceMs - Debounce delay in milliseconds for URL updates. Useful for preventing excessive URL changes during rapid state updates.
 * @param options.syncOnPopState - Whether to sync state when browser back/forward buttons are used (default: true).
 * @param options.namespace - Optional namespace prefix for URL parameters to avoid conflicts with other hooks or libraries.
 *
 * @returns A tuple containing:
 *   - The current state object with all properties
 *   - An API object with methods for state manipulation:
 *     - `setState`: Standard React setState function for replacing entire state
 *     - `get`: Get the current value of a specific property
 *     - `set`: Set a specific property value (undefined removes it from URL)
 *     - `patch`: Merge partial state changes into current state
 *     - `remove`: Remove specific properties from state and URL
 *     - `clear`: Reset state to empty object and clear all URL parameters
 *
 * @example
 * ```tsx
 * // Basic usage with search filters
 * const [filters, filtersApi] = useUrlState({ search: '', category: 'all' });
 *
 * // Update individual properties
 * filtersApi.set('search', 'react hooks');
 * filtersApi.set('category', 'frontend');
 *
 * // Patch multiple properties at once
 * filtersApi.patch({ search: 'vue', category: 'frontend' });
 *
 * // With custom serialization for complex data
 * const [state, api] = useUrlState({ items: [], settings: {} }, {
 *   codecs: {
 *     items: {
 *       parse: (str) => JSON.parse(str),
 *       format: (items) => JSON.stringify(items)
 *     }
 *   },
 *   debounceMs: 300, // Debounce URL updates
 *   namespace: 'app' // Prefix parameters with 'app_'
 * });
 *
 * // With validation and change tracking
 * const [userPrefs, prefsApi] = useUrlState({ theme: 'light', lang: 'en' }, {
 *   sanitize: (draft) => ({
 *     theme: ['light', 'dark'].includes(draft.theme) ? draft.theme : 'light',
 *     lang: ['en', 'fr', 'es'].includes(draft.lang) ? draft.lang : 'en'
 *   }),
 *   onChange: (newState, { source }) => {
 *     console.log(`State changed from ${source}:`, newState);
 *   }
 * });
 * ```
 */
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
