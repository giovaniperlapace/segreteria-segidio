"use server";

import { redirect } from "next/navigation";
import { publicResponseChoice } from "@/lib/email/public-response-links";
import { recordPublicInvitationResponse, recordPublicPartResponses } from "@/lib/invitations/public-responses";

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
        role: formText(formData, "delegateRole") || null,
      }
    : null;

  if (
    response === "delegated" &&
    (!delegate?.firstName ||
      !delegate.lastName ||
      delegate.firstName.length > 200 ||
      delegate.lastName.length > 200 ||
      delegate.email.length > 320 ||
      (delegate.role?.length ?? 0) > 200 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(delegate.email))
  ) {
    redirect(`${target}?esito=dati-delegato`);
  }

  const withCompanions = response === "attending" && formData.has("withCompanions");
  const count = withCompanions ? Number(formText(formData, "companionCount")) : 0;
  const names = withCompanions ? formText(formData, "companionNames") || null : null;
  if (withCompanions && (!Number.isInteger(count) || count < 1 || count > 20 || (names?.length ?? 0) > 2000)) {
    redirect(`${target}?esito=errore`);
  }
  const result = await recordPublicInvitationResponse(token, response, delegate, count, names);
  if (!result) {
    redirect(`${target}?esito=errore`);
  }

  if (result === "unchanged") redirect(`${target}?esito=invariata`);
  redirect(`${target}?esito=ok&risposta=${response}`);
}

export async function submitPublicPartResponses(formData: FormData) {
  const token = formText(formData, 'token');
  const target = `/risposta/${encodeURIComponent(token || 'non-valido')}`;
  let success = false;
  try { success = await recordPublicPartResponses(token, formText(formData, 'partResponses')); }
  catch (error) { console.error('Composite response failed', error); }
  redirect(`${target}?esito=${success ? 'ok' : 'errore'}`);
}
