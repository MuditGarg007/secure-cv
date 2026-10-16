import { describe, expect, it } from "vitest";
import { parseAuthorize, pkceChallenge, pkceMatches, redirectWith } from "@/server/oauth/params";

const base = {
  response_type: "code",
  client_id: "mockbank",
  redirect_uri: "http://localhost:4000/callback",
  state: "abcdefgh12",
  code_challenge: pkceChallenge("v".repeat(43)),
  code_challenge_method: "S256",
};

describe("parseAuthorize", () => {
  it("accepts a registered client and defaults acr to passkey", () => {
    const r = parseAuthorize(base);
    expect(r.ok && r.params.acr_values).toBe("passkey");
  });
  it("rejects unknown clients, unregistered redirects and bad PKCE", () => {
    for (const bad of [
      { ...base, client_id: "evil" },
      { ...base, client_id: "__proto__" },
      { ...base, redirect_uri: "http://localhost:4000/callback/../x" },
      { ...base, redirect_uri: "https://evil.example/callback" },
      { ...base, code_challenge_method: "plain" },
      { ...base, code_challenge: "short" },
      { ...base, acr_values: "none" },
      { ...base, state: ["a", "b"] },
      { ...base, binding_message: "x".repeat(200) },
    ]) {
      expect(parseAuthorize(bad).ok).toBe(false);
    }
  });
});

describe("pkce", () => {
  it("matches only the right verifier", () => {
    const v = "a".repeat(50);
    expect(pkceMatches(v, pkceChallenge(v))).toBe(true);
    expect(pkceMatches("b".repeat(50), pkceChallenge(v))).toBe(false);
    expect(pkceMatches("short", pkceChallenge("short"))).toBe(false);
  });
});

describe("redirectWith", () => {
  it("adds query params", () => {
    expect(redirectWith("http://localhost:4000/callback", { code: "c", state: "s" })).toBe(
      "http://localhost:4000/callback?code=c&state=s",
    );
  });
});
