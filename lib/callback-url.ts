// Whitelisting helper for `?callbackUrl=...` on the login page.
//
// The middleware sets callbackUrl to the original `pathname + search` so the
// user lands back where they were trying to go. Before we hand that value to
// router.push() we have to make sure an attacker can't craft a link like
// /login?callbackUrl=https://evil.com or /login?callbackUrl=//evil.com that
// would turn the redirect into an open-redirect / phishing vector.

const DEFAULT_PATH = "/home";

export function sanitiseCallbackUrl(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return DEFAULT_PATH;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_PATH;
  }

  // Must be a same-origin path.
  if (!decoded.startsWith("/")) return DEFAULT_PATH;
  // Protocol-relative URL: //evil.com/foo
  if (decoded.startsWith("//")) return DEFAULT_PATH;
  // Backslash-as-path-separator trick that some legacy parsers accept.
  if (decoded.includes("\\")) return DEFAULT_PATH;
  // Control chars including CR/LF — defend against header / log injection.
  if (/[\x00-\x1f\x7f]/.test(decoded)) return DEFAULT_PATH;

  // Belt and suspenders: resolve against a dummy origin and check we stay
  // on that origin. This catches anything the regex checks missed
  // (encoded backslashes, exotic schemes, etc.).
  try {
    const u = new URL(decoded, "https://x.invalid");
    if (u.origin !== "https://x.invalid") return DEFAULT_PATH;
    return u.pathname + u.search + u.hash;
  } catch {
    return DEFAULT_PATH;
  }
}
