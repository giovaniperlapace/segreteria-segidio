import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GroupManagement } from "./group-management";

export default async function GroupsPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const [groupsResult, relationsResult] = await Promise.all([
    supabase.from("groups").select("id,name,description,active").order("active", { ascending: false }).order("name"),
    supabase.from("contact_groups").select("group_id"),
  ]);
  if (groupsResult.error) throw groupsResult.error;
  if (relationsResult.error) throw relationsResult.error;
  const counts = new Map<number, number>();
  for (const relation of relationsResult.data ?? []) counts.set(relation.group_id, (counts.get(relation.group_id) ?? 0) + 1);

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#b56b32] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#173f5f]">Gruppi</h1>
          <p className="mt-2 text-sm text-slate-600">Crea categorie flessibili e disattiva quelle non piu&apos; operative senza perdere le associazioni.</p>
        </header>
        <GroupManagement groups={(groupsResult.data ?? []).map((group) => ({ ...group, contact_count: counts.get(group.id) ?? 0 }))} />
      </div>
    </main>
  );
}
