import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendMagicLinkEmail } from "@/lib/email/gmail";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type GenerateLinkResponse = {
  hashed_token?: string;
  verification_type?: EmailOtpType;
  msg?: string;
  error?: string;
  error_description?: string;
};

const lastRequestByEmail = new Map<string, number>();
const REQUEST_INTERVAL_MS = 60_000;

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

function getBaseUrl(request: Request) {
  return (
    process.env.APP_URL?.trim().replace(/\/+$/, "") ||
    new URL(request.url).origin
  );
}

function loginRedirect(request: Request, search: string) {
  return NextResponse.redirect(new URL(`/login?${search}`, request.url), 303);
}

export async function POST(request: Request) {
  const wantsJson = isJsonRequest(request);

  try {
    const body = wantsJson
      ? ((await request.json()) as { email?: unknown })
      : Object.fromEntries(await request.formData());
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!email) {
      if (!wantsJson) return loginRedirect(request, "error=email_required");
      return NextResponse.json({ ok: false, code: "EMAIL_REQUIRED" }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id")
      .eq("email", email)
      .eq("active", true)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (!profile) {
      if (!wantsJson) return loginRedirect(request, "error=access_denied");
      return NextResponse.json({ ok: false, code: "ACCESS_DENIED" }, { status: 403 });
    }

    const now = Date.now();
    if (now - (lastRequestByEmail.get(email) ?? 0) < REQUEST_INTERVAL_MS) {
      if (!wantsJson) return loginRedirect(request, "error=rate_limited");
      return NextResponse.json({ ok: false, code: "RATE_LIMITED" }, { status: 429 });
    }
    lastRequestByEmail.set(email, now);

    const supabaseUrl = (
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    )?.replace(/\/+$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing Supabase server configuration");
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ type: "magiclink", email }),
    });
    const payload = (await response.json()) as GenerateLinkResponse;

    if (!response.ok || !payload.hashed_token || !payload.verification_type) {
      throw new Error(
        payload.msg ||
          payload.error_description ||
          payload.error ||
          "Unable to generate magic link",
      );
    }

    const callbackUrl = new URL("/auth/callback", getBaseUrl(request));
    callbackUrl.searchParams.set("token_hash", payload.hashed_token);
    callbackUrl.searchParams.set("type", payload.verification_type);

    await sendMagicLinkEmail({
      to: email,
      magicLink: callbackUrl.toString(),
    });

    if (!wantsJson) return loginRedirect(request, "status=sent");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Magic link request failed", error);
    if (!wantsJson) return loginRedirect(request, "error=magic_link_failed");
    return NextResponse.json(
      { ok: false, code: "MAGIC_LINK_FAILED" },
      { status: 500 },
    );
  }
}
