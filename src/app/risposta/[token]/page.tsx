import Image from "next/image";
import {
  PUBLIC_RESPONSE_LABELS,
  PUBLIC_RESPONSE_STATUSES,
  type PublicResponseStatus,
} from "@/lib/email/public-response-links";
import {
  formatPublicEventDate,
  publicContactName,
  readPublicResponseContext,
} from "@/lib/invitations/public-responses";
import { submitPublicInvitationResponse } from "./actions";

export const dynamic = "force-dynamic";

type PublicResponseSearchParams = Record<string, string | string[] | undefined>;

const CURRENT_RESPONSE_LABELS: Record<string, string> = {
  no_response: "Nessuna risposta registrata",
  attending: "Partecipo",
  declined: "Non partecipo",
  maybe: "Probabilmente partecipo",
};

function paramValue(searchParams: PublicResponseSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusDescription(status: PublicResponseStatus) {
  if (status === "attending") return "Confermo la mia presenza all'evento.";
  if (status === "declined") return "Non potro' partecipare all'evento.";
  return "Al momento penso di partecipare, ma non e' ancora definitivo.";
}

export default async function PublicInvitationResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<PublicResponseSearchParams>;
}) {
  const { token } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const context = await readPublicResponseContext(token);
  const outcome = paramValue(resolvedSearchParams, "esito");
  const selectedResponse = paramValue(resolvedSearchParams, "risposta");

  if (!context) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-[#d9e1f2] bg-white p-6 text-center shadow-sm">
          <Image
            src="/brand/logo-santegidio.png"
            alt="Comunita di Sant'Egidio"
            width={112}
            height={52}
            className="mx-auto h-auto w-28"
            priority
          />
          <h1 className="mt-6 text-2xl font-semibold text-[#1b3272]">Link non valido</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Il link di risposta non e&apos; valido, e&apos; scaduto oppure e&apos; stato disattivato.
            Per aggiornare la risposta contattare la Segreteria.
          </p>
        </div>
      </main>
    );
  }

  const currentResponse = CURRENT_RESPONSE_LABELS[context.invitation.response_status] ?? "Risposta registrata";
  const submittedLabel = PUBLIC_RESPONSE_LABELS[selectedResponse as PublicResponseStatus];

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <Image
              src="/brand/logo-santegidio.png"
              alt="Comunita di Sant'Egidio"
              width={128}
              height={60}
              className="h-auto w-28"
              priority
            />
            <div className="rounded-full bg-[#1b3272]/10 px-3 py-1 text-xs font-semibold text-[#1b3272]">
              Risposta invito
            </div>
          </div>

          {outcome === "ok" ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Risposta registrata: <strong>{submittedLabel ?? "grazie"}</strong>.
            </div>
          ) : null}
          {outcome === "errore" ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Non e&apos; stato possibile registrare la risposta. Riprova oppure contatta la Segreteria.
            </div>
          ) : null}

          <div className="mt-7">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#d43c2f]">
              {publicContactName(context.contact)}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#1b3272]">
              {context.event.title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {formatPublicEventDate(context.event.starts_at)}
              {context.event.location ? ` - ${context.event.location}` : ""}
            </p>
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Valore attuale nell&apos;archivio: <strong>{currentResponse}</strong>
            </p>
          </div>

          <form action={submitPublicInvitationResponse} className="mt-7 space-y-4">
            <input type="hidden" name="token" value={token} />
            <fieldset className="space-y-3">
              <legend className="text-base font-semibold text-slate-900">
                Comunichi la sua risposta
              </legend>
              {PUBLIC_RESPONSE_STATUSES.map((status) => (
                <label
                  key={status}
                  className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#1b3272]"
                >
                  <input
                    type="radio"
                    name="responseStatus"
                    value={status}
                    defaultChecked={context.invitation.response_status === status}
                    className="mt-1 h-4 w-4 accent-[#1b3272]"
                    required
                  />
                  <span>
                    <span className="block font-semibold text-slate-900">
                      {PUBLIC_RESPONSE_LABELS[status]}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-slate-600">
                      {statusDescription(status)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#1b3272] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#263f86]"
            >
              Invia risposta
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
