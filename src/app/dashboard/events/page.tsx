import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { EventManagement, type EventRecord } from "./event-management";

export const dynamic = "force-dynamic";

type EventsSearchParams = Record<string, string | string[] | undefined>;

function paramValue(searchParams: EventsSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function sanitizeSearchTerm(value: string) {
  return value.trim().replace(/[%*,]/g, " ").replace(/\s+/g, " ");
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<EventsSearchParams>;
}) {
  await requireManager();
  const params = (await searchParams) ?? {};
  const search = sanitizeSearchTerm(paramValue(params, "q"));
  const status = paramValue(params, "status") || "all";
  const supabase = createSupabaseServiceClient();

  let eventsQuery = supabase
    .from("events")
    .select(
      "id,title,description,starts_at,ends_at,location,organizational_notes,status,legacy_access_id",
    )
    .order("starts_at", { ascending: false })
    .limit(120);

  if (search) {
    const pattern = `%${search}%`;
    eventsQuery = eventsQuery.or(`title.ilike.${pattern},description.ilike.${pattern},location.ilike.${pattern}`);
  }
  if (status === "open") {
    eventsQuery = eventsQuery.in("status", ["draft", "active"]);
  } else if (["draft", "active", "concluded", "archived"].includes(status)) {
    eventsQuery = eventsQuery.eq("status", status);
  }

  const { data: events, error } = await eventsQuery;
  if (error) throw error;

  const eventIds = (events ?? []).map((event) => Number(event.id));
  const countsResult =
    eventIds.length > 0
      ? await supabase.rpc("event_invitation_counts", { p_event_ids: eventIds })
      : { data: [], error: null };
  if (countsResult.error) throw countsResult.error;

  const counts = new Map<
    number,
    { invitation_count: number; attending_count: number; attended_count: number; attention_count: number }
  >();
  for (const row of countsResult.data ?? []) {
    const eventId = Number(row.event_id);
    counts.set(eventId, {
      invitation_count: Number(row.invitation_count),
      attending_count: Number(row.attending_count),
      attended_count: Number(row.attended_count),
      attention_count: Number(row.attention_count),
    });
  }

  const records = (events ?? []).map((event) => ({
    ...event,
    invitation_count: counts.get(event.id)?.invitation_count ?? 0,
    attending_count: counts.get(event.id)?.attending_count ?? 0,
    attended_count: counts.get(event.id)?.attended_count ?? 0,
    attention_count: counts.get(event.id)?.attention_count ?? 0,
  })) as EventRecord[];

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Eventi</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Crea eventi, consulta liste inviti e ricostruisci lo storico delle partecipazioni importato da Access.
          </p>
          <form className="mt-5 grid gap-3 rounded-2xl border border-[#d9e1f2] bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_auto]">
            <input
              name="q"
              defaultValue={search}
              placeholder="Cerca per titolo, descrizione o luogo"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
            />
            <select
              name="status"
              defaultValue={status}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
            >
              <option value="all">Tutti gli stati</option>
              <option value="open">In preparazione o attivi</option>
              <option value="draft">Bozza</option>
              <option value="active">Attivo</option>
              <option value="concluded">Concluso</option>
              <option value="archived">Archiviato</option>
            </select>
            <button className="rounded-xl bg-[#1b3272] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263f86]">
              Filtra
            </button>
          </form>
        </header>

        <EventManagement events={records} />
      </div>
    </main>
  );
}
