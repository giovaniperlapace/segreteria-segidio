"use client";

import { useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { createContactAction, updateContactAction } from "../archive-actions";
import {
  ActionMessage,
  inputClass,
  SubmitButton,
  useArchiveAction,
} from "../archive-ui";

export type ContactRecord = {
  id: number;
  honorific_title: string | null;
  first_name: string;
  last_name: string;
  institutional_role: string | null;
  institution: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  spoken_language: string | null;
  website: string | null;
  notes: string | null;
  missing_data_notes: string | null;
  status: "active" | "standby";
  priority: "standard" | "important" | "critical";
  group_ids: number[];
  reference_ids: number[];
  missing_fields: string[];
};

type Option = { id: number; name: string; active: boolean };
type LanguageOption = { id: number; name: string; active: boolean };
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
const CONTACTS_PAGE_SIZE = 100;

const FIELD_LABELS: Record<string, string> = {
  name: "nome",
  email: "email",
  institutional_role: "carica",
  institution: "istituzione",
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
              className="block w-full px-3 py-2 text-left text-slate-800 hover:bg-[#f4f1e8]"
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
  const normalizedSearch = normalizeSearch(search);
  const selectedOptions = options.filter((option) => selected.has(option.id));
  const visibleOptions = options
    .filter((option) => {
      if (selected.has(option.id)) return true;
      if (!normalizedSearch) return options.length <= 40;
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

  return (
    <div className="mt-1.5 rounded-xl border border-slate-300 bg-white p-3">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {selectedOptions.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="rounded-full bg-[#173f5f]/10 px-2.5 py-1 text-xs font-semibold text-[#173f5f]"
            >
              {option.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-xs text-slate-500">{emptyLabel}</p>
      )}
      {options.length > 12 ? (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchLabel}
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#b56b32] focus:outline-none focus:ring-2 focus:ring-[#b56b32]/20"
        />
      ) : null}
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {visibleOptions.length > 0 ? (
          visibleOptions.map((option) => (
            <label
              key={option.id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                selected.has(option.id)
                  ? "bg-[#173f5f]/10 font-semibold text-[#173f5f]"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                onChange={() => toggle(option.id)}
                className="h-4 w-4 accent-[#173f5f]"
              />
              <span>
                {option.name}
                {option.active ? "" : " (non attivo)"}
              </span>
            </label>
          ))
        ) : (
          <p className="px-2 py-3 text-sm text-slate-500">
            Nessuna opzione trovata.
          </p>
        )}
      </div>
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

  return (
    <div className="relative">
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
                  className="rounded-full bg-[#173f5f]/10 px-2.5 py-1 text-xs font-semibold text-[#173f5f]"
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
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#b56b32] focus:outline-none focus:ring-2 focus:ring-[#b56b32]/20"
          />
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {visibleGroups.map((group) => (
              <label
                key={group.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                  selected.has(group.id)
                    ? "bg-[#173f5f]/10 font-semibold text-[#173f5f]"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(group.id)}
                  onChange={() => toggle(group.id)}
                  className="h-4 w-4 accent-[#173f5f]"
                />
                <span>{group.name}</span>
              </label>
            ))}
          </div>
          {selectedIds.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-3 text-xs font-semibold text-[#b56b32] hover:underline"
            >
              Rimuovi filtro gruppi
            </button>
          ) : null}
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
          Sito web
          <input name="website" type="url" defaultValue={contact?.website ?? ""} className={inputClass} />
        </label>
        <label className={labelClass()}>
          Telefono
          <input name="phone" type="tel" defaultValue={contact?.phone ?? ""} className={inputClass} />
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
            <option value="standby">Stand-by</option>
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
              Riferimenti
              <AssociationPicker
                name="referenceIds"
                options={references}
                selectedIds={contact?.reference_ids ?? []}
                emptyLabel="Nessun riferimento selezionato."
                searchLabel="Cerca riferimento"
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
      </div>
      <p className="text-xs text-slate-500">
        Inserisci almeno nome, cognome o istituzione. Gruppi e riferimenti selezionati sono evidenziati sopra le opzioni.
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

function ContactEditor({
  contact,
  groups,
  references,
  languages,
  isManager,
}: {
  contact: ContactRecord;
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
  isManager: boolean;
}) {
  const [state, action, pending] = useArchiveAction(updateContactAction);
  const displayName = contactDisplayName(contact);
  const contactGroups = groups.filter((group) => contact.group_ids.includes(group.id));
  const contactReferences = references.filter((reference) => contact.reference_ids.includes(reference.id));

  return (
    <details className="group rounded-2xl border border-[#d8d1bd] bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="font-semibold text-[#173f5f]">{displayName}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {[contact.institutional_role, contact.institution, contact.email].filter(Boolean).join(" · ") || "Nessun dettaglio aggiuntivo"}
          </p>
          {contactGroups.length > 0 || contactReferences.length > 0 ? (
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              {contactGroups.length > 0 ? (
                <SummaryAssociations label="Gruppi" items={contactGroups} />
              ) : null}
              {contactReferences.length > 0 ? (
                <SummaryAssociations label="Riferimenti" items={contactReferences} />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-full px-2.5 py-1 ${contact.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
            {contact.status === "active" ? "Attivo" : "Stand-by"}
          </span>
          {contact.missing_fields.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
              {contact.missing_fields.length} dati mancanti
            </span>
          ) : null}
          <span className="rounded-full bg-[#173f5f]/10 px-2.5 py-1 text-[#173f5f]">
            {contact.priority === "critical" ? "Critica" : contact.priority === "important" ? "Importante" : "Standard"}
          </span>
        </div>
      </summary>
      <form action={action} className="space-y-4 border-t border-slate-200 px-5 py-5">
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
}: {
  contacts: ContactRecord[];
  groups: Option[];
  references: Option[];
  sortKey: ContactTableSortKey;
  sortDirection: "asc" | "desc";
  onSort: (key: ContactTableSortKey) => void;
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
        className="font-semibold text-[#173f5f] hover:text-[#b56b32]"
      >
        {label}
        {sortLabel(keyName)}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#d8d1bd] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-[#f8f6ef] text-left text-xs uppercase tracking-wide text-slate-500">
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
                {renderHeaderButton("references", "Riferimenti")}
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
                <tr key={contact.id} className="align-top hover:bg-[#f8f6ef]">
                  <td className="px-4 py-3 font-semibold text-[#173f5f]">
                    <div>{contactDisplayName(contact)}</div>
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
                      {contact.status === "active" ? "Attivo" : "Stand-by"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#173f5f]/10 px-2.5 py-1 text-xs font-semibold text-[#173f5f]">
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
}: {
  contacts: ContactRecord[];
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
  isManager: boolean;
  viewPreferenceKey: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [referenceId, setReferenceId] = useState("all");
  const [missing, setMissing] = useState("all");
  const [visibleCount, setVisibleCount] = useState(CONTACTS_PAGE_SIZE);
  const [tableSortKey, setTableSortKey] = useState<ContactTableSortKey>("name");
  const [tableSortDirection, setTableSortDirection] = useState<"asc" | "desc">("asc");
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
  const visibleContacts = (viewMode === "table" ? tableContacts : filtered).slice(0, visibleCount);

  return (
    <div className="space-y-8">
      {isManager ? (
        <details className="rounded-2xl border border-[#d8d1bd] bg-white px-5 py-4 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold text-[#173f5f]">Nuovo contatto</summary>
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

      <section className="rounded-2xl border border-[#d8d1bd] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#173f5f]">Archivio contatti</h2>
            <p className="mt-1 text-sm text-slate-600">{filtered.length} di {contacts.length} contatti</p>
          </div>
          <div className="flex rounded-xl border border-slate-300 bg-white p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => changeViewMode("cards")}
              className={`rounded-lg px-3 py-2 ${
                viewMode === "cards"
                  ? "bg-[#173f5f] text-white"
                  : "text-[#173f5f] hover:bg-[#173f5f]/10"
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
                  ? "bg-[#173f5f] text-white"
                  : "text-[#173f5f] hover:bg-[#173f5f]/10"
              }`}
              aria-pressed={viewMode === "table"}
            >
              Tabella
            </button>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca contatti" aria-label="Cerca contatti" className={inputClass} />
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtra per stato" className={inputClass}>
              <option value="all">Tutti gli stati</option><option value="active">Attivi</option><option value="standby">Stand-by</option>
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filtra per priorita" className={inputClass}>
              <option value="all">Tutte le priorita&apos;</option><option value="standard">Standard</option><option value="important">Importante</option><option value="critical">Critica</option>
            </select>
            <MultiGroupFilter
              groups={groups}
              selectedIds={groupIds}
              onChange={setGroupIds}
            />
            <select value={referenceId} onChange={(event) => setReferenceId(event.target.value)} aria-label="Filtra per riferimento" className={inputClass}>
              <option value="all">Tutti i riferimenti</option>{references.map((reference) => <option key={reference.id} value={reference.id}>{reference.name}</option>)}
            </select>
            <select value={missing} onChange={(event) => setMissing(event.target.value)} aria-label="Filtra per dati mancanti" className={inputClass}>
              <option value="all">Tutti i dati</option><option value="yes">Con dati mancanti</option><option value="no">Dati completi</option>
            </select>
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
          />
        ) : (
          visibleContacts.map((contact) => (
            <ContactEditor
              key={contact.id}
              contact={contact}
              groups={groups}
              references={references}
              languages={languages}
              isManager={isManager}
            />
          ))
        )}
        {visibleContacts.length < filtered.length ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + CONTACTS_PAGE_SIZE)}
              className="rounded-xl border border-[#d8d1bd] bg-white px-4 py-2.5 text-sm font-semibold text-[#173f5f] shadow-sm hover:border-[#b56b32]"
            >
              Mostra altri {Math.min(CONTACTS_PAGE_SIZE, filtered.length - visibleContacts.length)} contatti
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
