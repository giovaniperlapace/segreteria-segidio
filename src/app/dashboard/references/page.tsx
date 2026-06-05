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
        .select("id,legacy_access_old_archive_id,honorific_title,honorific_title_english,honorific_title_invitation,first_name,last_name,legacy_description,institutional_role,institutional_role_english,institutional_role_invitation,institution,legacy_salutation,email,email_2,phone,phone_home,phone_office_2,mobile_phone,fax,fax_home,telex_office,address_line,postal_code,city,country,home_address_line,home_postal_code,home_city,home_province,home_country,office_name,office_address_line,office_postal_code,office_city,office_province,office_country,spoken_language,spoken_language_2,invitation_language,translation_language,religion,legacy_organization_id,legacy_organization_name,legacy_office_site,mail_address_preference,legacy_contacts_raw,accompanist,legacy_archive_type,legacy_created_at,legacy_updated_at,legacy_invitation_group,website,website_2,notes,missing_data_notes,status,priority")
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
