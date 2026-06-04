import { LogoutButton } from "./logout-button";
import { requireProfile } from "@/lib/auth/profile";

const managerCards = [
  ["Contatti", "Gestione completa dell'archivio e dei dati mancanti."],
  ["Riferimenti", "Profili interni e assegnazioni dei contatti."],
  ["Eventi", "Creazione eventi, liste invitati e risposte."],
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
              Ruolo: {isManager ? "Manager" : "Riferimento interno"}
            </p>
          </div>
          <LogoutButton />
        </header>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {(isManager
            ? managerCards
            : [["I miei contatti", "Visualizza i contatti assegnati al tuo profilo."]]
          ).map(([title, description]) => (
            <article
              key={title}
              className="rounded-2xl border border-[#d8d1bd] bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-[#173f5f]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#b56b32]">
                Disponibile nelle prossime milestone
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
