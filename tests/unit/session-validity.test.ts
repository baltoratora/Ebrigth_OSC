import { describe, it, expect } from "vitest";
import { isSessionValid } from "../../lib/session-validity";

const ACTIVE = "ACTIVE";
const INACTIVE = "INACTIVE";

// Helper: build a fake JWT with iat in seconds.
const tok = (iatSec: number | undefined) => ({ iat: iatSec });

describe("isSessionValid()", () => {
  it("returns true for an active user with no recorded revocation", () => {
    expect(
      isSessionValid(tok(1_700_000_000), { status: ACTIVE, revokedAfter: null }),
    ).toBe(true);
  });

  it("returns false when the user is inactive (regardless of timestamps)", () => {
    expect(
      isSessionValid(tok(1_700_000_000), { status: INACTIVE, revokedAfter: null }),
    ).toBe(false);
    expect(
      isSessionValid(tok(1_700_000_000), { status: "PENDING", revokedAfter: null }),
    ).toBe(false);
  });

  it("returns false when token was issued before the latest revocation", () => {
    // Token issued at T, revocation stamped at T + 60s → token is stale.
    const iat = 1_700_000_000;
    const revokedAfter = new Date((iat + 60) * 1000);
    expect(
      isSessionValid(tok(iat), { status: ACTIVE, revokedAfter }),
    ).toBe(false);
  });

  it("returns true when token was issued AFTER the latest revocation", () => {
    const iat = 1_700_000_500;
    const revokedAfter = new Date((iat - 100) * 1000);
    expect(
      isSessionValid(tok(iat), { status: ACTIVE, revokedAfter }),
    ).toBe(true);
  });

  it("returns true when iat equals revokedAfter (no strict-greater requirement)", () => {
    const iat = 1_700_000_000;
    const revokedAfter = new Date(iat * 1000);
    expect(
      isSessionValid(tok(iat), { status: ACTIVE, revokedAfter }),
    ).toBe(true);
  });

  it("trusts the token when iat is not a number (no comparison possible)", () => {
    // If the JWT somehow has no iat, we can't tell if it's stale. Don't kick.
    expect(
      isSessionValid(tok(undefined), { status: ACTIVE, revokedAfter: new Date() }),
    ).toBe(true);
    expect(
      isSessionValid({ iat: "not-a-number" }, {
        status: ACTIVE,
        revokedAfter: new Date(),
      }),
    ).toBe(true);
  });

  it("rounds revokedAfter down to seconds when comparing to iat", () => {
    // iat is integer seconds (JWT spec); revokedAfter is millisecond
    // precision. Make sure a 200ms drift doesn't false-positive.
    const iat = 1_700_000_000;
    const justAfter = new Date(iat * 1000 + 200);
    // floor(justAfter / 1000) == iat → iat NOT < revokedAfterSec → valid.
    expect(
      isSessionValid(tok(iat), { status: ACTIVE, revokedAfter: justAfter }),
    ).toBe(true);
  });
});
