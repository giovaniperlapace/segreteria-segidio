import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateContact } from "@/app/dashboard/events/[eventId]/build/build-selection";

export type CandidateExportContact = CandidateContact & { firstName: string | null; lastName: string | null };

export type SearchParams = Record<string, string | string[] | undefined>;
type FilterMatchMode = "or" | "and";

function values(params: SearchParams, key: string) {
  const raw = params[key];
  return (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function ids(params: SearchParams, key: string) {
  return [...new Set(values(params, key).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))];
}

export function one(params: SearchParams, key: string) {
  return values(params, key)[0] ?? "";
}

export function matchMode(params: SearchParams): FilterMatchMode {
  return one(params, "match") === "or" ? "or" : "and";
}


export function candidateSearchArgs(eventId: number, query: SearchParams) {
  return {
    p_event_id: eventId,
    p_search: one(query, "q").toLocaleLowerCase("it"),
    p_status: one(query, "status") || "active",
    p_match: matchMode(query),
    p_priority: one(query, "priority") || "all",
    p_missing: one(query, "missing") || "all",
    p_group_ids: ids(query, "groupIds"),
    p_reference_ids: ids(query, "referenceIds"),
    p_past_event_ids: ids(query, "pastEventIds"),
    p_past_response: one(query, "pastResponse") || "all",
    p_past_attendance: one(query, "pastAttendance") || "all",
  };
}

export async function addCandidateCountries(supabase: SupabaseClient, candidates: CandidateContact[]) {
  const result: CandidateExportContact[] = [];
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const batch = candidates.slice(offset, offset + 100);
    const { data, error } = await supabase.from("contacts").select("id,country,first_name,last_name").in("id", batch.map((row) => row.id));
    if (error) throw error;
    const contacts = new Map((data ?? []).map((row) => [Number(row.id), row]));
    result.push(...batch.map((row) => ({ ...row,
      country: contacts.get(row.id)?.country ?? null,
      firstName: contacts.get(row.id)?.first_name ?? null,
      lastName: contacts.get(row.id)?.last_name ?? null,
    })));
  }
  return result;
}

export async function loadAllCandidates(supabase: SupabaseClient, eventId: number, query: SearchParams) {
  const candidates: CandidateContact[] = [];
  let total = 0;
  do {
    const { data, error } = await supabase.rpc("event_candidate_contacts_page", {
      ...candidateSearchArgs(eventId, query), p_limit: 100, p_offset: candidates.length,
    });
    if (error) throw error;
    const rows = (data ?? []) as { candidate: CandidateContact; total_count: number }[];
    if (!rows.length) {
      if (candidates.length < total) throw new Error("Elenco modificato durante l'esportazione. Riprovare.");
      break;
    }
    const currentTotal = Number(rows[0].total_count);
    if (candidates.length && currentTotal !== total) throw new Error("Elenco modificato durante l'esportazione. Riprovare.");
    total = currentTotal;
    candidates.push(...rows.map((row) => row.candidate));
  } while (candidates.length < total);
  if (new Set(candidates.map((row) => row.id)).size !== candidates.length) {
    throw new Error("Elenco modificato durante l'esportazione. Riprovare.");
  }
  return addCandidateCountries(supabase, candidates);
}
