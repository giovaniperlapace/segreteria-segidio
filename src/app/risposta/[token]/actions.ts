"use server";

import { redirect } from "next/navigation";
import { publicResponseChoice } from "@/lib/email/public-response-links";
import { recordPublicInvitationResponse } from "@/lib/invitations/public-responses";

function formText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function submitPublicInvitationResponse(formData: FormData) {
  const token = formText(formData, "token");
  const response = publicResponseChoice(formText(formData, "responseStatus"));
  const target = token ? `/risposta/${encodeURIComponent(token)}` : "/risposta/non-valido";

  if (!token || !response) {
    redirect(`${target}?esito=errore`);
  }

  const delegate = response === "delegated"
    ? {
        firstName: formText(formData, "delegateFirstName"),
        lastName: formText(formData, "delegateLastName"),
        email: formText(formData, "delegateEmail"),
      }
    : null;

  if (
    response === "delegated" &&
    (!delegate?.firstName ||
      !delegate.lastName ||
      delegate.firstName.length > 200 ||
      delegate.lastName.length > 200 ||
      delegate.email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(delegate.email))
  ) {
    redirect(`${target}?esito=dati-delegato`);
  }

  const result = await recordPublicInvitationResponse(token, response, delegate);
  if (!result) {
    redirect(`${target}?esito=errore`);
  }

  redirect(`${target}?esito=ok&risposta=${response}`);
}
