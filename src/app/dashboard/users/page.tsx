import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { UserManagement } from "./user-management";

export default async function UsersPage() {
  const manager = await requireManager();
  const service = createSupabaseServiceClient();

  const { data: profiles, error: profilesError } = await service
    .from("profiles")
    .select("id,first_name,last_name,email,role,active")
    .order("active", { ascending: false })
    .order("last_name")
    .order("first_name");

  if (profilesError) throw profilesError;

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-[#b56b32] hover:underline"
            >
              ← Dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-semibold text-[#173f5f]">
              Utenti e ruoli
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Crea gli utenti autorizzati, assegna il ruolo e gestisci gli accessi.
            </p>
          </div>
        </header>

        <UserManagement
          currentProfileId={manager.id}
          users={profiles.map((profile) => ({
            ...profile,
            email: profile.email ?? "",
          }))}
        />
      </div>
    </main>
  );
}
