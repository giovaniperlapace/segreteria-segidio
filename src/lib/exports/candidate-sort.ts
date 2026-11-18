import type { CandidateExportContact } from "./candidates";

export const candidateSortColumns = [
  { key: "contact", label: "Contatto" },
  { key: "country", label: "Paese" },
  { key: "groups", label: "Gruppi" },
  { key: "references", label: "Referenti" },
  { key: "missing", label: "Stato dati" },
  { key: "proposals", label: "Proposte" },
] as const;

export type CandidateSortKey = typeof candidateSortColumns[number]["key"];

export function candidateSortKey(value: string): CandidateSortKey | null {
  return candidateSortColumns.find((column) => column.key === value)?.key ?? null;
}

export function sortCandidates<T extends CandidateExportContact>(rows: T[], key: CandidateSortKey, descending: boolean) {
  const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });
  function value(row: T): string {
    switch (key) {
      case "contact": return [row.lastName, row.firstName].filter(Boolean).join(" ") || row.name;
      case "country": return row.country ?? "";
      case "groups": return row.groups.join(", ");
      case "references": return row.references.join(", ");
      case "missing": return row.missingFields.length ? `Mancano: ${row.missingFields.join(", ")}` : "Completi";
      case "proposals": return row.proposalSummary ?? "";
    }
  }
  return [...rows].sort((a, b) => {
    const left = value(a), right = value(b);
    // Keep missing values at the end in either direction.
    if (!left && right) return 1;
    if (left && !right) return -1;
    return collator.compare(left, right) * (descending ? -1 : 1) || a.id - b.id;
  });
}
