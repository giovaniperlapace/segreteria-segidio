"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { candidateSortColumns, candidateSortKey, type CandidateSortKey } from "@/lib/exports/candidate-sort";

export function CandidateSortHeaders() {
  const query = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = candidateSortKey(query.get("sort") ?? "");
  const descending = query.get("direction") === "desc";

  function sort(key: CandidateSortKey) {
    const next = new URLSearchParams(query.toString());
    next.set("sort", key);
    next.set("direction", active === key && !descending ? "desc" : "asc");
    next.set("page", "1");
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return candidateSortColumns.map(({ key, label }) => (
    <th key={key} scope="col" className="px-3 py-3"
      aria-sort={active === key ? descending ? "descending" : "ascending" : "none"}>
      <button type="button" onClick={() => sort(key)} disabled={pending}
        aria-label={`Ordina per ${label} in ordine ${active === key && !descending ? "decrescente" : "crescente"}`}
        title={key === "contact" ? "Ordina per cognome e nome" : undefined}
        className="inline-flex items-center gap-1.5 rounded py-1 font-semibold hover:text-[#1b3272] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
        {label}
        <span aria-hidden="true" className={active === key ? "text-[#1b3272]" : "text-slate-400"}>
          {active === key ? descending ? "↓" : "↑" : "↕"}
        </span>
      </button>
    </th>
  ));
}
