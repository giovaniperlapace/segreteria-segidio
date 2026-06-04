"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email",
  "email_change",
];

function isOtpType(value: string | null): value is EmailOtpType {
  return Boolean(value && OTP_TYPES.includes(value as EmailOtpType));
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function verify() {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const supabase = createSupabaseBrowserClient();

      if (!tokenHash || !isOtpType(type)) {
        router.replace("/login?error=invalid_link");
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      router.replace(error ? "/login?error=invalid_link" : "/dashboard");
    }

    verify();
  }, [router, searchParams]);

  return <p className="text-sm text-slate-600">Verifica del link in corso...</p>;
}

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f1e8] px-6">
      <section className="rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-[#173f5f]">Accesso sicuro</h1>
        <Suspense fallback={<p className="mt-3 text-sm">Caricamento...</p>}>
          <CallbackContent />
        </Suspense>
      </section>
    </main>
  );
}
