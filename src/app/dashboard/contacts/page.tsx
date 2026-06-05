import Link from "next/link";
import { requireProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ContactManagement, type ContactRecord } from "./contact-management";

export default async function ContactsPage() {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  const [contactsResult, groupsResult, referencesResult, languagesResult, contactGroupsResult, contactReferencesResult, missingResult] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id,honorific_title,first_name,last_name,institutional_role,institution,email,phone,mobile_phone,address_line,postal_code,city,country,spoken_language,website,notes,missing_data_notes,status,priority")
        .order("last_name")
        .order("first_name"),
      supabase.from("groups").select("id,name,active").order("active", { ascending: false }).order("name"),
      supabase.from("internal_references").select("id,full_name,active").order("active", { ascending: false }).order("full_name"),
      supabase
        .from("contact_languages")
        .select("id,name,active,sort_order")
        .order("active", { ascending: false })
        .order("sort_order")
        .order("name"),
      supabase.from("contact_groups").select("contact_id,group_id"),
      supabase.from("contact_references").select("contact_id,reference_id"),
      supabase.from("contacts_missing_required_data").select("id,missing_fields"),
    ]);

  for (const result of [contactsResult, groupsResult, referencesResult, languagesResult, contactGroupsResult, contactReferencesResult, missingResult]) {
    if (result.error) throw result.error;
  }

  const groupIdsByContact = new Map<number, number[]>();
  for (const relation of contactGroupsResult.data ?? []) {
    groupIdsByContact.set(relation.contact_id, [...(groupIdsByContact.get(relation.contact_id) ?? []), relation.group_id]);
  }
  const referenceIdsByContact = new Map<number, number[]>();
  for (const relation of contactReferencesResult.data ?? []) {
    referenceIdsByContact.set(relation.contact_id, [...(referenceIdsByContact.get(relation.contact_id) ?? []), relation.reference_id]);
  }
  const missingByContact = new Map((missingResult.data ?? []).map((row) => [row.id, row.missing_fields ?? []]));

  const contacts = (contactsResult.data ?? []).map((contact) => ({
    ...contact,
    group_ids: groupIdsByContact.get(contact.id) ?? [],
    reference_ids: referenceIdsByContact.get(contact.id) ?? [],
    missing_fields: missingByContact.get(contact.id) ?? [],
  })) as ContactRecord[];

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#b56b32] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#173f5f]">Contatti</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {profile.role === "manager"
              ? "Gestisci l'archivio, le associazioni e i dati mancanti."
              : "Visualizza e aggiorna i contatti assegnati al tuo profilo."}
          </p>
        </header>
        <ContactManagement
          contacts={contacts}
          groups={(groupsResult.data ?? []).map((group) => ({ id: group.id, name: group.name, active: group.active }))}
          references={(referencesResult.data ?? []).map((reference) => ({ id: reference.id, name: reference.full_name, active: reference.active }))}
          languages={(languagesResult.data ?? []).map((language) => ({
            id: language.id,
            name: language.name,
            active: language.active,
          }))}
          isManager={profile.role === "manager"}
        />
      </div>
    </main>
  );
}
