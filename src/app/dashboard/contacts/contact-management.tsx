"use client";

import { useDeferredValue, useMemo, useState } from "react";
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
              <select
                name="groupIds"
                multiple
                defaultValue={contact?.group_ids.map(String) ?? []}
                className={`${inputClass} min-h-28`}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}{group.active ? "" : " (non attivo)"}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass()}>
              Riferimenti
              <select
                name="referenceIds"
                multiple
                defaultValue={contact?.reference_ids.map(String) ?? []}
                className={`${inputClass} min-h-28`}
              >
                {references.map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {reference.name}{reference.active ? "" : " (non attivo)"}
                  </option>
                ))}
              </select>
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
        Inserisci almeno nome, cognome o istituzione. Per selezionare piu&apos; gruppi o riferimenti usa Ctrl/Cmd.
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
  const displayName =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.institution ||
    "Contatto senza nome";

  return (
    <details className="group rounded-2xl border border-[#d8d1bd] bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="font-semibold text-[#173f5f]">{displayName}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {[contact.institutional_role, contact.institution, contact.email].filter(Boolean).join(" · ") || "Nessun dettaglio aggiuntivo"}
          </p>
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

export function ContactManagement({
  contacts,
  groups,
  references,
  languages,
  isManager,
}: {
  contacts: ContactRecord[];
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
  isManager: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [groupId, setGroupId] = useState("all");
  const [referenceId, setReferenceId] = useState("all");
  const [missing, setMissing] = useState("all");
  const deferredSearch = useDeferredValue(search);

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
        (groupId === "all" || contact.group_ids.includes(Number(groupId))) &&
        (referenceId === "all" || contact.reference_ids.includes(Number(referenceId))) &&
        (missing === "all" ||
          (missing === "yes" ? contact.missing_fields.length > 0 : contact.missing_fields.length === 0))
      );
    });
  }, [contacts, deferredSearch, groupId, missing, priority, referenceId, status]);

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
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca contatti" aria-label="Cerca contatti" className={inputClass} />
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtra per stato" className={inputClass}>
              <option value="all">Tutti gli stati</option><option value="active">Attivi</option><option value="standby">Stand-by</option>
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filtra per priorita" className={inputClass}>
              <option value="all">Tutte le priorita&apos;</option><option value="standard">Standard</option><option value="important">Importante</option><option value="critical">Critica</option>
            </select>
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Filtra per gruppo" className={inputClass}>
              <option value="all">Tutti i gruppi</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
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
        ) : (
          filtered.map((contact) => (
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
      </section>
    </div>
  );
}
