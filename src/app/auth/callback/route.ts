import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  // Native Chromium forms need this to retain Origin on the same-origin POST.
  "Referrer-Policy": "strict-origin",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};
const OTP_TYPES: readonly string[] = ["signup", "magiclink", "recovery", "invite", "email", "email_change"];
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function redirect(request: Request, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  for (const [key, value] of Object.entries(HEADERS)) response.headers.set(key, value);
  return response;
}

// Email scanners may visit GET/HEAD: neither consumes the one-time token.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token_hash");
  const type = params.get("type");
  if (!token || token.length > 2048 || !type || !OTP_TYPES.includes(type)) return redirect(request, "/login?error=invalid_link");
  return new NextResponse(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Accesso sicuro — Segreteria Segidio</title>
<style>body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.6 system-ui,sans-serif}main{min-height:100svh;display:grid;place-items:center;padding:24px;box-sizing:border-box}section{max-width:440px;padding:32px;border-radius:16px;background:white;box-shadow:0 10px 30px #17203312}h1{color:#1b3272;font-size:24px}button{font:inherit;font-weight:600;background:#1b3272;color:white;border:0;border-radius:8px;padding:12px 20px;cursor:pointer}a{color:#1b3272}button:focus-visible,a:focus-visible{outline:3px solid #e19b28;outline-offset:4px}</style></head><body><main><section><h1>Accesso sicuro</h1><p>Conferma per accedere alla Segreteria Segidio.</p><form method="post" action="/auth/callback"><input type="hidden" name="token_hash" value="${escape(token)}"><input type="hidden" name="type" value="${escape(type)}"><button type="submit">Conferma e accedi</button></form><p><a href="/login">Torna al login</a></p></section></main></body></html>`, {
    headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new NextResponse(null, { status: 403, headers: HEADERS });
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new NextResponse(null, { status: 415, headers: HEADERS });
  const body = await request.text();
  if (body.length > 4096) return new NextResponse(null, { status: 413, headers: HEADERS });
  const params = new URLSearchParams(body);
  const token = params.get("token_hash");
  const type = params.get("type");
  if (!token || token.length > 2048 || !type || !OTP_TYPES.includes(type)) return redirect(request, "/login?error=invalid_link");
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: type as EmailOtpType });
    return redirect(request, error ? "/login?error=invalid_link" : "/dashboard");
  } catch {
    return redirect(request, "/login?error=invalid_link");
  }
}
