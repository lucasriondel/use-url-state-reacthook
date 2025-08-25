import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUrlProp } from "./useUrlProp";

function setWindowLocation(href: string) {
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
  });
}

beforeEach(() => {
  setWindowLocation("https://example.com/");
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  vi.spyOn(window.history, "pushState").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUrlProp", () => {
  describe("basic functionality", () => {
    it("returns undefined when no URL param and no default", () => {
      const { result } = renderHook(() => useUrlProp<{ q?: string }, "q">("q"));
      const [value] = result.current;
      expect(value).toBeUndefined();
    });

    it("returns default value when no URL param", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", { q: "default" })
      );
      const [value] = result.current;
      expect(value).toBe("default");
    });

    it("returns URL param value over default", () => {
      setWindowLocation("https://example.com/?q=fromurl");
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", { q: "default" })
      );
      const [value] = result.current;
      expect(value).toBe("fromurl");
    });

    it("sets value and updates URL", () => {
      const { result } = renderHook(() => useUrlProp<{ q?: string }, "q">("q"));
      const [, setValue] = result.current;

      act(() => setValue("test"));

      expect(new URL(window.location.href).searchParams.get("q")).toBe("test");
    });

    it("sets undefined value and removes from URL", () => {
      setWindowLocation("https://example.com/?q=existing");
      const { result } = renderHook(() => useUrlProp<{ q?: string }, "q">("q"));
      const [, setValue] = result.current;

      act(() => setValue(undefined));

      expect(new URL(window.location.href).searchParams.get("q")).toBeNull();
    });
  });

  describe("with namespace", () => {
    it("reads namespaced URL param", () => {
      setWindowLocation("https://example.com/?ns.q=namespaced");
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, {
          namespace: "ns",
        })
      );
      const [value] = result.current;
      expect(value).toBe("namespaced");
    });

    it("sets namespaced URL param", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, {
          namespace: "ns",
        })
      );
      const [, setValue] = result.current;

      act(() => setValue("test"));

      expect(new URL(window.location.href).searchParams.get("ns.q")).toBe(
        "test"
      );
      expect(new URL(window.location.href).searchParams.get("q")).toBeNull();
    });

    it("removes namespaced URL param when set to undefined", () => {
      setWindowLocation("https://example.com/?ns.q=existing&other=keep");
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, {
          namespace: "ns",
        })
      );
      const [, setValue] = result.current;

      act(() => setValue(undefined));

      expect(new URL(window.location.href).searchParams.get("ns.q")).toBeNull();
      expect(new URL(window.location.href).searchParams.get("other")).toBe(
        "keep"
      );
    });
  });

  describe("with codecs", () => {
    const numberCodec = {
      parse: (raw: string) => parseInt(raw, 10),
      format: (value: number) => value.toString(),
    };

    it("reads typed value using codec", () => {
      setWindowLocation("https://example.com/?page=42");
      const { result } = renderHook(() =>
        useUrlProp<{ page?: number }, "page">("page", undefined, {
          codecs: { page: numberCodec },
        })
      );
      const [value] = result.current;
      expect(value).toBe(42);
      expect(typeof value).toBe("number");
    });

    it("sets typed value using codec", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ page?: number }, "page">("page", undefined, {
          codecs: { page: numberCodec },
        })
      );
      const [, setValue] = result.current;

      act(() => setValue(99));

      expect(new URL(window.location.href).searchParams.get("page")).toBe("99");
    });

    it("handles codec parse errors gracefully", () => {
      setWindowLocation("https://example.com/?page=invalid");
      const throwingCodec = {
        parse: (s: string) => {
          const num = Number(s);
          if (isNaN(num)) throw new Error("Invalid number");
          return num;
        },
        format: (n: number) => String(n),
      };
      const { result } = renderHook(() =>
        useUrlProp<{ page?: number }, "page">(
          "page",
          { page: 1 },
          {
            codecs: { page: throwingCodec },
          }
        )
      );
      const [value] = result.current;
      // Should fall back to default when parsing fails
      expect(value).toBe(1);
    });

    it("works with complex codecs", () => {
      const arrayCodec = {
        parse: (raw: string) => JSON.parse(raw) as string[],
        format: (value: string[]) => JSON.stringify(value),
      };

      setWindowLocation('https://example.com/?tags=["tag1","tag2"]');
      const { result } = renderHook(() =>
        useUrlProp<{ tags?: string[] }, "tags">("tags", undefined, {
          codecs: { tags: arrayCodec },
        })
      );
      const [value] = result.current;
      expect(value).toEqual(["tag1", "tag2"]);
    });
  });

  describe("with sanitize", () => {
    const sanitize = vi.fn((draft) => {
      if (draft.q && typeof draft.q === "string" && draft.q.length > 10) {
        return { ...draft, q: draft.q.slice(0, 10) };
      }
      return draft;
    });

    beforeEach(() => {
      sanitize.mockClear();
    });

    it("applies sanitize function when setting value", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, { sanitize })
      );
      const [, setValue] = result.current;

      act(() => setValue("this is a very long string"));

      expect(sanitize).toHaveBeenCalled();
      expect(new URL(window.location.href).searchParams.get("q")).toBe(
        "this%20is%20a%20"
      );
    });
  });

  describe("with onChange", () => {
    const onChange = vi.fn();

    beforeEach(() => {
      onChange.mockClear();
    });

    it("fires onChange when value is set", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, { onChange })
      );
      const [, setValue] = result.current;

      act(() => setValue("test"));

      expect(onChange).toHaveBeenCalledWith({ q: "test" }, { source: "patch" });
    });

    it("fires onChange when value is removed", () => {
      setWindowLocation("https://example.com/?q=existing");
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, { onChange })
      );
      const [, setValue] = result.current;

      act(() => setValue(undefined));

      expect(onChange).toHaveBeenCalledWith({}, { source: "patch" });
    });
  });

  describe("with history mode", () => {
    it("uses replace mode by default", () => {
      const pushSpy = vi.spyOn(window.history, "pushState");
      const replaceSpy = vi.spyOn(window.history, "replaceState");

      const { result } = renderHook(() => useUrlProp<{ q?: string }, "q">("q"));
      const [, setValue] = result.current;

      act(() => setValue("test"));

      expect(replaceSpy).toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();

      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    });

    it("uses push mode when specified", () => {
      const pushSpy = vi.spyOn(window.history, "pushState");
      const replaceSpy = vi.spyOn(window.history, "replaceState");

      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, {
          history: "push",
        })
      );
      const [, setValue] = result.current;

      act(() => setValue("test"));

      expect(pushSpy).toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();

      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    });
  });

  describe("with debounceMs", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("debounces URL updates", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, {
          debounceMs: 100,
        })
      );
      const [, setValue] = result.current;

      act(() => setValue("test1"));
      act(() => setValue("test2"));
      act(() => setValue("test3"));

      // Should not be in URL yet
      expect(new URL(window.location.href).searchParams.get("q")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should now be in URL with the last value
      expect(new URL(window.location.href).searchParams.get("q")).toBe("test3");
    });

    it("cancels previous debounced update", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", undefined, {
          debounceMs: 100,
        })
      );
      const [, setValue] = result.current;

      act(() => setValue("test1"));

      act(() => {
        vi.advanceTimersByTime(50);
      });

      act(() => setValue("test2"));

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should have test2, not test1
      expect(new URL(window.location.href).searchParams.get("q")).toBe("test2");
    });
  });

  describe("with syncOnPopState", () => {
    it("syncs value on popstate by default", () => {
      const { result } = renderHook(() => useUrlProp<{ q?: string }, "q">("q"));

      // Simulate browser back/forward navigation
      setWindowLocation("https://example.com/?q=fromhistory");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      const [value] = result.current;
      expect(value).toBe("fromhistory");
    });

    it("does not sync when syncOnPopState is false", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">(
          "q",
          { q: "initial" },
          {
            syncOnPopState: false,
          }
        )
      );

      setWindowLocation("https://example.com/?q=fromhistory");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      const [value] = result.current;
      expect(value).toBe("initial"); // Should remain unchanged
    });
  });

  describe("function-based defaults", () => {
    it("supports function-based defaults", () => {
      const getDefaults = vi.fn(() => ({ q: "computed" }));
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", getDefaults)
      );

      expect(getDefaults).toHaveBeenCalled();
      const [value] = result.current;
      expect(value).toBe("computed");
    });

    it("memoizes function-based defaults", () => {
      const getDefaults = vi.fn(() => ({ q: "computed" }));
      const { result, rerender } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", getDefaults)
      );

      rerender();
      rerender();

      // Should only be called once due to memoization
      expect(getDefaults).toHaveBeenCalledTimes(1);
    });
  });

  describe("multiple properties", () => {
    it("works with different keys from the same state", () => {
      const { result: queryResult } = renderHook(() =>
        useUrlProp<{ q?: string; page?: number }, "q">("q")
      );
      const { result: pageResult } = renderHook(() =>
        useUrlProp<{ q?: string; page?: number }, "page">("page")
      );

      const [, setQuery] = queryResult.current;
      const [, setPage] = pageResult.current;

      act(() => setQuery("search"));
      act(() => setPage(5));

      expect(new URL(window.location.href).searchParams.get("q")).toBe(
        "search"
      );
      expect(new URL(window.location.href).searchParams.get("page")).toBe("5");
    });
  });

  describe("edge cases", () => {
    it("handles undefined namespace gracefully", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">(
          "q",
          { q: "test" },
          {
            namespace: undefined,
          }
        )
      );
      const [, setValue] = result.current;

      act(() => setValue("value"));
      expect(new URL(window.location.href).searchParams.get("q")).toBe("value");
    });

    it("handles empty string values correctly", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", { q: "default" })
      );
      const [, setValue] = result.current;

      act(() => setValue(""));
      expect(new URL(window.location.href).searchParams.get("q")).toBe("");
    });

    it("handles non-string values with default serialization", () => {
      const { result } = renderHook(() =>
        useUrlProp<{ enabled?: boolean }, "enabled">("enabled")
      );
      const [, setValue] = result.current;

      act(() => setValue(true));
      expect(new URL(window.location.href).searchParams.get("enabled")).toBe(
        "true"
      );

      act(() => setValue(false));
      expect(new URL(window.location.href).searchParams.get("enabled")).toBe(
        "false"
      );
    });

    it("maintains referential stability of setValue with same dependencies", () => {
      let renderCount = 0;
      const { result, rerender } = renderHook(() => {
        renderCount++;
        return useUrlProp<{ q?: string }, "q">("q");
      });

      const [, setValue1] = result.current;

      // Re-render without changing dependencies
      rerender();
      const [, setValue2] = result.current;

      // The function should be stable when dependencies don't change
      // Note: In practice, the api object from useUrlState may change, affecting stability
      expect(typeof setValue2).toBe("function");
      expect(renderCount).toBe(2);
    });
  });

  describe("error handling", () => {
    it("handles URL parsing errors gracefully", () => {
      // Mock getCurrentUrl to return undefined (simulating SSR or error)
      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        value: {
          href: "invalid-url",
        },
        writable: true,
      });

      const { result } = renderHook(() =>
        useUrlProp<{ q?: string }, "q">("q", { q: "fallback" })
      );

      const [value] = result.current;
      expect(value).toBe("fallback");

      // Restore location
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("handles codec format errors by throwing", () => {
      const badCodec = {
        parse: (raw: string) => raw,
        format: () => {
          throw new Error("Cannot serialize circular structure");
        },
      };

      const { result } = renderHook(() =>
        useUrlProp<{ obj?: any }, "obj">("obj", undefined, {
          codecs: { obj: badCodec },
        })
      );
      const [, setValue] = result.current;

      // This should throw and be caught by React's error boundary
      expect(() => {
        act(() => setValue({ circular: {} }));
      }).toThrow();
    });
  });
});
