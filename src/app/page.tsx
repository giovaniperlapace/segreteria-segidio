export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12 font-sans text-zinc-950">
      <main className="w-full max-w-3xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Setup progetto completato
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Segreteria Segidio
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
          Base Next.js pronta per avviare lo sviluppo dell&apos;MVP: contatti,
          riferimenti interni, eventi, liste invitati e gestione operativa delle
          risposte.
        </p>
      </main>
    </div>
  );
}
