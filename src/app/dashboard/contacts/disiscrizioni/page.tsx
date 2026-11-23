import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { invitationUnsubscriptions, unsubscribedAddresses } from "@/lib/email/invitation-unsubscriptions";

async function loadRows() {
  const entries = await invitationUnsubscriptions();
  const names = new Map<string, { id: number; label: string }[]>();
  if (entries.size) {
    const db = await createSupabaseServerClient();
    const contacts = await fetchAllSupabaseRows(() => db.from("contacts")
      .select("id,first_name,last_name,institution,email,email_2").is("deleted_at", null).order("id"));
    for (const contact of contacts) {
      for (const email of unsubscribedAddresses(contact, entries)) {
        const label = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.institution || "Apri scheda";
        const links = names.get(email) ?? [];
        links.push({ id: contact.id, label });
        names.set(email, links);
      }
    }
  }
  return [...entries].sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .map(([email, date]) => ({ email, date, contacts: names.get(email) ?? [] }));
}

export default async function UnsubscriptionsPage() {
  await requireManager();
  const rows = await loadRows().catch(() => null);
  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-8">
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/contacts" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Contatti</Link>
      <h1 className="my-4 text-3xl font-semibold text-[#1b3272]">Disiscrizioni dagli inviti</h1>
      {rows === null ? <p role="alert">Impossibile caricare le disiscrizioni. Riprova tra poco.</p>
        : rows.length === 0 ? <p>Nessuna disiscrizione dagli inviti.</p>
        : <ul className="divide-y divide-slate-200 rounded-xl bg-white px-5">
          {rows.map(row => <li key={row.email} className="space-y-1 py-4">
            <p className="font-semibold break-all">{row.email}</p>
            <p className="text-sm text-slate-600">Disiscrizione del {new Date(row.date).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</p>
            {row.contacts.length ? row.contacts.map(c => <Link key={c.id} href={`/dashboard/contacts?contactId=${c.id}`}
              className="block text-sm font-semibold text-[#1b3272] underline">{c.label}</Link>) : <p className="text-sm">Nessuna scheda associata</p>}
          </li>)}
        </ul>}
    </div>
  </main>;
}
