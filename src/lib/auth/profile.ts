import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const APP_ROLES = ["manager", "reference"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AppProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  active: boolean;
};

export function isAppRole(value: unknown): value is AppRole {
  return APP_ROLES.includes(value as AppRole);
}

export async function requireProfile(): Promise<AppProfile> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.active || !isAppRole(profile.role)) {
    redirect("/login?error=access");
  }

  return profile as AppProfile;
}

export async function requireManager(): Promise<AppProfile> {
  const profile = await requireProfile();

  if (profile.role !== "manager") {
    redirect("/dashboard");
  }

  return profile;
}
