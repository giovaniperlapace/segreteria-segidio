"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type CandidatePaginationProps = {
  page: number;
  totalPages: number;
  pageSize: string;
  total: number;
};

export function CandidatePagination({
  page, totalPages, pageSize, total, position,
}: CandidatePaginationProps & { position: "top" | "bottom" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const controlClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40";
  const first = total === 0 ? 0 : pageSize === "all" ? 1 : (page - 1) * Number(pageSize) + 1;
  const last = pageSize === "all" ? total : Math.min(page * Number(pageSize), total);

  function navigate(targetPage: number, size = pageSize) {
    const query = new URLSearchParams(searchParams.toString());
    query.set("page", String(targetPage));
    query.set("pageSize", size);
    startTransition(() => router.push(`${pathname}?${query.toString()}`, { scroll: false }));
  }

  return (
    <nav aria-label={position === "top" ? "Paginazione sopra la tabella" : "Paginazione sotto la tabella"}
      aria-busy={pending} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center gap-3">
        <span>{first}–{last} di {total} contatti</span>
        <label className="flex items-center gap-2">
          Contatti per pagina
          <select value={pageSize} disabled={pending} onChange={(event) => navigate(1, event.target.value)} className={controlClass}>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">Tutti</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || page <= 1} onClick={() => navigate(page - 1)} className={controlClass}>← Precedente</button>
        <label className="flex items-center gap-2">
          Pagina
          <select value={page} disabled={pending || totalPages === 1} onChange={(event) => navigate(Number(event.target.value))} className={controlClass}>
            {Array.from({ length: totalPages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
          </select>
          di {totalPages}
        </label>
        <button type="button" disabled={pending || page >= totalPages} onClick={() => navigate(page + 1)} className={controlClass}>Successiva →</button>
      </div>
    </nav>
  );
}
