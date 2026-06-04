import { LogoutButton } from "./logout-button";
import { requireProfile } from "@/lib/auth/profile";
import Link from "next/link";

const managerCards = [
  ["Utenti e ruoli", "Crea manager e riferimenti, assegna ruoli e gestisci gli accessi.", "/dashboard/users"],
  ["Contatti", "Gestione completa dell'archivio e dei dati mancanti.", null],
  ["Riferimenti", "Profili interni e assegnazioni dei contatti.", null],
  ["Eventi", "Creazione eventi, liste invitati e risposte.", null],
];

export default async function DashboardPage() {
  const profile = await requireProfile();
  const isManager = profile.role === "manager";

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b56b32]">
              Segreteria Segidio
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#173f5f]">
              Bentornato, {profile.full_name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Ruolo: {isManager ? "Manager" : "Persona di riferimento"}
            </p>
          </div>
          <LogoutButton />
        </header>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {(isManager
            ? managerCards
            : [["I miei contatti", "Visualizza i contatti assegnati al tuo profilo."]]
          ).map(([title, description, href]) => (
            <article
              key={title}
              className="rounded-2xl border border-[#d8d1bd] bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-[#173f5f]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              {href ? (
                <Link
                  href={href}
                  className="mt-5 inline-block text-sm font-semibold text-[#b56b32] hover:underline"
                >
                  Apri gestione →
                </Link>
              ) : (
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#b56b32]">
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
