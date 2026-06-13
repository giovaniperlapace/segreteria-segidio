"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import {
  createContactAction,
  deleteContactAction,
  exportContactPositionAction,
  loadContactHistoryAction,
  updateContactAction,
  type ContactHistoryItem,
} from "../archive-actions";
import {
  ActionMessage,
  inputClass,
  PendingSpinner,
  SubmitButton,
  useArchiveAction,
} from "../archive-ui";

export type ContactRecord = {
  id: number;
  legacy_access_old_archive_id: number | null;
  honorific_title: string | null;
  honorific_title_english: string | null;
  honorific_title_invitation: string | null;
  first_name: string;
  last_name: string;
  legacy_description: string | null;
  institutional_role: string | null;
  institutional_role_english: string | null;
  institutional_role_invitation: string | null;
  institution: string | null;
  legacy_salutation: string | null;
  email: string | null;
  email_2: string | null;
  phone: string | null;
  phone_home: string | null;
  phone_office_2: string | null;
  mobile_phone: string | null;
  fax: string | null;
  fax_home: string | null;
  telex_office: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  home_address_line: string | null;
  home_postal_code: string | null;
  home_city: string | null;
  home_province: string | null;
  home_country: string | null;
  office_name: string | null;
  office_address_line: string | null;
  office_postal_code: string | null;
  office_city: string | null;
  office_province: string | null;
  office_country: string | null;
  spoken_language: string | null;
  spoken_language_2: string | null;
  invitation_language: string | null;
  translation_language: string | null;
  religion: string | null;
  legacy_organization_id: number | null;
  legacy_organization_name: string | null;
  legacy_office_site: string | null;
  mail_address_preference: number | null;
  legacy_contacts_raw: string | null;
  accompanist: string | null;
  legacy_archive_type: string | null;
  legacy_created_at: string | null;
  legacy_updated_at: string | null;
  legacy_invitation_group: string | null;
  website: string | null;
  website_2: string | null;
  notes: string | null;
  missing_data_notes: string | null;
  status: "active" | "standby";
  priority: "standard" | "important" | "critical";
  created_at: string;
  updated_at: string;
  group_ids: number[];
  reference_ids: number[];
  missing_fields: string[];
  event_history: ContactEventHistoryItem[];
};

export type Option = { id: number; name: string; active: boolean };
export type LanguageOption = { id: number; name: string; active: boolean };
export type ContactEventHistoryItem = {
  event_id: number;
  title: string;
  starts_at: string;
  response_status: "no_response" | "attending" | "declined" | "maybe";
  attendance_status: "unknown" | "attended" | "absent";
};
type ContactViewMode = "cards" | "table";
type FilterMatchMode = "or" | "and";
type ContactCardSortKey = "default" | "createdAt" | "updatedAt";
type ContactTableColumnKey =
  | "name"
  | "institution"
  | "groups"
  | "references"
  | "country"
  | "createdAt"
  | "updatedAt"
  | "status"
  | "priority"
  | "missing";
type ContactTableSortKey = ContactTableColumnKey | "lastName";

const TABLE_COLUMN_KEYS: ContactTableColumnKey[] = [
  "name",
  "institution",
  "groups",
  "references",
  "country",
  "createdAt",
  "updatedAt",
  "status",
  "priority",
  "missing",
];

const DEFAULT_HIDDEN_TABLE_COLUMNS = new Set<ContactTableColumnKey>(["createdAt", "updatedAt"]);

function readHiddenTableColumns(storageKey: string) {
  if (typeof window === "undefined") return new Set(DEFAULT_HIDDEN_TABLE_COLUMNS);

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) return new Set(DEFAULT_HIDDEN_TABLE_COLUMNS);

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return new Set(DEFAULT_HIDDEN_TABLE_COLUMNS);

    const allowed = new Set(TABLE_COLUMN_KEYS);
    return new Set(parsed.filter((key): key is ContactTableColumnKey => allowed.has(key)));
  } catch {
    window.localStorage.removeItem(storageKey);
    return new Set(DEFAULT_HIDDEN_TABLE_COLUMNS);
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: "nome",
  email: "email",
  institutional_role: "carica",
  institution: "istituzione",
};

const CONTACT_STATUS_LABELS: Record<ContactRecord["status"], string> = {
  active: "Attivo",
  standby: "Non attivo",
};

const CONTACT_PRIORITY_LABELS: Record<ContactRecord["priority"], string> = {
  standard: "Standard",
  important: "Importante",
  critical: "Critica",
};

const RESPONSE_LABELS: Record<ContactEventHistoryItem["response_status"], string> = {
  no_response: "Nessuna risposta",
  attending: "Partecipa",
  declined: "Non partecipa",
  maybe: "Forse",
};

const ATTENDANCE_LABELS: Record<ContactEventHistoryItem["attendance_status"], string> = {
  unknown: "Presenza non verificata",
  attended: "Presente",
  absent: "Assente",
};

const POSITION_EXPORT_FIELDS = [
  { key: "honorific_title", label: "Titolo", group: "Identita' e carica" },
  { key: "honorific_title_english", label: "Titolo inglese", group: "Identita' e carica" },
  { key: "honorific_title_invitation", label: "Titolo invito", group: "Identita' e carica" },
  { key: "institutional_role", label: "Carica", group: "Identita' e carica" },
  { key: "institutional_role_english", label: "Carica inglese", group: "Identita' e carica" },
  { key: "institutional_role_invitation", label: "Carica invito", group: "Identita' e carica" },
  { key: "institution", label: "Istituzione", group: "Identita' e carica" },
  { key: "email", label: "Email", group: "Recapiti" },
  { key: "email_2", label: "Email 2", group: "Recapiti" },
  { key: "phone", label: "Telefono", group: "Recapiti" },
  { key: "phone_home", label: "Telefono casa", group: "Recapiti" },
  { key: "phone_office_2", label: "Telefono ufficio 2", group: "Recapiti" },
  { key: "mobile_phone", label: "Cellulare", group: "Recapiti" },
  { key: "fax", label: "Fax", group: "Recapiti" },
  { key: "fax_home", label: "Fax casa", group: "Recapiti" },
  { key: "telex_office", label: "Telex ufficio", group: "Recapiti" },
  { key: "website", label: "Sito web", group: "Recapiti" },
  { key: "website_2", label: "Sito web 2", group: "Recapiti" },
  { key: "address_line", label: "Indirizzo", group: "Sede" },
  { key: "postal_code", label: "CAP", group: "Sede" },
  { key: "city", label: "Citta'", group: "Sede" },
  { key: "country", label: "Paese", group: "Sede" },
  { key: "office_name", label: "Nome ufficio", group: "Sede" },
  { key: "office_address_line", label: "Indirizzo ufficio", group: "Sede" },
  { key: "office_postal_code", label: "CAP ufficio", group: "Sede" },
  { key: "office_city", label: "Citta' ufficio", group: "Sede" },
  { key: "office_province", label: "Provincia ufficio", group: "Sede" },
  { key: "office_country", label: "Paese ufficio", group: "Sede" },
  { key: "home_address_line", label: "Indirizzo casa", group: "Dati personali" },
  { key: "home_postal_code", label: "CAP casa", group: "Dati personali" },
  { key: "home_city", label: "Citta' casa", group: "Dati personali" },
  { key: "home_province", label: "Provincia casa", group: "Dati personali" },
  { key: "home_country", label: "Paese casa", group: "Dati personali" },
  { key: "spoken_language", label: "Lingua", group: "Altri dati" },
  { key: "spoken_language_2", label: "Lingua 2", group: "Altri dati" },
  { key: "invitation_language", label: "Lingua invito", group: "Altri dati" },
  { key: "translation_language", label: "Lingua traduzione", group: "Altri dati" },
  { key: "religion", label: "Religione", group: "Altri dati" },
  { key: "legacy_organization_name", label: "Organizzazione legacy", group: "Altri dati" },
  { key: "legacy_office_site", label: "Sede ufficio legacy", group: "Altri dati" },
  { key: "mail_address_preference", label: "Preferenza indirizzo postale", group: "Altri dati" },
  { key: "legacy_description", label: "Descrizione Access", group: "Altri dati" },
  { key: "legacy_salutation", label: "Intestazione", group: "Altri dati" },
  { key: "accompanist", label: "Accompagnatore", group: "Altri dati" },
  { key: "legacy_archive_type", label: "Tipo archivio legacy", group: "Altri dati" },
  { key: "legacy_invitation_group", label: "Gruppo inviti legacy", group: "Altri dati" },
  { key: "notes", label: "Note", group: "Altri dati" },
  { key: "missing_data_notes", label: "Note dati mancanti", group: "Altri dati" },
] as const satisfies ReadonlyArray<{
  key: keyof ContactRecord;
  label: string;
  group: string;
}>;

