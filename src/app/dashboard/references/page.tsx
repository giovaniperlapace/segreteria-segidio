import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReferenceManagement } from "./reference-management";

type ReferencesSearchParams = Record<string, string | string[] | undefined>;

function paramValue(searchParams: ReferencesSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReferencesPage({
  searchParams,
}: {
  searchParams?: Promise<ReferencesSearchParams>;
}) {
  await requireManager();
  const params = (await searchParams) ?? {};
  const showAllReferences = paramValue(params, "show") === "all";
  const supabase = await createSupabaseServerClient();

  const contactReferenceRelations = await fetchAllSupabaseRows(() =>
    supabase
      .from("contact_references")
      .select("reference_id,contacts!inner(id)")
      .is("contacts.deleted_at", null)
      .eq("contacts.status", "active"),
  );

  const selectedReferenceIds = new Set(contactReferenceRelations.map((relation) => relation.reference_id));
  const counts = new Map<number, number>();
  for (const relation of contactReferenceRelations) {
    counts.set(relation.reference_id, (counts.get(relation.reference_id) ?? 0) + 1);
  }

  const activeReferenceIds = [...selectedReferenceIds];
  const referencesQuery = supabase
    .from("internal_references")
    .select("id,first_name,last_name,full_name,email,phone,notes,active,profile_id")
    .is("deleted_at", null)
    .order("active", { ascending: false })
    .order("last_name")
    .order("first_name");

  const [
    referencesResult,
    groupsResult,
    referenceOptionsResult,
    languagesResult,
  ] = await Promise.all([
    !showAllReferences && activeReferenceIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : showAllReferences
        ? referencesQuery
        : referencesQuery.in("id", activeReferenceIds),
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

  const totalReferenceCount = referenceOptionsResult.data?.length ?? 0;

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Referenti interni</h1>
          <p className="mt-2 text-sm text-slate-600">Gestisci i referenti interni a cui assegnare i contatti. Gli account dei referenti vengono collegati automaticamente dalla gestione utenti.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-600">
              {showAllReferences
                ? `Stai vedendo tutti i ${totalReferenceCount} referenti.`
                : `${activeReferenceIds.length} referenti con almeno un contatto attivo.`}
            </span>
            <Link
              href={showAllReferences ? "/dashboard/references" : "/dashboard/references?show=all"}
              className="rounded-xl border border-[#1b3272] bg-white px-3 py-2 text-sm font-semibold text-[#1b3272] transition hover:bg-[#1b3272]/10"
            >
              {showAllReferences ? "Mostra solo con contatti attivi" : "Mostra tutti i referenti"}
            </Link>
          </div>
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
