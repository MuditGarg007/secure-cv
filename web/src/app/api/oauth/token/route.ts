import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { redeemCode } from "@/server/oauth/service";

// POST /api/oauth/token: the app's server swaps a code for the user's identity (docs/oauth.md).
// Server-to-server, so no Origin check and no route() wrapper; errors use the OAuth shape.
const Body = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1).max(64),
  redirect_uri: z.string().min(1).max(256),
  client_id: z.string().min(1).max(64),
  code_verifier: z.string().min(1).max(128),
});

function oauthError(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = Object.fromEntries(await req.formData());
  } catch {
    return oauthError("invalid_request");
  }
  const body = Body.safeParse(raw);
  if (!body.success) return oauthError("invalid_request");
  const claims = redeemCode({
    code: body.data.code,
    clientId: body.data.client_id,
    redirectUri: body.data.redirect_uri,
    codeVerifier: body.data.code_verifier,
  });
  if (!claims) return oauthError("invalid_grant");
  return NextResponse.json(claims, { headers: { "Cache-Control": "no-store" } });
}