const COUNTRY_OPTIONS = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua e Barbuda",
  "Arabia Saudita",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaigian",
  "Bahamas",
  "Bahrein",
  "Bangladesh",
  "Barbados",
  "Belgio",
  "Belize",
  "Benin",
  "Bhutan",
  "Bielorussia",
  "Bolivia",
  "Bosnia ed Erzegovina",
  "Botswana",
  "Brasile",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cambogia",
  "Camerun",
  "Canada",
  "Capo Verde",
  "Ciad",
  "Cile",
  "Cina",
  "Cipro",
  "Colombia",
  "Comore",
  "Congo",
  "Corea del Nord",
  "Corea del Sud",
  "Costa Rica",
  "Costa d'Avorio",
  "Croazia",
  "Cuba",
  "Danimarca",
  "Dominica",
  "Ecuador",
  "Egitto",
  "El Salvador",
  "Emirati Arabi Uniti",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Etiopia",
  "Figi",
  "Filippine",
  "Finlandia",
  "Francia",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germania",
  "Ghana",
  "Giamaica",
  "Giappone",
  "Gibuti",
  "Giordania",
  "Grecia",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea Equatoriale",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Irlanda",
  "Islanda",
  "Isole Marshall",
  "Isole Salomone",
  "Israele",
  "Italia",
  "Kazakistan",
  "Kenya",
  "Kirghizistan",
  "Kiribati",
  "Kosovo",
  "Kuwait",
  "Laos",
  "Lesotho",
  "Lettonia",
  "Libano",
  "Liberia",
  "Libia",
  "Liechtenstein",
  "Lituania",
  "Lussemburgo",
  "Macedonia del Nord",
  "Madagascar",
  "Malawi",
  "Malesia",
  "Maldive",
  "Mali",
  "Malta",
  "Marocco",
  "Mauritania",
  "Mauritius",
  "Messico",
  "Micronesia",
  "Moldavia",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Mozambico",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "Norvegia",
  "Nuova Zelanda",
  "Oman",
  "Paesi Bassi",
  "Pakistan",
  "Palau",
  "Palestina",
  "Panama",
  "Papua Nuova Guinea",
  "Paraguay",
  "Peru",
  "Polonia",
  "Portogallo",
  "Qatar",
  "Regno Unito",
  "Repubblica Ceca",
  "Repubblica Centrafricana",
  "Repubblica Democratica del Congo",
  "Repubblica Dominicana",
  "Romania",
  "Ruanda",
  "Russia",
  "Saint Kitts e Nevis",
  "Saint Vincent e Grenadine",
  "Samoa",
  "San Marino",
  "Santa Lucia",
  "Sao Tome e Principe",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Siria",
  "Slovacchia",
  "Slovenia",
  "Somalia",
  "Spagna",
  "Sri Lanka",
  "Stati Uniti",
  "Sudafrica",
  "Sudan",
  "Sudan del Sud",
  "Suriname",
  "Svezia",
  "Svizzera",
  "Tagikistan",
  "Taiwan",
  "Tanzania",
  "Thailandia",
  "Timor Est",
  "Togo",
  "Tonga",
  "Trinidad e Tobago",
  "Tunisia",
  "Turchia",
  "Turkmenistan",
  "Tuvalu",
  "Ucraina",
  "Uganda",
  "Ungheria",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vaticano",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

function labelClass() {
  return "block text-sm font-medium text-slate-700";
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function contactDisplayName(contact: ContactRecord) {
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.institution ||
    "Contatto senza nome"
  );
}

function contactFirstNameSortValue(contact: ContactRecord) {
  return [
    contact.first_name,
    contact.last_name,
    contact.institution,
    contact.email,
  ]
    .filter(Boolean)
    .join(" ");
}

function contactLastNameSortValue(contact: ContactRecord) {
  return [
    contact.last_name,
    contact.first_name,
    contact.institution,
    contact.email,
  ]
    .filter(Boolean)
    .join(" ");
}

function optionNames(ids: number[], options: Option[]) {
  const selected = new Set(ids);
  return options.filter((option) => selected.has(option.id)).map((option) => option.name);
}

function contactMatchesDateRange(value: string, from: string, to: string) {
  const time = new Date(value).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    if (time >= end.getTime()) return false;
  }
  return true;
}

function FilterSummary({
  filteredTotalCount,
  visiblePageCount,
  chips,
}: {
  filteredTotalCount: number;
  visiblePageCount: number;
  chips: string[];
}) {
  return (
    <div className="w-full rounded-xl border border-[#d9e1f2] bg-[#f8fbff] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[#1b3272]">
          {filteredTotalCount} risultati totali con i filtri applicati
        </span>
        <span className="text-xs text-slate-500">
          {visiblePageCount} mostrati in questa pagina
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {chips.length > 0 ? (
          chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-[#1b3272]/20 bg-white px-3 py-1 text-xs font-semibold text-[#1b3272]"
            >
              {chip}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            Nessun filtro applicato
          </span>
        )}
      </div>
    </div>
  );
}

function compareValues(a: string | number, b: string | number, direction: "asc" | "desc") {
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "it", { sensitivity: "base" });

  return direction === "asc" ? result : -result;
}

function contactDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function CountryInput({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const query = normalizeSearch(value.trim());
  const matchingCountries = COUNTRY_OPTIONS.filter((country) => {
    if (!query) return true;
    return normalizeSearch(country).startsWith(query);
  });
  const suggestions = query ? matchingCountries.slice(0, 20) : matchingCountries;

  return (
    <div className="relative">
      <input
        name="country"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Scrivi o scegli un paese"
        autoComplete="off"
        className={inputClass}
      />
      {open && suggestions.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {suggestions.map((country) => (
            <button
              key={country}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(country);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-slate-800 hover:bg-[#f5f7fb]"
            >
              {country}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssociationPicker({
  name,
  options,
  selectedIds,
  emptyLabel,
  searchLabel,
}: {
  name: string;
  options: Option[];
  selectedIds: number[];
  emptyLabel: string;
  searchLabel: string;
}) {
  const [selected, setSelected] = useState(() => new Set(selectedIds));
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedSearch = normalizeSearch(search);
  const selectedOptions = options.filter((option) => selected.has(option.id));
  const visibleOptions = options
    .filter((option) => {
      if (selected.has(option.id)) return false;
      if (!normalizedSearch) return true;
      return normalizeSearch(option.name).includes(normalizedSearch);
    })
    .slice(0, normalizedSearch ? 40 : options.length);

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function addOption(id: number) {
    setSelected((current) => new Set(current).add(id));
    setSearch("");
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative mt-1.5 rounded-xl border border-slate-300 bg-white p-3">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {selectedOptions.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-xs font-semibold text-[#1b3272] hover:bg-[#1b3272]/20"
              title={`Rimuovi ${option.name}`}
            >
              {option.name}
              <span className="ml-1 text-[#d43c2f]">×</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-xs text-slate-500">{emptyLabel}</p>
      )}
      <input
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={searchLabel}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
      />
      {open ? (
        <div className="absolute left-3 right-3 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {visibleOptions.length > 0 ? (
            visibleOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => addOption(option.id)}
                className="block w-full px-3 py-2 text-left text-slate-800 hover:bg-[#f5f7fb]"
              >
                {option.name}
                {option.active ? "" : " (non attivo)"}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500">
              Nessuna opzione trovata.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MultiGroupFilter({
  groups,
  selectedIds,
  onChange,
}: {
  groups: Option[];
  selectedIds: number[];
  onChange: (nextIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = new Set(selectedIds);
  const normalizedSearch = normalizeSearch(search);
  const selectedGroups = groups.filter((group) => selected.has(group.id));
  const visibleGroups = groups.filter((group) => {
    if (selected.has(group.id)) return true;
    if (!normalizedSearch) return true;
    return normalizeSearch(group.name).includes(normalizedSearch);
  });

  function toggle(id: number) {
    if (selected.has(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${inputClass} flex min-h-11 items-center justify-between text-left`}
        aria-expanded={open}
      >
        <span className="truncate">
          {selectedGroups.length === 0
            ? "Tutti i gruppi"
            : selectedGroups.map((group) => group.name).join(", ")}
        </span>
        <span className="ml-2 text-xs text-slate-500">▾</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
          {selectedGroups.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedGroups.map((group) => (
                <span
                  key={group.id}
                  className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-xs font-semibold text-[#1b3272]"
                >
                  {group.name}
                </span>
              ))}
            </div>
          ) : null}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca gruppo"
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          />
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {visibleGroups.map((group) => (
              <label
                key={group.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                  selected.has(group.id)
                    ? "bg-[#1b3272]/10 font-semibold text-[#1b3272]"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(group.id)}
                  onChange={() => toggle(group.id)}
                  className="h-4 w-4 accent-[#1b3272]"
                />
                <span>{group.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            {selectedIds.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-semibold text-[#d43c2f] hover:underline"
              >
                Rimuovi filtro gruppi
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-[#1b3272] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#263f86]"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReferenceFilter({
  references,
  selectedIds,
  onChange,
}: {
  references: Option[];
  selectedIds: number[];
  onChange: (nextIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = new Set(selectedIds);
  const normalizedSearch = normalizeSearch(search);
  const selectedReferences = references.filter((reference) => selected.has(reference.id));
  const visibleReferences = references.filter((reference) => {
    if (selected.has(reference.id)) return true;
    if (!normalizedSearch) return true;
    return normalizeSearch(reference.name).includes(normalizedSearch);
  });

  function toggle(id: number) {
    if (selected.has(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${inputClass} flex min-h-11 items-center justify-between text-left`}
        aria-label="Filtra per referente"
        aria-expanded={open}
      >
        <span className="truncate">
          {selectedReferences.length === 0
            ? "Tutti i referenti"
            : selectedReferences.map((reference) => reference.name).join(", ")}
        </span>
        <span className="ml-2 text-xs text-slate-500">▾</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
          {selectedReferences.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedReferences.map((reference) => (
                <span
                  key={reference.id}
                  className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-xs font-semibold text-[#1b3272]"
                >
                  {reference.name}
                </span>
              ))}
            </div>
          ) : null}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca referente"
            autoComplete="off"
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          />
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {visibleReferences.length > 0 ? (
              visibleReferences.map((reference) => (
                <label
                  key={reference.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                    selected.has(reference.id)
                      ? "bg-[#1b3272]/10 font-semibold text-[#1b3272]"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(reference.id)}
                    onChange={() => toggle(reference.id)}
                    className="h-4 w-4 accent-[#1b3272]"
                  />
                  <span>
                    {reference.name}
                    {reference.active ? "" : " (non attivo)"}
                  </span>
                </label>
              ))
            ) : (
              <p className="px-2 py-3 text-sm text-slate-500">
                Nessun referente trovato.
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            {selectedIds.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-semibold text-[#d43c2f] hover:underline"
              >
                Rimuovi filtro referenti
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-[#1b3272] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#263f86]"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContactFields({
  contact,
  groups,
  references,
  languages,
  isManager,
}: {
  contact?: ContactRecord;
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
  isManager: boolean;
}) {
  const selectedLanguage = contact?.spoken_language ?? "";
  const languageOptions = selectedLanguage
    ? languages.some((language) => language.name === selectedLanguage)
      ? languages
      : [{ id: -1, name: selectedLanguage, active: true }, ...languages]
    : languages;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass()}>
          Titolo
          <input name="honorificTitle" defaultValue={contact?.honorific_title ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Nome
          <input name="firstName" defaultValue={contact?.first_name ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Cognome
          <input name="lastName" defaultValue={contact?.last_name ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Carica
          <input name="institutionalRole" defaultValue={contact?.institutional_role ?? ""} className={inputClass} />
        </label>
        <label className={`${labelClass()} sm:col-span-2`}>
          Istituzione
          <input name="institution" defaultValue={contact?.institution ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Email
          <input name="email" type="email" defaultValue={contact?.email ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Email 2
          <input name="email2" type="email" defaultValue={contact?.email_2 ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Sito web
          <input name="website" type="url" defaultValue={contact?.website ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Telefono
          <input name="phone" type="tel" defaultValue={contact?.phone ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Telefono casa
          <input name="phoneHome" type="tel" defaultValue={contact?.phone_home ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Cellulare
          <input name="mobilePhone" type="tel" defaultValue={contact?.mobile_phone ?? ""} className={inputClass} />
        </label>
        <label className={`${labelClass()} sm:col-span-2`}>
          Indirizzo
          <input name="addressLine" defaultValue={contact?.address_line ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          CAP
          <input name="postalCode" defaultValue={contact?.postal_code ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Citta&apos;
          <input name="city" defaultValue={contact?.city ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Paese
          <CountryInput defaultValue={contact?.country ?? ""} />
        </label>
        <label className={labelClass()}>
          Lingua
          <select name="spokenLanguage" defaultValue={selectedLanguage} className={inputClass}>
            <option value="">Non indicata</option>
            {languageOptions.map((language) => (
              <option key={language.id} value={language.name}>
                {language.name}
                {language.active ? "" : " (non attiva)"}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass()}>
          Stato
          <select name="status" defaultValue={contact?.status ?? "active"} className={inputClass}>
            <option value="active">Attivo</option>
            <option value="standby">Non attivo</option>
          </select>
        </label>
        <label className={labelClass()}>
          Priorita&apos;
          <select name="priority" defaultValue={contact?.priority ?? "standard"} className={inputClass}>
            <option value="standard">Standard</option>
            <option value="important">Importante</option>
            <option value="critical">Critica</option>
          </select>
        </label>
        {isManager ? (
          <>
            <label className={labelClass()}>
              Gruppi
              <AssociationPicker
                name="groupIds"
                options={groups}
                selectedIds={contact?.group_ids ?? []}
                emptyLabel="Nessun gruppo selezionato."
                searchLabel="Cerca gruppo"
              />
            </label>
            <label className={labelClass()}>
              Referenti
              <AssociationPicker
                name="referenceIds"
                options={references}
                selectedIds={contact?.reference_ids ?? []}
                emptyLabel="Nessun referente selezionato."
                searchLabel="Cerca referente"
              />
            </label>
          </>
        ) : null}
        <label className={`${labelClass()} sm:col-span-2`}>
          Note
          <textarea name="notes" rows={3} defaultValue={contact?.notes ?? ""} className={inputClass} />
        </label>
        <label className={`${labelClass()} sm:col-span-2`}>
          Note sui dati mancanti
          <textarea
            name="missingDataNotes"
            rows={3}
            defaultValue={contact?.missing_data_notes ?? ""}
            className={inputClass}
          />
        </label>
        <LegacyImportInfo contact={contact} />
      </div>
    </>
  );
}

function CreateContactForm({
  groups,
  references,
  languages,
  isManager,
}: {
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
  isManager: boolean;
}) {
  const [state, action, pending] = useArchiveAction(createContactAction);
  return (
    <form action={action} className="space-y-4">
      <ContactFields
        groups={groups}
        references={references}
        languages={languages}
        isManager={isManager}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Crea contatto</SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function normalizedEqual(a: string | null, b: string | null) {
  return normalizeSearch((a ?? "").trim()) === normalizeSearch((b ?? "").trim());
}

function legacyInfoRows(contact?: ContactRecord) {
  if (!contact) return [];

  const rows = [
    ["Descrizione Access", contact.legacy_description],
    ["Intestazione", contact.legacy_salutation],
    ["Carica invito", contact.institutional_role_invitation],
    ["Carica inglese", contact.institutional_role_english],
    [
      "Nome ufficio",
      normalizedEqual(contact.office_name, contact.institution) ? null : contact.office_name,
    ],
    [
      "Indirizzo ufficio",
      normalizedEqual(contact.office_address_line, contact.address_line) ? null : contact.office_address_line,
    ],
    [
      "Citta' ufficio",
      normalizedEqual(contact.office_city, contact.city) ? null : contact.office_city,
    ],
    [
      "Paese ufficio",
      normalizedEqual(contact.office_country, contact.country) ? null : contact.office_country,
    ],
    [
      "Indirizzo casa",
      normalizedEqual(contact.home_address_line, contact.address_line) ? null : contact.home_address_line,
    ],
    [
      "Citta' casa",
      normalizedEqual(contact.home_city, contact.city) ? null : contact.home_city,
    ],
    ["Lingua invito", contact.invitation_language],
    [
      "Lingua 2",
      normalizedEqual(contact.spoken_language_2, contact.spoken_language) ? null : contact.spoken_language_2,
    ],
    ["Fax ufficio", contact.fax],
    ["Fax casa", contact.fax_home],
    ["Accompagnatore", contact.accompanist],
    ["Gruppo inviti legacy", contact.legacy_invitation_group],
  ];

  return rows.filter((row): row is [string, string] => Boolean(row[1]?.trim()));
}

function LegacyImportInfo({ contact }: { contact?: ContactRecord }) {
  const rows = legacyInfoRows(contact);
  if (rows.length === 0) return null;

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#1b3272]">
        Info import Access
        <span className="ml-2 text-xs font-normal text-slate-500">
          {rows.length} {rows.length === 1 ? "campo conservato" : "campi conservati"}
        </span>
      </summary>
      <div className="mt-3 rounded-lg border border-slate-200 bg-white">
        <dl className="grid divide-y divide-slate-100 text-sm md:grid-cols-2 md:divide-x md:divide-y-0">
          {rows.map(([label, value]) => (
            <div key={label} className="px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Valori conservati dall&apos;archivio Access. Sono in sola lettura finche&apos; non decidiamo quali promuovere nella scheda principale.
      </p>
    </details>
  );
}

function historyActionLabel(action: string) {
  if (action === "insert") return "Creazione";
  if (action === "update") return "Modifica";
  if (action === "delete") return "Eliminazione";
  return action;
}

function historyDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function EventHistoryBox({ items = [] }: { items?: ContactEventHistoryItem[] }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold text-[#1b3272]">
        Storico eventi
        <span className="ml-2 text-xs font-normal text-slate-500">
          {items.length} {items.length === 1 ? "evento" : "eventi"} recenti
        </span>
      </summary>
      <div className="mt-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Nessun invito storico registrato.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 normal-case tracking-normal">Evento</th>
                  <th className="px-3 py-2 normal-case tracking-normal">Risposta</th>
                  <th className="px-3 py-2 normal-case tracking-normal">Presenza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={`${item.event_id}-${item.starts_at}`} className="align-top">
                    <td className="px-3 py-2">
                      <a href={`/dashboard/events/${item.event_id}`} className="font-semibold text-[#1b3272] hover:underline">
                        {item.title}
                      </a>
                      <div className="mt-1 text-xs text-slate-500">{historyDate(item.starts_at)}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{RESPONSE_LABELS[item.response_status]}</td>
                    <td className="px-3 py-2 text-slate-700">{ATTENDANCE_LABELS[item.attendance_status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

function ContactHistoryBox({ contactId }: { contactId: number }) {
  const [items, setItems] = useState<ContactHistoryItem[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadHistory() {
    if (loaded || loading) return;

    setLoading(true);
    setError("");
    const result = await loadContactHistoryAction(contactId);
    if (result.status === "success") {
      setItems(result.items);
      setLoaded(true);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }

  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) {
          void loadHistory();
        }
      }}
      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
    >
      <summary className="cursor-pointer text-sm font-semibold text-[#1b3272]">
        Storico modifiche
      </summary>
      <div className="mt-3 space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <PendingSpinner />
            Caricamento storico...
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {loaded && items?.length === 0 ? (
          <p className="text-sm text-slate-500">Nessuna modifica registrata.</p>
        ) : null}
        {items && items.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 normal-case tracking-normal">Data</th>
                  <th className="px-3 py-2 normal-case tracking-normal">Autore</th>
                  <th className="px-3 py-2 normal-case tracking-normal">Campi modificati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      <span className="font-semibold text-slate-900">{historyActionLabel(item.action)}</span>
                      <br />
                      {historyDate(item.occurredAt)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{item.actorName}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.changedFields.length > 0
                        ? item.changedFields.join(", ")
                        : "Solo metadati tecnici"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <a
          href={`/dashboard/audit?contactId=${contactId}`}
          className="inline-block text-sm font-semibold text-[#d43c2f] hover:underline"
        >
          Apri audit completo →
        </a>
      </div>
    </details>
  );
}

function exportFieldValue(value: ContactRecord[keyof ContactRecord]) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : "";
}

function ExportPositionPanel({
  contact,
  groups,
}: {
  contact: ContactRecord;
  groups: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"transfer" | "copy">("transfer");
  const [state, action, pending] = useArchiveAction(exportContactPositionAction);
  const availableFields = POSITION_EXPORT_FIELDS.flatMap((field) => {
    const value = exportFieldValue(contact[field.key]);
    return value ? [{ ...field, value }] : [];
  });
  const contactGroups = groups.filter((group) => contact.group_ids.includes(group.id));
  const fieldGroups = [...new Set(availableFields.map((field) => field.group))];

  useEffect(() => {
    if (state.status === "success" && state.contactId) {
      window.location.href = `/dashboard/contacts?contactId=${state.contactId}`;
    }
  }, [state.contactId, state.status]);

  return (
    <section className="rounded-xl border border-[#d9e1f2] bg-[#f8faff] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1b3272]">Cambio della persona in carica</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Crea una nuova scheda trasferendo o copiando i dati selezionati della carica.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-xl bg-[#1b3272] px-4 py-2 text-sm font-semibold text-white hover:bg-[#263f86]"
          aria-expanded={open}
        >
          Esporta carica
        </button>
      </div>
      {open ? (
        <form
          action={action}
          className="mt-4 space-y-4 border-t border-[#d9e1f2] pt-4"
          onSubmit={(event) => {
            const confirmMessage =
              exportMode === "copy"
                ? "Creare il nuovo contatto copiando i dati selezionati e lasciandoli anche su questa scheda?"
                : "Creare il nuovo contatto e cancellare i dati selezionati da questa scheda?";
            if (
              !window.confirm(confirmMessage)
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="contactId" value={contact.id} />
          <fieldset className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tipo operazione
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="exportMode"
                  value="transfer"
                  checked={exportMode === "transfer"}
                  onChange={() => setExportMode("transfer")}
                  className="mt-0.5 h-4 w-4 accent-[#1b3272]"
                />
                <span>
                  <span className="font-semibold text-slate-700">Trasferisci dati</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    Opzione predefinita: crea la nuova scheda e rimuove i dati selezionati da questa.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="exportMode"
                  value="copy"
                  checked={exportMode === "copy"}
                  onChange={() => setExportMode("copy")}
                  className="mt-0.5 h-4 w-4 accent-[#1b3272]"
                />
                <span>
                  <span className="font-semibold text-slate-700">Copia dati</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    Per cariche condivise: crea la nuova scheda senza modificare questa.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Nome, cognome, referenti e storico eventi resteranno su questa persona. Per creare la
            nuova scheda devi selezionare almeno la carica o l&apos;istituzione.
            {exportMode === "transfer"
              ? " Con il trasferimento i dati selezionati vengono rimossi dalla scheda attuale."
              : " Con la copia la scheda attuale resta invariata."}
          </p>
          {fieldGroups.map((group) => (
            <fieldset key={group}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableFields
                  .filter((field) => field.group === group)
                  .map((field) => (
                    <label
                      key={field.key}
                      className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="fields"
                        value={field.key}
                        className="mt-0.5 h-4 w-4 accent-[#1b3272]"
                      />
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-700">{field.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500" title={field.value}>
                          {field.value}
                        </span>
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
          ))}
          {contactGroups.length > 0 ? (
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Gruppi
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {contactGroups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      name="groupIds"
                      value={group.id}
                      className="h-4 w-4 accent-[#1b3272]"
                    />
                    {group.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pending={pending}>OK, crea nuovo contatto</SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white"
            >
              Annulla
            </button>
            <ActionMessage state={state} />
          </div>
        </form>
      ) : null}
    </section>
  );
}

function SummaryAssociations({ label, items }: { label: string; items: Option[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold text-slate-500">{label}:</span>
      {items.map((item) => (
        <span
          key={item.id}
          className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700"
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}

export function ContactEditor({
  contact,
  groups,
  references,
  languages,
  isManager,
  onContactUpdated,
}: {
  contact: ContactRecord;
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
  isManager: boolean;
  onContactUpdated?: (contact: ContactRecord) => void;
  open?: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useArchiveAction(updateContactAction);
  const [deleteState, deleteAction, deletePending] = useArchiveAction(deleteContactAction);
  const displayName = contactDisplayName(contact);

  useEffect(() => {
    if (state.status !== "success" || !state.contactId) return;

    const url = new URL(window.location.href);
    url.searchParams.set("contactId", String(state.contactId));
    window.history.replaceState(null, "", url);
    if (state.contact) {
      onContactUpdated?.(state.contact as ContactRecord);
    }
    router.refresh();
  }, [onContactUpdated, router, state.contact, state.contactId, state.status]);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="contactId" value={contact.id} />
        {contact.missing_fields.length > 0 ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Mancano: {contact.missing_fields.map((field) => FIELD_LABELS[field] ?? field).join(", ")}.
          </p>
        ) : null}
        <ContactFields
          key={`${contact.id}:${contact.updated_at}`}
          contact={contact}
          groups={groups}
          references={references}
          languages={languages}
          isManager={isManager}
        />
        <EventHistoryBox items={contact.event_history} />
        {isManager ? <ContactHistoryBox contactId={contact.id} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending}>Salva modifiche</SubmitButton>
          <ActionMessage state={state} />
        </div>
      </form>
      {isManager ? <ExportPositionPanel contact={contact} groups={groups} /> : null}
      {isManager ? (
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm(`Eliminare il contatto "${displayName}" dall'archivio operativo?`)) {
              event.preventDefault();
            }
          }}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2"
        >
          <input type="hidden" name="contactId" value={contact.id} />
          <label className="flex items-center gap-2 text-xs font-medium text-red-900">
            Conferma
            <input
              name="confirmation"
              placeholder="ELIMINA"
              aria-label="Scrivi ELIMINA per confermare"
              className="h-9 w-28 rounded-lg border border-red-200 bg-white px-2 text-sm text-slate-900 placeholder:text-red-300 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
            />
          </label>
          <button
            type="submit"
            disabled={deletePending}
            title={deletePending ? "Eliminazione in corso" : "Elimina contatto"}
            aria-label={deletePending ? "Eliminazione in corso" : "Elimina contatto"}
            aria-busy={deletePending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-700 text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
          >
            {deletePending ? (
              <PendingSpinner className="h-4 w-4" />
            ) : (
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 16H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            )}
          </button>
          <ActionMessage state={deleteState} />
        </form>
      ) : null}
    </div>
  );
}

function ContactCard({
  contact,
  groups,
  references,
  isManager,
  onOpenContact,
}: {
  contact: ContactRecord;
  groups: Option[];
  references: Option[];
  isManager: boolean;
  onOpenContact: (contact: ContactRecord) => void;
}) {
  const displayName = contactDisplayName(contact);
  const contactGroups = groups.filter((group) => contact.group_ids.includes(group.id));
  const contactReferences = references.filter((reference) => contact.reference_ids.includes(reference.id));

  return (
    <article className="flex min-h-[220px] flex-col justify-between rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-semibold text-[#1b3272]">{displayName}</h3>
        <p className="mt-1 text-sm text-slate-600">
          {[contact.institutional_role, contact.institution, contact.email].filter(Boolean).join(" · ") ||
            "Nessun dettaglio aggiuntivo"}
        </p>
        {contactGroups.length > 0 || contactReferences.length > 0 ? (
          <div className="mt-3 space-y-1 text-xs text-slate-600">
            {contactGroups.length > 0 ? (
              <SummaryAssociations label="Gruppi" items={contactGroups} />
            ) : null}
            {contactReferences.length > 0 ? (
              <SummaryAssociations label="Referenti" items={contactReferences} />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-full px-2.5 py-1 ${contact.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
            {CONTACT_STATUS_LABELS[contact.status]}
          </span>
          {contact.missing_fields.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
              {contact.missing_fields.length} dati mancanti
            </span>
          ) : null}
          <span className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-[#1b3272]">
            {contact.priority === "critical" ? "Critica" : contact.priority === "important" ? "Importante" : "Standard"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {isManager ? (
            <a
              href={`/dashboard/audit?contactId=${contact.id}`}
              className="rounded-xl border border-[#d9e1f2] bg-white px-3 py-2 text-[#1b3272] hover:border-[#d43c2f]"
            >
              Storico
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenContact(contact)}
            className="rounded-xl bg-[#1b3272] px-3 py-2 text-white transition hover:bg-[#263f86]"
          >
            Apri scheda
          </button>
        </div>
      </div>
    </article>
  );
}

function ContactsTable({
  contacts,
  groups,
  references,
  sortKey,
  sortDirection,
  hiddenColumnKeys,
  onSort,
  onHideColumn,
  onShowAllColumns,
  onOpenContact,
}: {
  contacts: ContactRecord[];
  groups: Option[];
  references: Option[];
  sortKey: ContactTableSortKey;
  sortDirection: "asc" | "desc";
  hiddenColumnKeys: Set<ContactTableColumnKey>;
  onSort: (key: ContactTableSortKey) => void;
  onHideColumn: (key: ContactTableColumnKey) => void;
  onShowAllColumns: () => void;
  onOpenContact: (contact: ContactRecord) => void;
}) {
  const visibleColumnCount = TABLE_COLUMN_KEYS.filter((key) => !hiddenColumnKeys.has(key)).length;

  function sortLabel(key: ContactTableSortKey) {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  function renderHeaderButton(keyName: ContactTableColumnKey, label: string, alignRight = false) {
    return (
      <div className={`flex items-center gap-2 ${alignRight ? "justify-end" : ""}`}>
        <button
          type="button"
          data-pending-feedback="off"
          onClick={() => onSort(keyName)}
          className="font-semibold text-[#1b3272] hover:text-[#d43c2f]"
        >
          {label}
          {sortLabel(keyName)}
        </button>
        <button
          type="button"
          data-pending-feedback="off"
          onClick={(event) => {
            event.stopPropagation();
            onHideColumn(keyName);
          }}
          title={`Nascondi ${label}`}
          aria-label={`Nascondi colonna ${label}`}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-500 hover:border-[#d43c2f] hover:text-[#d43c2f]"
        >
          ×
        </button>
      </div>
    );
  }

  function renderNameHeader() {
    const nameSortOptions: { key: ContactTableSortKey; label: string }[] = [
      { key: "name", label: "Nome" },
      { key: "lastName", label: "Cognome" },
    ];

    return (
      <div className="flex min-w-44 items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="font-semibold text-[#1b3272]">Nome</div>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 normal-case shadow-sm">
            {nameSortOptions.map((option) => {
              const active = sortKey === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  data-pending-feedback="off"
                  onClick={() => onSort(option.key)}
                  aria-pressed={active}
                  aria-label={`Ordina per ${option.label.toLowerCase()}`}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                    active
                      ? "border-[#1b3272] bg-[#eef4ff] text-[#1b3272]"
                      : "border-transparent text-[#1b3272] hover:bg-[#1b3272]/10"
                  }`}
                >
                  {option.label}
                  {active ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          data-pending-feedback="off"
          onClick={(event) => {
            event.stopPropagation();
            onHideColumn("name");
          }}
          title="Nascondi Nome"
          aria-label="Nascondi colonna Nome"
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-500 hover:border-[#d43c2f] hover:text-[#d43c2f]"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f8fafc] px-4 py-3">
        <p className="text-xs font-medium text-slate-600">
          {hiddenColumnKeys.size > 0
            ? `${hiddenColumnKeys.size} colonne nascoste`
            : "Tutte le colonne sono visibili"}
        </p>
        <button
          type="button"
          data-pending-feedback="off"
          onClick={onShowAllColumns}
          disabled={hiddenColumnKeys.size === 0}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#1b3272] hover:border-[#d43c2f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mostra tutte le colonne
        </button>
      </div>
      <div className="overflow-x-auto">
        {visibleColumnCount === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Tutte le colonne sono nascoste. Usa “Mostra tutte le colonne” per ripristinare la
            tabella.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {hiddenColumnKeys.has("name") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderNameHeader()}
                  </th>
                )}
                {hiddenColumnKeys.has("institution") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderHeaderButton("institution", "Istituzione")}
                  </th>
                )}
                {hiddenColumnKeys.has("groups") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderHeaderButton("groups", "Gruppi")}
                  </th>
                )}
                {hiddenColumnKeys.has("references") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderHeaderButton("references", "Referenti")}
                  </th>
                )}
                {hiddenColumnKeys.has("country") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderHeaderButton("country", "Paese")}
                  </th>
                )}
                {hiddenColumnKeys.has("createdAt") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderHeaderButton("createdAt", "Creazione")}
                  </th>
                )}
                {hiddenColumnKeys.has("updatedAt") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderHeaderButton("updatedAt", "Ultima modifica")}
                  </th>
                )}
                {hiddenColumnKeys.has("status") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderHeaderButton("status", "Stato")}
                  </th>
                )}
                {hiddenColumnKeys.has("priority") ? null : (
                  <th className="px-4 py-3 normal-case tracking-normal">
                    {renderHeaderButton("priority", "Priorita'")}
                  </th>
                )}
                {hiddenColumnKeys.has("missing") ? null : (
                  <th className="px-4 py-3 text-right normal-case tracking-normal">
                    {renderHeaderButton("missing", "Dati", true)}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {contacts.map((contact) => {
                const groupsText = optionNames(contact.group_ids, groups).join(", ");
                const referencesText = optionNames(contact.reference_ids, references).join(", ");

                return (
                  <tr
                    key={contact.id}
                    className="cursor-pointer align-top hover:bg-[#f8fafc]"
                    onClick={() => onOpenContact(contact)}
                  >
                    {hiddenColumnKeys.has("name") ? null : (
                      <td className="px-4 py-3 font-semibold text-[#1b3272]">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenContact(contact);
                          }}
                          className="text-left hover:underline"
                        >
                          {contactDisplayName(contact)}
                        </button>
                        {contact.email ? (
                          <div className="mt-1 text-xs font-normal text-slate-500">{contact.email}</div>
                        ) : null}
                      </td>
                    )}
                    {hiddenColumnKeys.has("institution") ? null : (
                      <td className="px-4 py-3 text-slate-700">
                        <div>{contact.institution || "—"}</div>
                        {contact.institutional_role ? (
                          <div className="mt-1 text-xs text-slate-500">{contact.institutional_role}</div>
                        ) : null}
                      </td>
                    )}
                    {hiddenColumnKeys.has("groups") ? null : (
                      <td className="px-4 py-3 text-slate-700">{groupsText || "—"}</td>
                    )}
                    {hiddenColumnKeys.has("references") ? null : (
                      <td className="px-4 py-3 text-slate-700">{referencesText || "—"}</td>
                    )}
                    {hiddenColumnKeys.has("country") ? null : (
                      <td className="px-4 py-3 text-slate-700">{contact.country || "—"}</td>
                    )}
                    {hiddenColumnKeys.has("createdAt") ? null : (
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {contactDate(contact.created_at)}
                      </td>
                    )}
                    {hiddenColumnKeys.has("updatedAt") ? null : (
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {contactDate(contact.updated_at)}
                      </td>
                    )}
                    {hiddenColumnKeys.has("status") ? null : (
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${contact.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                          {CONTACT_STATUS_LABELS[contact.status]}
                        </span>
                      </td>
                    )}
                    {hiddenColumnKeys.has("priority") ? null : (
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-xs font-semibold text-[#1b3272]">
                          {contact.priority === "critical" ? "Critica" : contact.priority === "important" ? "Importante" : "Standard"}
                        </span>
                      </td>
                    )}
                    {hiddenColumnKeys.has("missing") ? null : (
                      <td className="px-4 py-3 text-right text-slate-700">
                        {contact.missing_fields.length > 0 ? `${contact.missing_fields.length} mancanti` : "Completi"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function ContactManagement({
  contacts,
  initialSelectedContact,
  groups,
  references,
  filterReferences,
  languages,
  isManager,
  viewPreferenceKey,
  totalContacts,
  page,
  pageSize,
  initialFilters,
}: {
  contacts: ContactRecord[];
  initialSelectedContact: ContactRecord | null;
  groups: Option[];
  references: Option[];
  filterReferences: Option[];
  languages: LanguageOption[];
  isManager: boolean;
  viewPreferenceKey: string;
  totalContacts: number;
  page: number;
  pageSize: number;
  initialFilters: {
    search: string;
    status: string;
    priority: string;
    groupIds: number[];
    referenceIds: number[];
    missing: string;
    matchMode: FilterMatchMode;
    createdFrom: string;
    createdTo: string;
    updatedFrom: string;
    updatedTo: string;
  };
}) {
  const [search, setSearch] = useState(initialFilters.search);
  const [status, setStatus] = useState(initialFilters.status || "all");
  const [priority, setPriority] = useState(initialFilters.priority || "all");
  const [groupIds, setGroupIds] = useState<number[]>(initialFilters.groupIds);
  const [referenceIds, setReferenceIds] = useState<number[]>(initialFilters.referenceIds);
  const [missing, setMissing] = useState(initialFilters.missing || "all");
  const [matchMode, setMatchMode] = useState<FilterMatchMode>(initialFilters.matchMode || "and");
  const [createdFrom, setCreatedFrom] = useState(initialFilters.createdFrom);
  const [createdTo, setCreatedTo] = useState(initialFilters.createdTo);
  const [updatedFrom, setUpdatedFrom] = useState(initialFilters.updatedFrom);
  const [updatedTo, setUpdatedTo] = useState(initialFilters.updatedTo);
  const [tableSortKey, setTableSortKey] = useState<ContactTableSortKey>("lastName");
  const [tableSortDirection, setTableSortDirection] = useState<"asc" | "desc">("asc");
  const [cardSortKey, setCardSortKey] = useState<ContactCardSortKey>("default");
  const tableColumnsPreferenceKey = `${viewPreferenceKey}:table-columns:hidden`;
  const [hiddenTableColumns, setHiddenTableColumns] = useState<Set<ContactTableColumnKey>>(
    () => readHiddenTableColumns(tableColumnsPreferenceKey),
  );
  const [selectedContactId, setSelectedContactId] = useState<number | null>(
    initialSelectedContact?.id ?? null,
  );
  const deferredSearch = useDeferredValue(search);
  const viewMode = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("contacts-view-change", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("contacts-view-change", onStoreChange);
      };
    },
    () => {
      const savedView = window.localStorage.getItem(viewPreferenceKey);
      return savedView === "table" ? "table" : "cards";
    },
    () => "cards",
  );

  function changeViewMode(nextViewMode: ContactViewMode) {
    window.localStorage.setItem(viewPreferenceKey, nextViewMode);
    window.dispatchEvent(new Event("contacts-view-change"));
  }

  function storeHiddenTableColumns(nextHiddenColumns: Set<ContactTableColumnKey>) {
    window.localStorage.setItem(tableColumnsPreferenceKey, JSON.stringify([...nextHiddenColumns]));
  }

  function hideTableColumn(columnKey: ContactTableColumnKey) {
    setHiddenTableColumns((current) => {
      const next = new Set(current).add(columnKey);
      storeHiddenTableColumns(next);
      return next;
    });

    if (tableSortKey === columnKey || (columnKey === "name" && tableSortKey === "lastName")) {
      setTableSortKey(columnKey === "name" ? "institution" : "lastName");
      setTableSortDirection("asc");
    }
  }

  function showAllTableColumns() {
    const next = new Set<ContactTableColumnKey>();
    setHiddenTableColumns(next);
    storeHiddenTableColumns(next);
  }

  function toggleTableSort(nextKey: ContactTableSortKey) {
    if (nextKey === tableSortKey) {
      setTableSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setTableSortKey(nextKey);
    setTableSortDirection("asc");
  }

  function contactsUrl(nextPage: number) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (status !== "active") params.set("status", status);
    if (priority !== "all") params.set("priority", priority);
    if (groupIds.length > 0) params.set("groups", groupIds.join(","));
    if (referenceIds.length > 0) params.set("references", referenceIds.join(","));
    if (missing !== "all") params.set("missing", missing);
    if (matchMode === "or") params.set("match", "or");
    if (createdFrom) params.set("createdFrom", createdFrom);
    if (createdTo) params.set("createdTo", createdTo);
    if (updatedFrom) params.set("updatedFrom", updatedFrom);
    if (updatedTo) params.set("updatedTo", updatedTo);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return `/dashboard/contacts${query ? `?${query}` : ""}`;
  }

  function applyFilters() {
    window.location.href = contactsUrl(1);
  }

  function openContact(contact: ContactRecord) {
    const url = new URL(window.location.href);
    url.searchParams.set("contactId", String(contact.id));
    window.history.replaceState(null, "", url);
    setSelectedContactId(contact.id);
  }

  function closeContact() {
    const url = new URL(window.location.href);
    url.searchParams.delete("contactId");
    window.history.replaceState(null, "", url);
    setSelectedContactId(null);
  }

  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null;
    if (initialSelectedContact?.id === selectedContactId) return initialSelectedContact;
    return contacts.find((contact) => contact.id === selectedContactId) ?? null;
  }, [contacts, initialSelectedContact, selectedContactId]);

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return contacts.filter((contact) => {
      const haystack = [
        contact.first_name,
        contact.last_name,
        contact.institution,
        contact.institutional_role,
        contact.email,
        contact.email_2,
        contact.city,
        contact.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const baseStatusMatches = status === "active" ? contact.status === "active" : true;
      const criteria = [
        term ? haystack.includes(term) : null,
        status === "standby" ? contact.status === "standby" : null,
        priority !== "all" ? contact.priority === priority : null,
        groupIds.length > 0 ? groupIds.some((groupId) => contact.group_ids.includes(groupId)) : null,
        referenceIds.length > 0
          ? referenceIds.some((referenceId) => contact.reference_ids.includes(referenceId))
          : null,
        missing !== "all"
          ? missing === "yes"
            ? contact.missing_fields.length > 0
            : contact.missing_fields.length === 0
          : null,
        createdFrom || createdTo ? contactMatchesDateRange(contact.created_at, createdFrom, createdTo) : null,
        updatedFrom || updatedTo ? contactMatchesDateRange(contact.updated_at, updatedFrom, updatedTo) : null,
      ].filter((criterion): criterion is boolean => criterion !== null);

      if (criteria.length === 0) return baseStatusMatches;
      if (matchMode === "and") return baseStatusMatches && criteria.every(Boolean);
      return baseStatusMatches && criteria.some(Boolean);
    });
  }, [
    contacts,
    createdFrom,
    createdTo,
    deferredSearch,
    groupIds,
    matchMode,
    missing,
    priority,
    referenceIds,
    status,
    updatedFrom,
    updatedTo,
  ]);

  const tableContacts = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aGroups = optionNames(a.group_ids, groups).join(", ");
      const bGroups = optionNames(b.group_ids, groups).join(", ");
      const aReferences = optionNames(a.reference_ids, references).join(", ");
      const bReferences = optionNames(b.reference_ids, references).join(", ");
      const sortValues: Record<ContactTableSortKey, [string | number, string | number]> = {
        name: [contactFirstNameSortValue(a), contactFirstNameSortValue(b)],
        lastName: [contactLastNameSortValue(a), contactLastNameSortValue(b)],
        institution: [a.institution ?? "", b.institution ?? ""],
        groups: [aGroups, bGroups],
        references: [aReferences, bReferences],
        country: [a.country ?? "", b.country ?? ""],
        createdAt: [new Date(a.created_at).getTime(), new Date(b.created_at).getTime()],
        updatedAt: [new Date(a.updated_at).getTime(), new Date(b.updated_at).getTime()],
        status: [a.status, b.status],
        priority: [a.priority, b.priority],
        missing: [a.missing_fields.length, b.missing_fields.length],
      };

      const [aValue, bValue] = sortValues[tableSortKey];
      return compareValues(aValue, bValue, tableSortDirection);
    });
  }, [filtered, groups, references, tableSortDirection, tableSortKey]);
  const cardContacts = useMemo(() => {
    if (cardSortKey === "default") return filtered;

    return [...filtered].sort((a, b) => {
      const aTime = new Date(cardSortKey === "createdAt" ? a.created_at : a.updated_at).getTime();
      const bTime = new Date(cardSortKey === "createdAt" ? b.created_at : b.updated_at).getTime();
      return bTime - aTime;
    });
  }, [cardSortKey, filtered]);
  const visibleContacts = viewMode === "table" ? tableContacts : cardContacts;
  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch) chips.push(`Ricerca: "${trimmedSearch}"`);
    if (status !== "active") chips.push(`Stato: ${status === "all" ? "Tutti gli stati" : CONTACT_STATUS_LABELS[status as ContactRecord["status"]] ?? status}`);
    if (priority !== "all") chips.push(`Priorità: ${CONTACT_PRIORITY_LABELS[priority as ContactRecord["priority"]] ?? priority}`);
    if (groupIds.length > 0) chips.push(`Gruppi: ${optionNames(groupIds, groups).join(", ") || groupIds.join(", ")}`);
    if (referenceIds.length > 0) {
      chips.push(`Referenti: ${optionNames(referenceIds, references).join(", ") || referenceIds.join(", ")}`);
    }
    if (missing !== "all") chips.push(`Dati: ${missing === "yes" ? "con dati mancanti" : "completi"}`);
    if (createdFrom) chips.push(`Creato dal: ${createdFrom}`);
    if (createdTo) chips.push(`Creato al: ${createdTo}`);
    if (updatedFrom) chips.push(`Modificato dal: ${updatedFrom}`);
    if (updatedTo) chips.push(`Modificato al: ${updatedTo}`);
    if (chips.length > 1) chips.unshift(`Logica tra campi: ${matchMode === "or" ? "OR" : "AND"}`);
    return chips;
  }, [
    createdFrom,
    createdTo,
    groupIds,
    groups,
    matchMode,
    missing,
    priority,
    referenceIds,
    references,
    search,
    status,
    updatedFrom,
    updatedTo,
  ]);

  return (
    <div className="space-y-8">
      {isManager ? (
        <details className="rounded-2xl border border-[#d9e1f2] bg-white px-5 py-4 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold text-[#1b3272]">Nuovo contatto</summary>
          <div className="mt-5 border-t border-slate-200 pt-5">
            <CreateContactForm
              groups={groups}
              references={references}
              languages={languages}
              isManager={isManager}
            />
          </div>
        </details>
      ) : null}

      <section className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#1b3272]">Archivio contatti</h2>
            <p className="mt-1 text-sm text-slate-600">
              {contacts.length} mostrati di {totalContacts} contatti
            </p>
          </div>
          <div className="flex rounded-xl border border-slate-300 bg-white p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => changeViewMode("cards")}
              className={`rounded-lg px-3 py-2 ${
                viewMode === "cards"
                  ? "bg-[#1b3272] text-white"
                  : "text-[#1b3272] hover:bg-[#1b3272]/10"
              }`}
              aria-pressed={viewMode === "cards"}
            >
              Schede
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("table")}
              className={`rounded-lg px-3 py-2 ${
                viewMode === "table"
                  ? "bg-[#1b3272] text-white"
                  : "text-[#1b3272] hover:bg-[#1b3272]/10"
              }`}
              aria-pressed={viewMode === "table"}
            >
              Tabella
            </button>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca contatti" aria-label="Cerca contatti" className={inputClass} />
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtra per stato" className={inputClass}>
              <option value="active">Attivi</option><option value="standby">Non attivi</option><option value="all">Tutti gli stati</option>
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filtra per priorita" className={inputClass}>
              <option value="all">Tutte le priorita&apos;</option><option value="standard">Standard</option><option value="important">Importante</option><option value="critical">Critica</option>
            </select>
            <MultiGroupFilter
              groups={groups}
              selectedIds={groupIds}
              onChange={setGroupIds}
            />
            <ReferenceFilter
              references={filterReferences}
              selectedIds={referenceIds}
              onChange={setReferenceIds}
            />
            <select value={missing} onChange={(event) => setMissing(event.target.value)} aria-label="Filtra per dati mancanti" className={inputClass}>
              <option value="all">Tutti i dati</option><option value="yes">Con dati mancanti</option><option value="no">Dati completi</option>
            </select>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Logica tra campi
            </span>
            <button
              type="button"
              onClick={() => setMatchMode("and")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                matchMode === "and"
                  ? "bg-[#1b3272] text-white"
                  : "border border-slate-300 bg-white text-[#1b3272] hover:border-[#d43c2f]"
              }`}
              aria-pressed={matchMode === "and"}
            >
              AND
            </button>
            <button
              type="button"
              onClick={() => setMatchMode("or")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                matchMode === "or"
                  ? "bg-[#1b3272] text-white"
                  : "border border-slate-300 bg-white text-[#1b3272] hover:border-[#d43c2f]"
              }`}
              aria-pressed={matchMode === "or"}
            >
              OR
            </button>
            <span className="text-xs text-slate-500">
              Più valori nello stesso campo restano sempre in OR.
            </span>
          </div>
          {viewMode === "table" ? (
            <div className="grid w-full gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">
                Creato dal
                <input
                  type="date"
                  value={createdFrom}
                  onChange={(event) => setCreatedFrom(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Creato al
                <input
                  type="date"
                  value={createdTo}
                  onChange={(event) => setCreatedTo(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Modificato dal
                <input
                  type="date"
                  value={updatedFrom}
                  onChange={(event) => setUpdatedFrom(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Modificato al
                <input
                  type="date"
                  value={updatedTo}
                  onChange={(event) => setUpdatedTo(event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          ) : null}
          <div className="flex w-full flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyFilters}
              data-pending-feedback="long"
              className="rounded-xl bg-[#1b3272] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263f86]"
            >
              Applica filtri
            </button>
            <a
              href="/dashboard/contacts"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Azzera filtri
            </a>
          </div>
          <FilterSummary
            filteredTotalCount={totalContacts}
            visiblePageCount={filtered.length}
            chips={activeFilterChips}
          />
          {viewMode === "cards" ? (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ordina schede
              </span>
              <button
                type="button"
                onClick={() => setCardSortKey("updatedAt")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  cardSortKey === "updatedAt"
                    ? "bg-[#1b3272] text-white"
                    : "border border-slate-300 bg-white text-[#1b3272] hover:border-[#d43c2f]"
                }`}
                aria-pressed={cardSortKey === "updatedAt"}
              >
                Modifica più recente
              </button>
              <button
                type="button"
                onClick={() => setCardSortKey("createdAt")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  cardSortKey === "createdAt"
                    ? "bg-[#1b3272] text-white"
                    : "border border-slate-300 bg-white text-[#1b3272] hover:border-[#d43c2f]"
                }`}
                aria-pressed={cardSortKey === "createdAt"}
              >
                Creazione più recente
              </button>
              {cardSortKey !== "default" ? (
                <button
                  type="button"
                  onClick={() => setCardSortKey("default")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  Ordine predefinito
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-slate-500">Nessun contatto trovato con i filtri selezionati.</p>
        ) : viewMode === "table" ? (
          <ContactsTable
            contacts={visibleContacts}
            groups={groups}
            references={references}
            sortKey={tableSortKey}
            sortDirection={tableSortDirection}
            hiddenColumnKeys={hiddenTableColumns}
            onSort={toggleTableSort}
            onHideColumn={hideTableColumn}
            onShowAllColumns={showAllTableColumns}
            onOpenContact={openContact}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleContacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                groups={groups}
                references={references}
                isManager={isManager}
                onOpenContact={openContact}
              />
            ))}
          </div>
        )}
        {totalContacts > pageSize ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {page > 1 ? (
              <a
                href={contactsUrl(page - 1)}
                className="rounded-xl border border-[#d9e1f2] bg-white px-4 py-2.5 text-sm font-semibold text-[#1b3272] shadow-sm hover:border-[#d43c2f]"
              >
                Pagina precedente
              </a>
            ) : null}
            <span className="text-sm text-slate-600">
              Pagina {page} di {Math.max(1, Math.ceil(totalContacts / pageSize))}
            </span>
            {page * pageSize < totalContacts ? (
              <a
                href={contactsUrl(page + 1)}
                className="rounded-xl border border-[#d9e1f2] bg-white px-4 py-2.5 text-sm font-semibold text-[#1b3272] shadow-sm hover:border-[#d43c2f]"
              >
                Pagina successiva
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
      {selectedContact ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Scheda contatto"
          onClick={closeContact}
        >
          <div
            className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold text-[#1b3272]">
                  {contactDisplayName(selectedContact)}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {[selectedContact.institutional_role, selectedContact.institution, selectedContact.email]
                    .filter(Boolean)
                    .join(" · ") || "Scheda contatto"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeContact}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Chiudi
              </button>
            </div>
            <div className="px-5 py-5">
              <ContactEditor
                key={selectedContact.id}
                contact={selectedContact}
                groups={groups}
                references={references}
                languages={languages}
                isManager={isManager}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
