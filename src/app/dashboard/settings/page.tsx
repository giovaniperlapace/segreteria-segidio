import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SettingsManagement } from "./settings-management";

export default async function SettingsPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const [languagesResult, contacts, groupsResult, groupRelations] = await Promise.all([
    supabase
      .from("contact_languages")
      .select("id,name,active,sort_order")
      .order("active", { ascending: false })
      .order("sort_order")
      .order("name"),
    fetchAllSupabaseRows(() => supabase.from("contacts").select("spoken_language")),
    supabase
      .from("groups")
      .select("id,name,description,active")
      .order("active", { ascending: false })
      .order("name"),
    fetchAllSupabaseRows(() => supabase.from("contact_groups").select("group_id")),
  ]);

  if (languagesResult.error) throw languagesResult.error;
  if (groupsResult.error) throw groupsResult.error;

  const languageCounts = new Map<string, number>();
  for (const contact of contacts) {
    const language = String(contact.spoken_language ?? "").trim();
    if (language) {
      languageCounts.set(language.toLowerCase(), (languageCounts.get(language.toLowerCase()) ?? 0) + 1);
    }
  }
  const groupCounts = new Map<number, number>();
  for (const relation of groupRelations) {
    groupCounts.set(Number(relation.group_id), (groupCounts.get(Number(relation.group_id)) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Settings</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Impostazioni riutilizzabili dell&apos;archivio: lingue e gruppi operativi.
          </p>
        </header>
        <SettingsManagement
          languages={(languagesResult.data ?? []).map((language) => ({
            ...language,
            contact_count: languageCounts.get(language.name.toLowerCase()) ?? 0,
          }))}
          groups={(groupsResult.data ?? []).map((group) => ({
            ...group,
            contact_count: groupCounts.get(group.id) ?? 0,
          }))}
        />
      </div>
    </main>
  );
}
