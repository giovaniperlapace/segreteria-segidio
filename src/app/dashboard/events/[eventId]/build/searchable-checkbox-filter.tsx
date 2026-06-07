"use client";

import { useDeferredValue, useState } from "react";

type CheckboxOption = {
  id: number;
  label: string;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it");
}

export function SearchableCheckboxFilter({
  name,
  options,
  selectedIds,
  searchLabel,
}: {
  name: string;
  options: CheckboxOption[];
  selectedIds: number[];
  searchLabel: string;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const selected = new Set(selectedIds);
  const term = normalizeSearch(deferredSearch.trim());
  const visibleOptions = options.filter(
    (option) => selected.has(option.id) || !term || normalizeSearch(option.label).includes(term),
  );

  return (
    <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="border-b border-slate-200 p-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
        />
      </div>
      <div className="max-h-44 overflow-y-auto p-2">
        {visibleOptions.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm font-normal text-slate-700 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              name={name}
              value={option.id}
              defaultChecked={selected.has(option.id)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#1b3272]"
            />
            <span>{option.label}</span>
          </label>
        ))}
        {visibleOptions.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm font-normal text-slate-500">
            Nessun referente trovato.
          </p>
        ) : null}
      </div>
    </div>
  );
}
