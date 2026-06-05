import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReferenceManagement } from "./reference-management";
import type { ContactRecord } from "../contacts/contact-management";

export default async function ReferencesPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const [
    referencesResult,
    contactReferenceRelations,
    contacts,
    groupsResult,
    referenceOptionsResult,
    languagesResult,
    contactGroupRelations,
    missingRows,
  ] = await Promise.all([
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
        .select("id,honorific_title,first_name,last_name,institutional_role,institution,email,phone,mobile_phone,address_line,postal_code,city,country,spoken_language,website,notes,missing_data_notes,status,priority")
        .is("deleted_at", null)
        .order("last_name")
        .order("first_name"),
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
    fetchAllSupabaseRows(() => supabase.from("contact_groups").select("contact_id,group_id")),
    fetchAllSupabaseRows(() => supabase.from("contacts_missing_required_data").select("id,missing_fields")),
  ]);
  for (const result of [referencesResult, groupsResult, referenceOptionsResult, languagesResult]) {
    if (result.error) throw result.error;
  }

  const groupIdsByContact = new Map<number, number[]>();
  for (const relation of contactGroupRelations) {
    groupIdsByContact.set(relation.contact_id, [
      ...(groupIdsByContact.get(relation.contact_id) ?? []),
      relation.group_id,
    ]);
  }
  const referenceIdsByContact = new Map<number, number[]>();
  for (const relation of contactReferenceRelations) {
    referenceIdsByContact.set(relation.contact_id, [
      ...(referenceIdsByContact.get(relation.contact_id) ?? []),
      relation.reference_id,
    ]);
  }
  const selectedReferenceIds = new Set(contactReferenceRelations.map((relation) => relation.reference_id));
  const missingByContact = new Map(missingRows.map((row) => [row.id, row.missing_fields ?? []]));

  const contactRecords = contacts.map((contact) => ({
    ...contact,
    group_ids: groupIdsByContact.get(contact.id) ?? [],
    reference_ids: referenceIdsByContact.get(contact.id) ?? [],
    missing_fields: missingByContact.get(contact.id) ?? [],
  })) as ContactRecord[];

  const contactsById = new Map(contactRecords.map((contact) => [contact.id, contact]));
  const contactsByReference = new Map<number, ContactRecord[]>();
  const counts = new Map<number, number>();
  for (const relation of contactReferenceRelations) {
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
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Riferimenti interni</h1>
          <p className="mt-2 text-sm text-slate-600">Gestisci le persone interne a cui assegnare i contatti. Gli account reference vengono collegati automaticamente dalla gestione utenti.</p>
        </header>
        <ReferenceManagement
          references={(referencesResult.data ?? []).map((reference) => ({
            ...reference,
            email: reference.email ? String(reference.email) : null,
            linked_profile: Boolean(reference.profile_id),
            contact_count: counts.get(reference.id) ?? 0,
            contacts: contactsByReference.get(reference.id) ?? [],
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
