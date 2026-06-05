import Link from "next/link";
import { requireProfile } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ContactManagement, type ContactRecord } from "./contact-management";

export default async function ContactsPage() {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  const [contacts, groupsResult, referencesResult, languagesResult, contactGroups, contactReferences, missingRows] =
    await Promise.all([
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
      fetchAllSupabaseRows(() => supabase.from("contact_references").select("contact_id,reference_id")),
      fetchAllSupabaseRows(() => supabase.from("contacts_missing_required_data").select("id,missing_fields")),
    ]);

  for (const result of [groupsResult, referencesResult, languagesResult]) {
    if (result.error) throw result.error;
  }

  const groupIdsByContact = new Map<number, number[]>();
  for (const relation of contactGroups) {
    groupIdsByContact.set(relation.contact_id, [...(groupIdsByContact.get(relation.contact_id) ?? []), relation.group_id]);
  }
  const referenceIdsByContact = new Map<number, number[]>();
  for (const relation of contactReferences) {
    referenceIdsByContact.set(relation.contact_id, [...(referenceIdsByContact.get(relation.contact_id) ?? []), relation.reference_id]);
  }
  const selectedReferenceIds = new Set(contactReferences.map((relation) => relation.reference_id));
  const missingByContact = new Map(missingRows.map((row) => [row.id, row.missing_fields ?? []]));

  const contactRecords = contacts.map((contact) => ({
    ...contact,
    group_ids: groupIdsByContact.get(contact.id) ?? [],
    reference_ids: referenceIdsByContact.get(contact.id) ?? [],
    missing_fields: missingByContact.get(contact.id) ?? [],
  })) as ContactRecord[];

  contactRecords.sort((a, b) => {
    const aHasPersonName = Boolean(a.first_name || a.last_name);
    const bHasPersonName = Boolean(b.first_name || b.last_name);
    if (aHasPersonName !== bHasPersonName) return aHasPersonName ? -1 : 1;

    const aLabel = [a.last_name, a.first_name, a.institution].filter(Boolean).join(" ");
    const bLabel = [b.last_name, b.first_name, b.institution].filter(Boolean).join(" ");
    return aLabel.localeCompare(bLabel, "it", { sensitivity: "base" });
  });

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Contatti</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {profile.role === "manager"
              ? "Gestisci l'archivio, le associazioni e i dati mancanti."
              : "Visualizza e aggiorna i contatti assegnati al tuo profilo."}
          </p>
        </header>
          <ContactManagement
          contacts={contactRecords}
          groups={(groupsResult.data ?? []).map((group) => ({ id: group.id, name: group.name, active: group.active }))}
          references={(referencesResult.data ?? [])
            .filter((reference) => reference.active || selectedReferenceIds.has(reference.id))
            .map((reference) => ({ id: reference.id, name: reference.full_name, active: reference.active }))}
          languages={(languagesResult.data ?? []).map((language) => ({
            id: language.id,
            name: language.name,
            active: language.active,
          }))}
          isManager={profile.role === "manager"}
          viewPreferenceKey={`contacts-view:${profile.id}`}
        />
      </div>
    </main>
  );
}
