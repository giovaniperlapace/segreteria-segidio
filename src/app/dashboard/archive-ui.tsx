"use client";

import { useActionState } from "react";
import type { ArchiveActionState } from "./archive-actions";

export const INITIAL_ARCHIVE_STATE: ArchiveActionState = {
  status: "idle",
  message: "",
};

export const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20";

export function ActionMessage({ state }: { state: ArchiveActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`rounded-xl border px-4 py-3 text-sm ${
        state.status === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {state.message}
    </p>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-[#1b3272] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263f86] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Salvataggio..." : children}
    </button>
  );
}

export function useArchiveAction(
  action: (
    previousState: ArchiveActionState,
    formData: FormData,
  ) => Promise<ArchiveActionState>,
) {
  return useActionState(action, INITIAL_ARCHIVE_STATE);
}
