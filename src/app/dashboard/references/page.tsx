import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReferenceManagement } from "./reference-management";

export default async function ReferencesPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const [referencesResult, relations, contacts] = await Promise.all([
    supabase
      .from("internal_references")
      .select("id,first_name,last_name,full_name,email,phone,notes,active,profile_id")
      .is("deleted_at", null)
      .order("active", { ascending: false })
      .order("last_name")
      .order("first_name"),
    fetchAllSupabaseRows(() => supabase.from("contact_references").select("contact_id,reference_id")),
    fetchAllSupabaseRows(() =>
      supabase
        .from("contacts")
        .select("id,first_name,last_name,institutional_role,institution")
        .is("deleted_at", null)
        .order("last_name")
        .order("first_name"),
    ),
  ]);
  if (referencesResult.error) throw referencesResult.error;

  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const contactsByReference = new Map<number, typeof contacts>();
  const counts = new Map<number, number>();
  for (const relation of relations) {
    const contact = contactsById.get(relation.contact_id);
    if (!contact) continue;
    counts.set(relation.reference_id, (counts.get(relation.reference_id) ?? 0) + 1);
    contactsByReference.set(relation.reference_id, [
      ...(contactsByReference.get(relation.reference_id) ?? []),
      contact,
    ]);
  }
  for (const contacts of contactsByReference.values()) {
    contacts.sort((a, b) => {
      const aLabel = [a.last_name, a.first_name, a.institution].filter(Boolean).join(" ");
      const bLabel = [b.last_name, b.first_name, b.institution].filter(Boolean).join(" ");
      return aLabel.localeCompare(bLabel, "it", { sensitivity: "base" });
    });
  }

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#b56b32] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#173f5f]">Riferimenti interni</h1>
          <p className="mt-2 text-sm text-slate-600">Gestisci le persone interne a cui assegnare i contatti. Gli account reference vengono collegati automaticamente dalla gestione utenti.</p>
        </header>
        <ReferenceManagement references={(referencesResult.data ?? []).map((reference) => ({ ...reference, email: reference.email ? String(reference.email) : null, linked_profile: Boolean(reference.profile_id), contact_count: counts.get(reference.id) ?? 0, contacts: contactsByReference.get(reference.id) ?? [] }))} />
      </div>
    </main>
  );
}
