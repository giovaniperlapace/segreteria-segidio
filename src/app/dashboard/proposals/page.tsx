import Link from "next/link";
import { requireProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProposalReview, type ProposalRecord } from "./proposal-review";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const profile = await requireProfile();
  if (profile.role !== "reference") {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <p className="mt-8 rounded-2xl bg-white p-6 text-slate-600">La coda approvazioni è riservata ai referenti.</p>
        </div>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitation_proposals")
    .select(
      "id,status,manager_note,decision_note,event_id,events!inner(title,starts_at),contacts!inner(first_name,last_name,institution,institutional_role,email)",
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const proposals = (data ?? []).map((row) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    return {
      id: Number(row.id),
      eventId: Number(row.event_id),
      eventTitle: event?.title ?? "Evento",
      eventStartsAt: event?.starts_at ?? new Date().toISOString(),
      contactName:
        [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") ||
        contact?.institution ||
        "Contatto senza nome",
      contactDetail: [contact?.institutional_role, contact?.institution, contact?.email]
        .filter(Boolean)
        .join(" · "),
      managerNote: row.manager_note,
      status: row.status,
      decisionNote: row.decision_note,
    };
  }) as ProposalRecord[];

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Proposte di invito</h1>
          <p className="mt-2 text-sm text-slate-600">
            Approva o escludi i contatti associati a te. La decisione non invia automaticamente l&apos;invito.
          </p>
        </header>
        <ProposalReview proposals={proposals} />
      </div>
    </main>
  );
}
