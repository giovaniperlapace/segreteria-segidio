"use server";

import { requireProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invitationUnsubscriptions, unsubscribedAddresses } from "@/lib/email/invitation-unsubscriptions";

export async function contactUnsubscriptions(id: number) {
  await requireProfile();
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("contacts").select("email,email_2").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!data) return [];
  return unsubscribedAddresses(data, await invitationUnsubscriptions());
}
