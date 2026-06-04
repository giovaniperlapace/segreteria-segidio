"use server";

import { revalidatePath } from "next/cache";
import { isAppRole, requireManager, type AppRole } from "@/lib/auth/profile";
import { findAuthUserByEmail } from "@/lib/auth/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type UserActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getRequiredString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseRole(formData: FormData): AppRole | null {
  const role = getRequiredString(formData, "role");
  return isAppRole(role) ? role : null;
}

function friendlyError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);

  if (message.includes("LAST_ACTIVE_MANAGER")) {
    return "Non puoi disattivare o cambiare ruolo all'ultimo manager attivo.";
  }
  if (message.includes("profiles_email_unique_idx")) {
    return "Esiste gia' un utente autorizzato con questa email.";
  }
  if (message.includes("REFERENCE_ALREADY_LINKED")) {
    return "Il riferimento selezionato e' gia' collegato a un altro utente.";
  }
  if (message.includes("REFERENCE_NOT_FOUND")) {
    return "Il riferimento selezionato non esiste piu'.";
  }

  console.error("User administration failed", error);
  return "Operazione non riuscita. Riprova o controlla i dati inseriti.";
}

async function manageProfile(input: {
  actorProfileId: string;
  targetProfileId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
  active: boolean;
}) {
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("admin_manage_profile", {
    actor_profile_id: input.actorProfileId,
    target_profile_id: input.targetProfileId,
    target_email: input.email,
    target_first_name: input.firstName,
    target_last_name: input.lastName,
    target_role: input.role,
    target_active: input.active,
  });

  if (error) {
    throw error;
  }
}

export async function createUserAction(
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const manager = await requireManager();
  const firstName = getRequiredString(formData, "firstName");
  const lastName = getRequiredString(formData, "lastName");
  const email = getRequiredString(formData, "email").toLowerCase();
  const role = parseRole(formData);

  if (!firstName || !lastName || !EMAIL_PATTERN.test(email) || !role) {
    return {
      status: "error",
      message: "Nome, cognome, email e ruolo sono obbligatori.",
    };
  }

  try {
    const service = createSupabaseServiceClient();
    const { data: existingProfile, error: profileError } = await service
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (profileError) throw profileError;
    if (existingProfile) {
      return {
        status: "error",
        message: "Esiste gia' un utente autorizzato con questa email.",
      };
    }

    let authUser = await findAuthUserByEmail(email);
    if (!authUser) {
      const { data, error } = await service.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (error) throw error;
      authUser = data.user;
    }

    await manageProfile({
      actorProfileId: manager.id,
      targetProfileId: authUser.id,
      email,
      firstName,
      lastName,
      role,
      active: true,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/users");
    return {
      status: "success",
      message: `${[firstName, lastName].filter(Boolean).join(" ")} e' ora autorizzato come ${
        role === "manager" ? "manager" : "riferimento"
      }.`,
    };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function updateUserAction(
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const manager = await requireManager();
  const profileId = getRequiredString(formData, "profileId");
  const firstName = getRequiredString(formData, "firstName");
  const lastName = getRequiredString(formData, "lastName");
  const role = parseRole(formData);
  const active = formData.get("active") === "on";

  if (!profileId || !firstName || !lastName || !role) {
    return { status: "error", message: "Nome, cognome e ruolo sono obbligatori." };
  }

  try {
    const service = createSupabaseServiceClient();
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("email")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.email) {
      return { status: "error", message: "Utente non trovato." };
    }

    await manageProfile({
      actorProfileId: manager.id,
      targetProfileId: profileId,
      email: profile.email,
      firstName,
      lastName,
      role,
      active,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/users");
    return { status: "success", message: "Utente aggiornato correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}
