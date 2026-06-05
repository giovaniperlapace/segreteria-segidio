import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReferenceManagement } from "./reference-management";

export default async function ReferencesPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const [referencesResult, relationsResult] = await Promise.all([
    supabase.from("internal_references").select("id,full_name,email,phone,notes,active,profile_id").order("active", { ascending: false }).order("full_name"),
    supabase.from("contact_references").select("reference_id"),
  ]);
  if (referencesResult.error) throw referencesResult.error;
  if (relationsResult.error) throw relationsResult.error;
  const counts = new Map<number, number>();
  for (const relation of relationsResult.data ?? []) counts.set(relation.reference_id, (counts.get(relation.reference_id) ?? 0) + 1);

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#b56b32] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#173f5f]">Riferimenti interni</h1>
          <p className="mt-2 text-sm text-slate-600">Gestisci le persone interne a cui assegnare i contatti. Gli account reference vengono collegati automaticamente dalla gestione utenti.</p>
        </header>
        <ReferenceManagement references={(referencesResult.data ?? []).map((reference) => ({ ...reference, email: reference.email ? String(reference.email) : null, linked_profile: Boolean(reference.profile_id), contact_count: counts.get(reference.id) ?? 0 }))} />
      </div>
    </main>
  );
}
