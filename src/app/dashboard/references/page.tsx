import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReferenceManagement } from "./reference-management";

export default async function ReferencesPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const [
    referencesResult,
    contactReferenceRelations,
    groupsResult,
    referenceOptionsResult,
    languagesResult,
  ] = await Promise.all([
    supabase
      .from("internal_references")
      .select("id,first_name,last_name,full_name,email,phone,notes,active,profile_id")
      .is("deleted_at", null)
      .order("active", { ascending: false })
      .order("last_name")
      .order("first_name"),
    fetchAllSupabaseRows(() =>
      supabase
        .from("contact_references")
        .select("reference_id,contacts!inner(id)")
        .is("contacts.deleted_at", null),
    ),
    supabase.from("groups").select("id,name,active").order("active", { ascending: false }).order("name"),
    supabase
      .from("internal_references")
      .select("id,full_name,active")
      .is("deleted_at", null)
      .order("active", { ascending: false })
      .order("full_name"),
    supabase
      .from("contact_languages")
      .select("id,name,active,sort_order")
      .order("active", { ascending: false })
      .order("sort_order")
      .order("name"),
  ]);
  for (const result of [referencesResult, groupsResult, referenceOptionsResult, languagesResult]) {
    if (result.error) throw result.error;
  }

  const selectedReferenceIds = new Set(contactReferenceRelations.map((relation) => relation.reference_id));
  const counts = new Map<number, number>();
  for (const relation of contactReferenceRelations) {
    counts.set(relation.reference_id, (counts.get(relation.reference_id) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Referenti interni</h1>
          <p className="mt-2 text-sm text-slate-600">Gestisci i referenti interni a cui assegnare i contatti. Gli account dei referenti vengono collegati automaticamente dalla gestione utenti.</p>
        </header>
        <ReferenceManagement
          references={(referencesResult.data ?? []).map((reference) => ({
            ...reference,
            email: reference.email ? String(reference.email) : null,
            linked_profile: Boolean(reference.profile_id),
            contact_count: counts.get(reference.id) ?? 0,
          }))}
          groups={(groupsResult.data ?? []).map((group) => ({
            id: group.id,
            name: group.name,
            active: group.active,
          }))}
          contactReferences={(referenceOptionsResult.data ?? [])
            .filter((reference) => reference.active || selectedReferenceIds.has(reference.id))
            .map((reference) => ({
              id: reference.id,
              name: reference.full_name,
              active: reference.active,
            }))}
          languages={(languagesResult.data ?? []).map((language) => ({
            id: language.id,
            name: language.name,
            active: language.active,
          }))}
        />
      </div>
    </main>
  );
}
