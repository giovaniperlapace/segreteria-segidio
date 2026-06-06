import { LogoutButton } from "./logout-button";
import { requireProfile } from "@/lib/auth/profile";
import { BrandLogo } from "@/app/brand-logo";
import Link from "next/link";

const managerCards = [
  ["Utenti e ruoli", "Crea manager e referenti, assegna ruoli e gestisci gli accessi.", "/dashboard/users"],
  ["Contatti", "Gestione completa dell'archivio e dei dati mancanti.", "/dashboard/contacts"],
  ["Gruppi", "Categorie flessibili per organizzare e filtrare i contatti.", "/dashboard/groups"],
  ["Referenti", "Profili interni e assegnazioni dei contatti.", "/dashboard/references"],
  ["Settings", "Lingue e impostazioni operative riutilizzabili.", "/dashboard/settings"],
  ["Storico", "Audit modifiche e versioni contatto consultabili.", "/dashboard/audit"],
  ["Eventi", "Creazione eventi, liste invitati e risposte.", null],
];

export default async function DashboardPage() {
  const profile = await requireProfile();
  const isManager = profile.role === "manager";

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="shrink-0">
              <BrandLogo />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d43c2f]">
                Segreteria Segidio
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-[#1b3272]">
                Bentornato, {profile.first_name}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Ruolo: {isManager ? "Manager" : "Referente"}
              </p>
            </div>
          </div>
          <LogoutButton />
        </header>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {(isManager
            ? managerCards
            : [["I miei contatti", "Visualizza e aggiorna i contatti assegnati al tuo profilo.", "/dashboard/contacts"]]
          ).map(([title, description, href]) => (
            <article
              key={title}
              className="rounded-2xl border border-[#d9e1f2] bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-[#1b3272]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              {href ? (
                <Link
                  href={href}
                  className="mt-5 inline-block text-sm font-semibold text-[#d43c2f] hover:underline"
                >
                  Apri gestione →
                </Link>
              ) : (
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#d43c2f]">
                  Disponibile nelle prossime milestone
                </p>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
