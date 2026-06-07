"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ArchiveActionState } from "../archive-actions";

const DECISIONS = ["approved", "excluded"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function decideInvitationProposalAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireProfile();
  if (profile.role !== "reference") {
    return { status: "error", message: "Questa operazione e' riservata ai referenti." };
  }

  const proposalId = Number(text(formData, "proposalId"));
  const eventId = Number(text(formData, "eventId"));
  const decision = text(formData, "decision");
  if (
    !Number.isSafeInteger(proposalId) ||
    proposalId <= 0 ||
    !Number.isSafeInteger(eventId) ||
    eventId <= 0 ||
    !DECISIONS.includes(decision as (typeof DECISIONS)[number])
  ) {
    return { status: "error", message: "Proposta non valida." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("invitation_proposals")
      .update({
        status: decision,
        decision_note: text(formData, "decisionNote") || null,
        decided_by_profile_id: profile.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", proposalId)
      .eq("status", "pending");
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/proposals");
    revalidatePath(`/dashboard/events/${eventId}/build`);
    return {
      status: "success",
      message: decision === "approved" ? "Proposta approvata." : "Proposta esclusa.",
    };
  } catch (error) {
    console.error("Proposal decision failed", error);
    return { status: "error", message: "Decisione non salvata. Riprova." };
  }
}
