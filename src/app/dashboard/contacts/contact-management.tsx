"use client";

import { useEffect, useRef, useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { createContactAction, deleteContactAction, updateContactAction } from "../archive-actions";
import {
  ActionMessage,
  inputClass,
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
  group_ids: number[];
  reference_ids: number[];
  missing_fields: string[];
};

export type Option = { id: number; name: string; active: boolean };
export type LanguageOption = { id: number; name: string; active: boolean };
type ContactViewMode = "cards" | "table";
type ContactTableSortKey =
  | "name"
  | "role"
  | "institution"
  | "groups"
  | "references"
  | "country"
  | "language"
  | "status"
  | "priority"
  | "missing";
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

function optionNames(ids: number[], options: Option[]) {
  const selected = new Set(ids);
  return options.filter((option) => selected.has(option.id)).map((option) => option.name);
}

function compareValues(a: string | number, b: string | number, direction: "asc" | "desc") {
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "it", { sensitivity: "base" });

  return direction === "asc" ? result : -result;
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
      <p className="text-xs text-slate-500">
        Inserisci almeno nome, cognome o istituzione. Gruppi e referenti selezionati sono evidenziati sopra le opzioni.
      </p>
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
  open,
}: {
  contact: ContactRecord;
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
  isManager: boolean;
  open?: boolean;
}) {
  const [state, action, pending] = useArchiveAction(updateContactAction);
  const [deleteState, deleteAction, deletePending] = useArchiveAction(deleteContactAction);
  const displayName = contactDisplayName(contact);
  const contactGroups = groups.filter((group) => contact.group_ids.includes(group.id));
  const contactReferences = references.filter((reference) => contact.reference_ids.includes(reference.id));

  return (
    <details open={open} className="group rounded-2xl border border-[#d9e1f2] bg-white shadow-sm open:md:col-span-2 open:xl:col-span-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="font-semibold text-[#1b3272]">{displayName}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {[contact.institutional_role, contact.institution, contact.email].filter(Boolean).join(" · ") || "Nessun dettaglio aggiuntivo"}
          </p>
          {contactGroups.length > 0 || contactReferences.length > 0 ? (
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              {contactGroups.length > 0 ? (
                <SummaryAssociations label="Gruppi" items={contactGroups} />
              ) : null}
              {contactReferences.length > 0 ? (
                <SummaryAssociations label="Referenti" items={contactReferences} />
              ) : null}
            </div>
          ) : null}
        </div>
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
      </summary>
      <div className="space-y-4 border-t border-slate-200 px-5 py-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="contactId" value={contact.id} />
        {contact.missing_fields.length > 0 ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Mancano: {contact.missing_fields.map((field) => FIELD_LABELS[field] ?? field).join(", ")}.
          </p>
        ) : null}
        <ContactFields
          contact={contact}
          groups={groups}
          references={references}
          languages={languages}
          isManager={isManager}
        />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending}>Salva modifiche</SubmitButton>
          <ActionMessage state={state} />
        </div>
      </form>
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-700 text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
          >
            {deletePending ? (
              <span className="text-xs font-semibold">...</span>
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
    </details>
  );
}

function ContactsTable({
  contacts,
  groups,
  references,
  sortKey,
  sortDirection,
  onSort,
  onOpenContact,
}: {
  contacts: ContactRecord[];
  groups: Option[];
  references: Option[];
  sortKey: ContactTableSortKey;
  sortDirection: "asc" | "desc";
  onSort: (key: ContactTableSortKey) => void;
  onOpenContact: (contact: ContactRecord) => void;
}) {
  function sortLabel(key: ContactTableSortKey) {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  function renderHeaderButton(keyName: ContactTableSortKey, label: string) {
    return (
      <button
        type="button"
        onClick={() => onSort(keyName)}
        className="font-semibold text-[#1b3272] hover:text-[#d43c2f]"
      >
        {label}
        {sortLabel(keyName)}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("name", "Nome")}
              </th>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("role", "Carica")}
              </th>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("institution", "Istituzione")}
              </th>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("groups", "Gruppi")}
              </th>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("references", "Referenti")}
              </th>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("country", "Paese")}
              </th>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("language", "Lingua")}
              </th>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("status", "Stato")}
              </th>
              <th className="px-4 py-3 normal-case tracking-normal">
                {renderHeaderButton("priority", "Priorita'")}
              </th>
              <th className="px-4 py-3 text-right normal-case tracking-normal">
                {renderHeaderButton("missing", "Dati")}
              </th>
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
                  <td className="px-4 py-3 text-slate-700">{contact.institutional_role || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{contact.institution || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{groupsText || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{referencesText || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{contact.country || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{contact.spoken_language || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${contact.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                      {CONTACT_STATUS_LABELS[contact.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-xs font-semibold text-[#1b3272]">
                      {contact.priority === "critical" ? "Critica" : contact.priority === "important" ? "Importante" : "Standard"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {contact.missing_fields.length > 0 ? `${contact.missing_fields.length} mancanti` : "Completi"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ContactManagement({
  contacts,
  groups,
  references,
  languages,
  isManager,
  viewPreferenceKey,
  totalContacts,
  page,
  pageSize,
  initialFilters,
}: {
  contacts: ContactRecord[];
  groups: Option[];
  references: Option[];
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
    referenceId: string;
    missing: string;
  };
}) {
  const [search, setSearch] = useState(initialFilters.search);
  const [status, setStatus] = useState(initialFilters.status || "all");
  const [priority, setPriority] = useState(initialFilters.priority || "all");
  const [groupIds, setGroupIds] = useState<number[]>(initialFilters.groupIds);
  const [referenceId, setReferenceId] = useState(initialFilters.referenceId || "all");
  const [missing, setMissing] = useState(initialFilters.missing || "all");
  const [tableSortKey, setTableSortKey] = useState<ContactTableSortKey>("name");
  const [tableSortDirection, setTableSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
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
    if (status !== "all") params.set("status", status);
    if (priority !== "all") params.set("priority", priority);
    if (groupIds.length > 0) params.set("groups", groupIds.join(","));
    if (referenceId !== "all") params.set("referenceId", referenceId);
    if (missing !== "all") params.set("missing", missing);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return `/dashboard/contacts${query ? `?${query}` : ""}`;
  }

  function applyFilters() {
    window.location.href = contactsUrl(1);
  }

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return contacts.filter((contact) => {
      const haystack = [
        contact.first_name,
        contact.last_name,
        contact.institution,
        contact.institutional_role,
        contact.email,
        contact.city,
        contact.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!term || haystack.includes(term)) &&
        (status === "all" || contact.status === status) &&
        (priority === "all" || contact.priority === priority) &&
        (groupIds.length === 0 ||
          groupIds.some((groupId) => contact.group_ids.includes(groupId))) &&
        (referenceId === "all" || contact.reference_ids.includes(Number(referenceId))) &&
        (missing === "all" ||
          (missing === "yes" ? contact.missing_fields.length > 0 : contact.missing_fields.length === 0))
      );
    });
  }, [contacts, deferredSearch, groupIds, missing, priority, referenceId, status]);

  const tableContacts = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aGroups = optionNames(a.group_ids, groups).join(", ");
      const bGroups = optionNames(b.group_ids, groups).join(", ");
      const aReferences = optionNames(a.reference_ids, references).join(", ");
      const bReferences = optionNames(b.reference_ids, references).join(", ");
      const sortValues: Record<ContactTableSortKey, [string | number, string | number]> = {
        name: [contactDisplayName(a), contactDisplayName(b)],
        role: [a.institutional_role ?? "", b.institutional_role ?? ""],
        institution: [a.institution ?? "", b.institution ?? ""],
        groups: [aGroups, bGroups],
        references: [aReferences, bReferences],
        country: [a.country ?? "", b.country ?? ""],
        language: [a.spoken_language ?? "", b.spoken_language ?? ""],
        status: [a.status, b.status],
        priority: [a.priority, b.priority],
        missing: [a.missing_fields.length, b.missing_fields.length],
      };

      const [aValue, bValue] = sortValues[tableSortKey];
      return compareValues(aValue, bValue, tableSortDirection);
    });
  }, [filtered, groups, references, tableSortDirection, tableSortKey]);
  const visibleContacts = viewMode === "table" ? tableContacts : filtered;

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
            <select value={referenceId} onChange={(event) => setReferenceId(event.target.value)} aria-label="Filtra per referente" className={inputClass}>
              <option value="all">Tutti i referenti</option>{references.map((reference) => <option key={reference.id} value={reference.id}>{reference.name}</option>)}
            </select>
            <select value={missing} onChange={(event) => setMissing(event.target.value)} aria-label="Filtra per dati mancanti" className={inputClass}>
              <option value="all">Tutti i dati</option><option value="yes">Con dati mancanti</option><option value="no">Dati completi</option>
            </select>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-xl bg-[#1b3272] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263f86]"
            >
              Applica filtri
            </button>
            <a
              href="/dashboard/contacts?status=active"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Rimuovi filtri
            </a>
          </div>
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
            onSort={toggleTableSort}
            onOpenContact={setSelectedContact}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleContacts.map((contact) => (
              <ContactEditor
                key={contact.id}
                contact={contact}
                groups={groups}
                references={references}
                languages={languages}
                isManager={isManager}
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
          onClick={() => setSelectedContact(null)}
        >
          <div
            className="w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Chiudi
              </button>
            </div>
            <ContactEditor
              key={selectedContact.id}
              contact={selectedContact}
              groups={groups}
              references={references}
              languages={languages}
              isManager={isManager}
              open
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
