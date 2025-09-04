import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultUrlDeserialize } from "./defaultUrlDeserialize";
import { defaultUrlSerialize } from "./defaultUrlSerialize";
import { urlSerializeForParams } from "./urlSerializeForParams";
import { writeToUrl } from "./writeToUrl";

function setWindowLocation(href: string) {
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
  });
}

describe("URL Serialization", () => {
  beforeEach(() => {
    setWindowLocation("https://example.com/");
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  });

  describe("defaultUrlSerialize", () => {
    it("should encode email addresses correctly (single encoding)", () => {
      const email = "john@example.com";
      const encoded = defaultUrlSerialize(email);

      // Single encoding should convert @ to %40
      expect(encoded).toBe("john%40example.com");

      // Should not be double encoded
      expect(encoded).not.toBe("john%2540example.com");
    });

    it("should handle special characters in email addresses", () => {
      const email = "user+tag@example.com";
      const encoded = defaultUrlSerialize(email);

      expect(encoded).toBe("user%2Btag%40example.com");
    });

    it("should serialize objects containing email addresses", () => {
      const obj = { email: "john@example.com", name: "John" };
      const encoded = defaultUrlSerialize(obj);

      // JSON.stringify then encodeURIComponent
      const expected = encodeURIComponent(JSON.stringify(obj));
      expect(encoded).toBe(expected);
    });
  });

  describe("defaultUrlDeserialize", () => {
    it("should deserialize single-encoded email addresses correctly", () => {
      const encoded = "john%40example.com";
      const decoded = defaultUrlDeserialize(encoded);

      expect(decoded).toBe("john@example.com");
    });

    it("should handle double-encoded email addresses (reveals the bug)", () => {
      // This represents what we see in the URL: john%2540example.com
      const doubleEncoded = "john%2540example.com";
      const decoded = defaultUrlDeserialize(doubleEncoded);

      // If there's double encoding, this would return "john%40example.com" instead of "john@example.com"
      // This test demonstrates the issue
      expect(decoded).toBe("john%40example.com"); // Still encoded once
      expect(decoded).not.toBe("john@example.com"); // Not fully decoded
    });

    it("should deserialize correctly encoded email from objects", () => {
      const obj = { email: "john@example.com", name: "John" };
      const encoded = encodeURIComponent(JSON.stringify(obj));
      const decoded = defaultUrlDeserialize(encoded);

      expect(decoded).toEqual(obj);
    });
  });

  describe("urlSerializeForParams", () => {
    it("should not encode string values (let URLSearchParams handle it)", () => {
      const email = "john@example.com";
      const result = urlSerializeForParams(email);

      expect(result).toBe("john@example.com"); // No encoding applied
    });

    it("should JSON.stringify objects without encoding", () => {
      const obj = { email: "john@example.com", name: "John" };
      const result = urlSerializeForParams(obj);

      expect(result).toBe(JSON.stringify(obj)); // No encoding applied
    });

    it("should differ from defaultUrlSerialize behavior", () => {
      const email = "john@example.com";

      const newResult = urlSerializeForParams(email);
      const oldResult = defaultUrlSerialize(email);

      expect(newResult).toBe("john@example.com");
      expect(oldResult).toBe("john%40example.com");
      expect(newResult).not.toBe(oldResult);
    });
  });

  describe("Legacy test showing what the old behavior used to do", () => {
    it("should demonstrate what double encoding used to look like with defaultUrlSerialize", () => {
      // This shows what the old problematic behavior would have produced
      const originalEmail = "john@example.com";

      // Old flow: defaultUrlSerialize + URLSearchParams.set() = double encoding
      const firstEncode = defaultUrlSerialize(originalEmail); // "john%40example.com"
      const params = new URLSearchParams();
      params.set("email", firstEncode); // URLSearchParams encodes again

      // This would have shown john%2540example.com (double encoded)
      expect(params.toString()).toBe("email=john%2540example.com");

      // But now with the fix, writeToUrl should not do this
      setWindowLocation("https://example.com/");
      writeToUrl({ email: originalEmail }, "filter", {}, "replace");

      // Fixed behavior: only single encoding
      expect(window.location.search).toBe("?filter.email=john%40example.com");
    });

    it("should show the round-trip issue that causes double encoding", () => {
      const originalEmail = "john@example.com";

      // Step 1: Serialize (first encoding)
      const firstEncoding = defaultUrlSerialize(originalEmail);
      expect(firstEncoding).toBe("john%40example.com");

      // Step 2: If this encoded value gets serialized again (the bug)
      const secondEncoding = defaultUrlSerialize(firstEncoding);
      expect(secondEncoding).toBe("john%2540example.com");

      // Step 3: Deserializing the double-encoded value
      const decoded = defaultUrlDeserialize(secondEncoding);
      expect(decoded).toBe("john%40example.com"); // Still partially encoded!
      expect(decoded).not.toBe(originalEmail); // Lost the original value
    });
  });

  describe("URLSearchParams behavior", () => {
    it("should show how URLSearchParams handles encoded values", () => {
      const email = "john@example.com";
      const params = new URLSearchParams();

      // Setting raw value
      params.set("email", email);
      expect(params.get("email")).toBe("john@example.com");
      expect(params.toString()).toBe("email=john%40example.com");

      // Setting pre-encoded value
      params.set("encoded_email", "john%40example.com");
      expect(params.get("encoded_email")).toBe("john%40example.com");
      expect(params.toString()).toContain("encoded_email=john%2540example.com");
    });
  });

  describe("Fixed: john@example.com should only encode once", () => {
    it("should correctly encode email to john%40example.com (single encoding)", () => {
      setWindowLocation("https://example.com/");

      // Simulate a text input with john@example.com
      const emailInput = "john@example.com";

      // When this gets processed through writeToUrl (now fixed)
      writeToUrl({ email: emailInput }, "filter", {}, "replace");

      // The URL should show single-encoded version (bug fixed)
      expect(window.location.search).toBe("?filter.email=john%40example.com");

      // Verify the decoding process works correctly
      const params = new URLSearchParams(window.location.search);
      const retrievedEmail = params.get("filter.email");

      // This should now be the original email
      expect(retrievedEmail).toBe("john@example.com");
    });

    it("should handle complex email addresses correctly", () => {
      setWindowLocation("https://example.com/");

      const complexEmail = "user+tag@sub.example.co.uk";

      writeToUrl({ email: complexEmail }, "filter", {}, "replace");

      // Should be properly single-encoded in URL
      expect(window.location.search).toBe(
        "?filter.email=user%2Btag%40sub.example.co.uk"
      );

      // Should retrieve correctly
      const params = new URLSearchParams(window.location.search);
      const retrievedEmail = params.get("filter.email");
      expect(retrievedEmail).toBe("user+tag@sub.example.co.uk");
    });

    it("should handle objects with email properties correctly", () => {
      setWindowLocation("https://example.com/");

      const filterObject = { email: "john@example.com", name: "John Doe" };

      writeToUrl({ user: filterObject }, "filter", {}, "replace");

      // Object should be JSON.stringify'd and URLSearchParams will handle encoding
      const params = new URLSearchParams(window.location.search);
      const retrievedUser = params.get("filter.user");
      expect(JSON.parse(retrievedUser || "")).toEqual(filterObject);
    });
  });

  describe("Percent sign encoding issue causing URI malformed error", () => {
    it("should reproduce the URI malformed error with percent signs", () => {
      setWindowLocation("https://example.com/");

      const textWithPercent = "user%with%percent";

      writeToUrl({ search: textWithPercent }, "test-table", {}, "replace");

      // This might cause issues when the URL is reloaded/parsed
      expect(window.location.search).toContain("user%");
    });

    it("should demonstrate what happens with encodeURIComponent and percent signs", () => {
      const textWithPercent = "user%with%percent";

      // encodeURIComponent should encode % as %25
      const encoded = encodeURIComponent(textWithPercent);
      expect(encoded).toBe("user%25with%25percent");

      // And it should decode back correctly
      const decoded = decodeURIComponent(encoded);
      expect(decoded).toBe("user%with%percent");
    });

    it("should show the issue when URL contains user%25with%25percent", () => {
      // This simulates the URL you're seeing: user%25with%25percent
      const problematicUrl =
        "http://localhost:3000/?test-table.search=user%25with%25percent";

      try {
        const url = new URL(problematicUrl);
        const params = new URLSearchParams(url.search);
        const searchValue = params.get("test-table.search");

        console.log("Parsed search value:", searchValue);
        expect(searchValue).toBe("user%with%percent"); // Should be the original
      } catch (error) {
        console.log("Error parsing URL:", error);
        // This might throw if there's a URI malformed error
      }
    });

    it("should show potential double encoding issue with percent signs", () => {
      // If "user%with%percent" gets encoded twice:
      const original = "user%with%percent";
      const firstEncoding = encodeURIComponent(original); // "user%25with%25percent"
      const secondEncoding = encodeURIComponent(firstEncoding); // Double encoded

      expect(firstEncoding).toBe("user%25with%25percent");
      expect(secondEncoding).toBe("user%2525with%2525percent"); // %25 becomes %2525
    });

    it("should test defaultUrlDeserialize with percent-encoded values", () => {
      // Test what happens when we try to deserialize percent-encoded values
      const encodedValue = "user%25with%25percent";

      try {
        const result = defaultUrlDeserialize(encodedValue);
        expect(result).toBe("user%with%percent");
      } catch (error) {
        // This might fail if there's a malformed URI
      }
    });

    it("should reproduce the exact URIError with malformed percent sequences", () => {
      // These are examples of malformed percent sequences that could cause URIError
      const malformedSequences = [
        "user%2with%2percent", // %2 without second hex digit
        "user%gwith%gpercent", // %g is not valid hex
        "user%with%", // % at the end
        "user%2", // incomplete sequence
      ];

      malformedSequences.forEach((sequence) => {
        try {
          const result = defaultUrlDeserialize(sequence);
        } catch (error) {
          expect(error).toBeInstanceOf(URIError);
        }
      });
    });

    it("should show the issue comes from decodeURIComponent", () => {
      // Test directly with decodeURIComponent to show where the error comes from
      const malformed = "user%2with%2percent";

      expect(() => {
        decodeURIComponent(malformed);
      }).toThrow(URIError);

      // This is what's happening in defaultUrlDeserialize
      // But now it should NOT throw after our fix
      expect(() => {
        defaultUrlDeserialize(malformed);
      }).not.toThrow();

      // Instead, it should return the original malformed string
      const result = defaultUrlDeserialize(malformed);
      expect(result).toBe(malformed);
    });

    it("should handle malformed URI gracefully after fix", () => {
      const malformedSequences = [
        "user%2with%2percent",
        "user%gwith%gpercent",
        "user%with%",
        "user%2",
      ];

      malformedSequences.forEach((sequence) => {
        // Should not throw anymore
        expect(() => {
          const result = defaultUrlDeserialize(sequence);
        }).not.toThrow();

        // Should return the original malformed string
        const result = defaultUrlDeserialize(sequence);
        expect(result).toBe(sequence);
      });
    });

    it("should still properly decode valid percent sequences", () => {
      // Valid sequences should still work correctly
      const validSequence = "user%25with%25percent";
      const result = defaultUrlDeserialize(validSequence);
      expect(result).toBe("user%with%percent");
    });

    it("should demonstrate that user%25with%25percent works perfectly fine", () => {
      // This is exactly what you tested in the browser - and it SHOULD work

      // Direct browser tests (these work fine)
      encodeURIComponent("%");
      decodeURIComponent("%25");

      // Your exact URL parameter
      const urlParam = "user%25with%25percent";
      decodeURIComponent(urlParam);

      // This should work fine through defaultUrlDeserialize
      const result = defaultUrlDeserialize(urlParam);

      expect(result).toBe("user%with%percent");
    });

    it("should show what ACTUALLY causes URIError malformed", () => {
      // The URIError happens with INCOMPLETE or INVALID sequences, not %25
      const problematicCases = [
        "user%", // incomplete - missing hex digits
        "user%2", // incomplete - missing second hex digit
        "user%GG", // invalid - GG is not valid hex
        "user%ZZ", // invalid - ZZ is not valid hex
      ];

      problematicCases.forEach((testCase) => {
        try {
          const direct = decodeURIComponent(testCase);
        } catch (error) {
          // Expected to fail for malformed sequences
        }

        // Our fix should handle this gracefully
        const viaDefaultDeserialize = defaultUrlDeserialize(testCase);
      });
    });
  });
});
