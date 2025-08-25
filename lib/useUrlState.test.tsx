import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUrlProp, useUrlState } from "./useUrlState";

function setWindowLocation(href: string) {
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
  });
}

describe("useUrlState", () => {
  beforeEach(() => {
    setWindowLocation("https://example.com/");
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  });

  describe("defaults", () => {
    it("initializes with defaults when no URL params", () => {
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number }>(
          { q: "", page: 1 },
          {
            namespace: "users",
          }
        )
      );
      expect(result.current[0]).toEqual({ q: "", page: 1 });
    });

    it("merges defaults with partial URL state", () => {
      setWindowLocation("https://example.com/?users.page=7");
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number; sort?: string }>(
          { q: "", page: 1, sort: "asc" },
          {
            namespace: "users",
            codecs: {
              page: { parse: (s) => Number(s), format: (n) => String(n) },
            },
          }
        )
      );
      expect(result.current[0]).toEqual({ q: "", page: 7, sort: "asc" });
    });
  });

  describe("codecs", () => {
    it("reads typed values via codecs", () => {
      setWindowLocation("https://example.com/?users.q=john&users.page=2");
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number }>(
          { q: "", page: 1 },
          {
            namespace: "users",
            codecs: {
              page: { parse: (s) => Number(s), format: (n) => String(n) },
            },
          }
        )
      );
      expect(result.current[0]).toEqual({ q: "john", page: 2 });
    });

    it("supports arrays/booleans codecs", () => {
      const { result } = renderHook(() =>
        useUrlState<{ flags?: boolean; tags?: string[] }>(undefined, {
          namespace: "a",
          codecs: {
            flags: { parse: (s) => s === "true", format: (v) => String(v) },
            tags: {
              parse: (s) => (s ? s.split("|") : []),
              format: (arr) => arr.join("|"),
            },
          },
        })
      );
      act(() => result.current[1].patch({ flags: true, tags: ["x", "y"] }));
      const sp = new URL(window.location.href).searchParams;
      expect(sp.get("a.flags")).toBe("true");
      expect(sp.get("a.tags")).toBe("x|y");
    });
  });

  describe("sanitize", () => {
    it("sanitizes persisted partials before merge", () => {
      setWindowLocation("https://example.com/?users.page=0&users.q= ");
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number }>(
          { q: "", page: 1 },
          {
            namespace: "users",
            sanitize: (p) => ({
              ...p,
              page: Math.max(1, Number(p.page || 0)),
              q: (p.q as string)?.trim() || "",
            }),
          }
        )
      );
      expect(result.current[0]).toEqual({ q: "", page: 1 });
    });
  });

  describe("onChange", () => {
    it("fires with correct state for set, patch and external", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number }>(
          { q: "", page: 1 },
          { namespace: "users", onChange }
        )
      );
      act(() => result.current[1].set("q", "abc"));
      act(() => result.current[1].patch({ page: 3 }));
      act(() => {
        setWindowLocation("https://example.com/?users.q=xyz");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      const states = onChange.mock.calls.map((c) => c[0]);
      const sources = onChange.mock.calls.map((c) => c[1].source);
      expect(states[0]).toEqual({ q: "abc", page: 1 });
      expect(states[1]).toEqual({ q: "abc", page: 3 });
      expect(states[2]).toEqual({ q: "xyz", page: 3 });
      expect(sources).toEqual(["patch", "patch", "external"]);
    });
  });

  describe("mutations", () => {
    it("set/remove/patch/setState reflect in URL", () => {
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number; sort?: string }>(
          { q: "", page: 1, sort: "asc" },
          {
            namespace: "users",
            codecs: {
              page: { parse: (s) => Number(s) || 0, format: (n) => String(n) },
            },
          }
        )
      );
      act(() => result.current[1].set("q", "doe"));
      expect(new URL(window.location.href).searchParams.get("users.q")).toBe(
        "doe"
      );
      act(() => result.current[1].remove("q"));
      expect(
        new URL(window.location.href).searchParams.get("users.q")
      ).toBeNull();
      act(() => result.current[1].patch({ page: 3, sort: "desc" }));
      let sp = new URL(window.location.href).searchParams;
      expect(sp.get("users.page")).toBe("3");
      expect(sp.get("users.sort")).toBe("desc");
      act(() => result.current[1].setState({ q: "abc", page: 10 }));
      sp = new URL(window.location.href).searchParams;
      expect(sp.get("users.q")).toBe("abc");
      expect(sp.get("users.page")).toBe("10");
    });

    // single param storage was removed
  });

  // single mode and custom key removed

  describe("namespace", () => {
    it("prefixes params with namespace", () => {
      const { result } = renderHook(() =>
        useUrlState<{ q?: string }>(undefined, { namespace: "ns" })
      );
      act(() => result.current[1].set("q", "val"));
      expect(new URL(window.location.href).searchParams.get("ns.q")).toBe(
        "val"
      );
    });
  });

  describe("history", () => {
    it("replace/push are honored", () => {
      const replaceSpy = vi.spyOn(window.history, "replaceState");
      const pushSpy = vi.spyOn(window.history, "pushState");
      const { result: r1 } = renderHook(() =>
        useUrlState<{ q?: string }>(undefined, {
          namespace: "ns",
          history: "replace",
        })
      );
      act(() => r1.current[1].set("q", "a"));
      expect(replaceSpy).toHaveBeenCalled();
      const { result: r2 } = renderHook(() =>
        useUrlState<{ q?: string }>(undefined, {
          namespace: "ns2",
          history: "push",
        })
      );
      act(() => r2.current[1].set("q", "b"));
      expect(pushSpy).toHaveBeenCalled();
    });
  });

  describe("debounceMs", () => {
    it("debounces writes", () => {
      vi.useFakeTimers();
      const replaceSpy = vi.spyOn(window.history, "replaceState");
      const { result } = renderHook(() =>
        useUrlState<{ q?: string }>(undefined, {
          namespace: "ns",
          debounceMs: 100,
        })
      );
      act(() => result.current[1].set("q", "a"));
      act(() => result.current[1].set("q", "b"));
      expect(replaceSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe("syncOnPopState", () => {
    it("true: syncs current state from URL partials (merge)", () => {
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number }>(
          { q: "", page: 1 },
          { namespace: "users" }
        )
      );
      act(() => {
        setWindowLocation("https://example.com/?users.q=hello&users.page=5");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(result.current[0]).toEqual({ q: "hello", page: 5 });
    });

    it("false: ignores popstate updates", () => {
      const { result } = renderHook(() =>
        useUrlState<{ q?: string }>(undefined, {
          namespace: "ns",
          syncOnPopState: false,
        })
      );
      act(() => {
        setWindowLocation("https://example.com/?ns.q=hmm");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(result.current[0]).toEqual({});
    });
  });

  // sanity check for prop-level helper
  describe("prop hook", () => {
    it("useUrlProp reads and sets a single property", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string; page?: number }, "q">("q", undefined, {
          namespace: "ns",
        })
      );
      const [q, setQ] = result.current;
      expect(q).toBeUndefined();
      act(() => setQ("val"));
      expect(new URL(window.location.href).searchParams.get("ns.q")).toBe(
        "val"
      );
    });
  });

  describe("function-based defaults", () => {
    it("supports function-based defaults", () => {
      const defaultsFn = vi.fn(() => ({ q: "computed", page: 10 }));
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number }>(defaultsFn, {
          namespace: "users",
        })
      );
      expect(defaultsFn).toHaveBeenCalled();
      expect(result.current[0]).toEqual({ q: "computed", page: 10 });
    });
  });

  describe("error handling", () => {
    it("handles codec parse errors gracefully", () => {
      setWindowLocation("https://example.com/?users.page=invalid");
      const { result } = renderHook(() =>
        useUrlState<{ page?: number }>(
          { page: 1 },
          {
            namespace: "users",
            codecs: {
              page: {
                parse: (s) => {
                  const num = Number(s);
                  if (isNaN(num)) throw new Error("Invalid number");
                  return num;
                },
                format: (n) => String(n),
              },
            },
          }
        )
      );
      expect(result.current[0]).toEqual({ page: 1 });
    });

    it("handles URL parsing errors", () => {
      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        value: {
          href: "invalid-url",
        },
        writable: true,
      });
      const { result } = renderHook(() =>
        useUrlState<{ q?: string }>(
          { q: "default" },
          {
            namespace: "users",
          }
        )
      );
      expect(result.current[0]).toEqual({ q: "default" });
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("handles codec format errors by throwing", () => {
      const { result } = renderHook(() =>
        useUrlState<{ data?: object }>(undefined, {
          namespace: "test",
          codecs: {
            data: {
              parse: (s) => JSON.parse(s),
              format: (obj) => {
                if (
                  typeof obj === "object" &&
                  obj !== null &&
                  "circular" in obj
                ) {
                  throw new Error("Cannot serialize circular structure");
                }
                return JSON.stringify(obj);
              },
            },
          },
        })
      );

      const circularObj: any = { name: "test" };
      circularObj.circular = circularObj;

      expect(() => {
        act(() => result.current[1].set("data", circularObj));
      }).toThrow("Cannot serialize circular structure");
    });
  });

  describe("complex scenarios", () => {
    it("handles mixed parameter updates correctly", () => {
      setWindowLocation(
        "https://example.com/?users.q=initial&other.param=keep"
      );
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number }>(
          { q: "", page: 1 },
          {
            namespace: "users",
            codecs: {
              page: { parse: (s) => Number(s), format: (n) => String(n) },
            },
          }
        )
      );

      expect(result.current[0]).toEqual({ q: "initial", page: 1 });

      act(() => result.current[1].patch({ q: "updated", page: 5 }));

      const url = new URL(window.location.href);
      expect(url.searchParams.get("users.q")).toBe("updated");
      expect(url.searchParams.get("users.page")).toBe("5");
      expect(url.searchParams.get("other.param")).toBe("keep");
    });

    it("handles setState with function updater", () => {
      const { result } = renderHook(() =>
        useUrlState<{ count?: number }>(
          { count: 0 },
          {
            namespace: "counter",
            codecs: {
              count: { parse: (s) => Number(s), format: (n) => String(n) },
            },
          }
        )
      );

      act(() =>
        result.current[1].setState((prev) => ({ count: (prev.count || 0) + 1 }))
      );
      expect(result.current[0]).toEqual({ count: 1 });
      expect(
        new URL(window.location.href).searchParams.get("counter.count")
      ).toBe("1");
    });

    it("handles clear operation properly", () => {
      setWindowLocation(
        "https://example.com/?users.q=test&users.page=5&other.param=keep"
      );
      const { result } = renderHook(() =>
        useUrlState<{ q?: string; page?: number }>(undefined, {
          namespace: "users",
        })
      );

      act(() => result.current[1].clear());

      const url = new URL(window.location.href);
      expect(url.searchParams.get("users.q")).toBeNull();
      expect(url.searchParams.get("users.page")).toBeNull();
      expect(url.searchParams.get("other.param")).toBe("keep");
    });
  });

  describe("edge cases", () => {
    it("handles undefined namespace gracefully", () => {
      const { result } = renderHook(() =>
        useUrlState<{ q?: string }>(
          { q: "test" },
          {
            namespace: undefined,
          }
        )
      );

      act(() => result.current[1].set("q", "value"));
      expect(new URL(window.location.href).searchParams.get("q")).toBe("value");
    });

    it("handles empty string values correctly", () => {
      const { result } = renderHook(() =>
        useUrlState<{ q?: string }>(
          { q: "default" },
          {
            namespace: "users",
          }
        )
      );

      act(() => result.current[1].set("q", ""));
      expect(new URL(window.location.href).searchParams.get("users.q")).toBe(
        ""
      );
      expect(result.current[0]).toEqual({ q: "" });
    });

    it("handles complex object serialization", () => {
      const { result } = renderHook(() =>
        useUrlState<{ filters?: { tags: string[]; active: boolean } }>(
          undefined,
          {
            namespace: "search",
          }
        )
      );

      const complexValue = { tags: ["react", "typescript"], active: true };
      act(() => result.current[1].set("filters", complexValue));

      expect(result.current[0].filters).toEqual(complexValue);
      const urlParam = new URL(window.location.href).searchParams.get(
        "search.filters"
      );
      expect(urlParam).toBeDefined();
      expect(JSON.parse(decodeURIComponent(urlParam!))).toEqual(complexValue);
    });
  });
});
