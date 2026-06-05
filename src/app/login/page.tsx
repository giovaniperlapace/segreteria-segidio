"use client";

import { BrandLogo } from "@/app/brand-logo";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);

    if (!response?.ok) {
      setStatus("error");
      setMessage(
        response?.status === 403
          ? "Questa email non è abilitata all'accesso."
          : "Non è stato possibile inviare il link. Riprova tra poco.",
      );
      return;
    }

    setStatus("sent");
    setMessage("Controlla la posta: abbiamo inviato il tuo link di accesso.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[#d9e1f2] bg-white p-8 shadow-xl shadow-[#1b3272]/10">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="login" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d43c2f]">
          Comunità di Sant&apos;Egidio
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1b3272]">
          Accedi alla Segreteria
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Inserisci la tua email autorizzata. Riceverai un magic link personale,
          senza password.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@santegidio.org"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#d43c2f] focus:ring-2 focus:ring-[#d43c2f]/20"
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-xl bg-[#1b3272] px-4 py-3 font-semibold text-white transition hover:bg-[#263f86] disabled:cursor-wait disabled:opacity-60"
          >
            {status === "loading" ? "Invio in corso..." : "Invia magic link"}
          </button>
        </form>

        {message && (
          <p
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              status === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
