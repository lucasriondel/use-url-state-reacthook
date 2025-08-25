import * as React from "react";
import { DeepPartial, UrlStateOptions } from "./types";
import { useUrlState } from "./useUrlState";

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
