import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SettingsManagement } from "./settings-management";

export default async function SettingsPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const [languagesResult, contactsResult] = await Promise.all([
    supabase
      .from("contact_languages")
      .select("id,name,active,sort_order")
      .order("active", { ascending: false })
      .order("sort_order")
      .order("name"),
    supabase.from("contacts").select("spoken_language"),
  ]);

  if (languagesResult.error) throw languagesResult.error;
  if (contactsResult.error) throw contactsResult.error;

  const counts = new Map<string, number>();
  for (const contact of contactsResult.data ?? []) {
    const language = String(contact.spoken_language ?? "").trim();
    if (language) counts.set(language.toLowerCase(), (counts.get(language.toLowerCase()) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#b56b32] hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#173f5f]">Settings</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Impostazioni riutilizzabili dell&apos;archivio: lingue, gruppi, riferimenti e altre
            liste operative che aggiungeremo in futuro.
          </p>
        </header>
        <SettingsManagement
          languages={(languagesResult.data ?? []).map((language) => ({
            ...language,
            contact_count: counts.get(language.name.toLowerCase()) ?? 0,
          }))}
        />
      </div>
    </main>
  );
}
