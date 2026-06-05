"use client";

import { Fragment, useActionState, useDeferredValue, useMemo, useState } from "react";
import {
  createUserAction,
  updateUserAction,
  type UserActionState,
} from "./actions";

const INITIAL_STATE: UserActionState = { status: "idle", message: "" };

type ManagedUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "manager" | "reference";
  active: boolean;
};

type SortKey = "first_name" | "last_name" | "email" | "role" | "active";
type SortDirection = "asc" | "desc";

function ActionMessage({ state }: { state: UserActionState }) {
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

function SubmitButton({
  pending,
  children,
  formId,
  iconOnly = false,
}: {
  pending: boolean;
  children: React.ReactNode;
  formId?: string;
  iconOnly?: boolean;
}) {
  if (iconOnly) {
    return (
      <button
        type="submit"
        form={formId}
        disabled={pending}
        aria-label={pending ? "Salvataggio in corso" : "Salva modifiche"}
        title={pending ? "Salvataggio in corso" : "Salva modifiche"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1b3272] text-white transition hover:bg-[#263f86] disabled:cursor-wait disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-5 w-5"
        >
          <path d="M5 3h12l2 2v16H5z" />
          <path d="M8 3v6h8V3M8 21v-7h8v7" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="submit"
      form={formId}
      disabled={pending}
      className="rounded-xl bg-[#1b3272] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263f86] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Salvataggio..." : children}
    </button>
  );
}

function CreateUserForm() {
  const [role, setRole] = useState<ManagedUser["role"]>("reference");
  const [state, action, pending] = useActionState(createUserAction, INITIAL_STATE);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="block text-sm font-medium text-slate-700">
          Nome
          <input
            required
            name="firstName"
            autoComplete="given-name"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Cognome
          <input
            required
            name="lastName"
            autoComplete="family-name"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            required
            name="email"
            type="email"
            autoComplete="email"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Ruolo
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as ManagedUser["role"])}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="reference">Referente</option>
            <option value="manager">Manager</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Crea utente autorizzato</SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function UserEditor({
  user,
  isCurrentUser,
}: {
  user: ManagedUser;
  isCurrentUser: boolean;
}) {
  const [role, setRole] = useState(user.role);
  const [state, action, pending] = useActionState(updateUserAction, INITIAL_STATE);
  const formId = `user-${user.id}`;

  return (
    <Fragment>
      <tr className="border-t border-slate-200 align-top">
        <td className="px-4 py-3">
          <form id={formId} action={action}>
            <input type="hidden" name="profileId" value={user.id} />
          </form>
          <input
            required
            form={formId}
            name="firstName"
            defaultValue={user.first_name}
            aria-label={`Nome di ${user.first_name} ${user.last_name}`}
            className="min-w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          />
          {isCurrentUser ? (
            <span className="ml-2 text-xs font-semibold text-[#d43c2f]">Tu</span>
          ) : null}
        </td>
        <td className="px-4 py-3">
          <input
            required
            form={formId}
            name="lastName"
            defaultValue={user.last_name}
            aria-label={`Cognome di ${user.first_name} ${user.last_name}`}
            className="min-w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          />
        </td>
        <td className="px-4 py-3 text-slate-600">{user.email}</td>
        <td className="px-4 py-3">
          <select
            form={formId}
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as ManagedUser["role"])}
            aria-label={`Ruolo di ${user.first_name} ${user.last_name}`}
            className="min-w-36 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          >
            <option value="reference">Referente</option>
            <option value="manager">Manager</option>
          </select>
        </td>
        <td className="px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              form={formId}
              name="active"
              type="checkbox"
              defaultChecked={user.active}
              className="h-4 w-4 accent-[#1b3272]"
            />
            <span className="sr-only">Utente attivo</span>
          </label>
        </td>
        <td className="px-4 py-3">
          <SubmitButton pending={pending} formId={formId} iconOnly>
            Salva
          </SubmitButton>
        </td>
      </tr>
      {state.status !== "idle" ? (
        <tr className="border-t border-slate-100">
          <td colSpan={6} className="px-4 py-2">
            <ActionMessage state={state} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function UserManagement({
  users,
  currentProfileId,
}: {
  users: ManagedUser[];
  currentProfileId: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("last_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredUsers = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    const direction = sortDirection === "asc" ? 1 : -1;

    return users
      .filter((user) => {
        const matchesSearch =
          !term ||
          user.first_name.toLowerCase().includes(term) ||
          user.last_name.toLowerCase().includes(term) ||
          `${user.first_name} ${user.last_name}`.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term) ||
          user.role.toLowerCase().includes(term);
        const matchesRole = roleFilter === "all" || user.role === roleFilter;
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" ? user.active : !user.active);

        return matchesSearch && matchesRole && matchesStatus;
      })
      .sort((a, b) => {
        const aValue =
          sortKey === "active"
            ? Number(a.active)
            : String(a[sortKey] ?? "").toLowerCase();
        const bValue =
          sortKey === "active"
            ? Number(b.active)
            : String(b[sortKey] ?? "").toLowerCase();

        if (aValue < bValue) return -1 * direction;
        if (aValue > bValue) return direction;
        return 0;
      });
  }, [deferredSearchTerm, roleFilter, sortDirection, sortKey, statusFilter, users]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function sortLabel(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#d9e1f2] bg-white px-5 py-4 shadow-sm">
        <h2 className="text-lg font-semibold text-[#1b3272]">Nuovo utente</h2>
        <div className="mt-3">
          <CreateUserForm />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-[#1b3272]">Utenti autorizzati</h2>
            <p className="mt-1 text-sm text-slate-600">
              {filteredUsers.length} di {users.length}{" "}
              {users.length === 1 ? "profilo" : "profili"}
            </p>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-3 lg:max-w-3xl">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cerca nome, email o ruolo"
              aria-label="Cerca utenti"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20 sm:col-span-1"
            />
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              aria-label="Filtra per ruolo"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
            >
              <option value="all">Tutti i ruoli</option>
              <option value="manager">Manager</option>
              <option value="reference">Referenti</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtra per stato"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
            >
              <option value="all">Tutti gli stati</option>
              <option value="active">Attivi</option>
              <option value="inactive">Disattivati</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("first_name")}>
                    Nome{sortLabel("first_name")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("last_name")}>
                    Cognome{sortLabel("last_name")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("email")}>
                    Email{sortLabel("email")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("role")}>
                    Ruolo{sortLabel("role")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("active")}>
                    Attivo{sortLabel("active")}
                  </button>
                </th>
                <th className="w-16 px-4 py-3">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nessun utente trovato con i filtri selezionati.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <UserEditor
                    key={user.id}
                    user={user}
                    isCurrentUser={user.id === currentProfileId}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
