import { describe, it, expect } from "vitest";
import { sanitiseCallbackUrl } from "../../lib/callback-url";

describe("sanitiseCallbackUrl()", () => {
  it("returns /home when input is empty / null / undefined", () => {
    expect(sanitiseCallbackUrl(null)).toBe("/home");
    expect(sanitiseCallbackUrl(undefined)).toBe("/home");
    expect(sanitiseCallbackUrl("")).toBe("/home");
  });

  it("allows clean same-origin paths", () => {
    expect(sanitiseCallbackUrl("/home")).toBe("/home");
    expect(sanitiseCallbackUrl("/profile")).toBe("/profile");
    expect(sanitiseCallbackUrl("/attendance/summary")).toBe("/attendance/summary");
  });

  it("preserves query strings and hash fragments", () => {
    expect(sanitiseCallbackUrl("/manpower-cost-report?month=2026-04")).toBe(
      "/manpower-cost-report?month=2026-04",
    );
    expect(sanitiseCallbackUrl("/foo?a=1&b=2#section")).toBe("/foo?a=1&b=2#section");
  });

  it("blocks absolute URLs to other origins", () => {
    expect(sanitiseCallbackUrl("https://evil.com/")).toBe("/home");
    expect(sanitiseCallbackUrl("http://evil.com/foo")).toBe("/home");
    expect(sanitiseCallbackUrl("ftp://evil.com")).toBe("/home");
  });

  it("blocks protocol-relative URLs (//evil.com)", () => {
    expect(sanitiseCallbackUrl("//evil.com/path")).toBe("/home");
    expect(sanitiseCallbackUrl("//evil.com")).toBe("/home");
  });

  it("blocks javascript: and data: schemes", () => {
    expect(sanitiseCallbackUrl("javascript:alert(1)")).toBe("/home");
    expect(sanitiseCallbackUrl("data:text/html,<script>alert(1)</script>")).toBe("/home");
  });

  it("blocks paths with control characters / CR / LF (header injection)", () => {
    expect(sanitiseCallbackUrl("/foo\r\nSet-Cookie: bar")).toBe("/home");
    expect(sanitiseCallbackUrl("/foo\x00")).toBe("/home");
    expect(sanitiseCallbackUrl("/foo\x7f")).toBe("/home");
  });

  it("blocks backslash-path tricks", () => {
    expect(sanitiseCallbackUrl("/\\evil.com")).toBe("/home");
    expect(sanitiseCallbackUrl("\\\\evil.com")).toBe("/home");
  });

  it("handles URL-encoded payloads", () => {
    // Encoded https://evil.com → must still be blocked after decoding.
    expect(sanitiseCallbackUrl("https%3A%2F%2Fevil.com")).toBe("/home");
    // Encoded //evil.com
    expect(sanitiseCallbackUrl("%2F%2Fevil.com")).toBe("/home");
  });

  it("returns /home on malformed percent-encoding", () => {
    expect(sanitiseCallbackUrl("%E0%A4%A")).toBe("/home"); // truncated UTF-8
    expect(sanitiseCallbackUrl("%")).toBe("/home");
  });

  it("rejects values that don't start with /", () => {
    expect(sanitiseCallbackUrl("home")).toBe("/home");
    expect(sanitiseCallbackUrl("../home")).toBe("/home");
  });
});
