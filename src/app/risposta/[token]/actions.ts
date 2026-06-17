"use server";

import { redirect } from "next/navigation";
import { publicResponseStatus } from "@/lib/email/public-response-links";
import { recordPublicInvitationResponse } from "@/lib/invitations/public-responses";

function formText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function submitPublicInvitationResponse(formData: FormData) {
  const token = formText(formData, "token");
  const response = publicResponseStatus(formText(formData, "responseStatus"));
  const target = token ? `/risposta/${encodeURIComponent(token)}` : "/risposta/non-valido";

  if (!token || !response) {
    redirect(`${target}?esito=errore`);
  }

  const result = await recordPublicInvitationResponse(token, response);
  if (!result) {
    redirect(`${target}?esito=errore`);
  }

  redirect(`${target}?esito=ok&risposta=${response}`);
}
