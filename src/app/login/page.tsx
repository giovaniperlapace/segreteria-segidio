import { BrandLogo } from "@/app/brand-logo";

type LoginPageProps = {
  searchParams: Promise<{
    status?: string;
    error?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Questa email non e' abilitata all'accesso.",
  email_required: "Inserisci la tua email autorizzata.",
  invalid_link: "Il link non e' valido o e' scaduto. Richiedine uno nuovo.",
  magic_link_failed: "Non e' stato possibile inviare il link. Riprova tra poco.",
  rate_limited: "Abbiamo gia' inviato un link da poco. Attendi un minuto e riprova.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const message =
    params.status === "sent"
      ? "Controlla la posta: abbiamo inviato il tuo link di accesso."
      : params.error
        ? (ERROR_MESSAGES[params.error] ?? ERROR_MESSAGES.magic_link_failed)
        : "";
  const isError = Boolean(params.error);

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

        <form action="/api/auth/magic-link" method="post" className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nome@santegidio.org"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#d43c2f] focus:ring-2 focus:ring-[#d43c2f]/20"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#1b3272] px-4 py-3 font-semibold text-white transition hover:bg-[#263f86]"
          >
            Invia magic link
          </button>
        </form>

        {message ? (
          <p
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              isError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
