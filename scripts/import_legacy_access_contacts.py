#!/usr/bin/env python3
"""Import reviewed legacy Access contact CSVs into Supabase.

The import is intentionally idempotent on legacy identifiers and names:

- contacts are matched by contacts.legacy_access_id;
- groups are matched by case-insensitive name;
- internal references are matched by legacy_access_contact_name;
- contact-group and contact-reference relations are inserted if missing.

Countries are normalized only when the mapping is unambiguous. Unknown or
organization-like values are preserved for the post-import normalization pass.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXPORT_DIR = ROOT / "old_software" / "export"
CONTACT_COMPONENT = ROOT / "src/app/dashboard/contacts/contact-management.tsx"

COUNTRY_ALIASES = {
    "afganistan": "Afghanistan",
    "albania": "Albania",
    "bosnia-erzegovina": "Bosnia ed Erzegovina",
    "cekia": "Repubblica Ceca",
    "egitto": "Egitto",
    "gabon": "Gabon",
    "grecia": "Grecia",
    "gran bretagna": "Regno Unito",
    "guinea bissau": "Guinea-Bissau",
    "inghilterra": "Regno Unito",
    "italia": "Italia",
    "kazachstan": "Kazakistan",
    "kenia": "Kenya",
    "lesotho": "Lesotho",
    "macedonia": "Macedonia del Nord",
    "madagascar": "Madagascar",
    "marocco": "Marocco",
    "myanmar": "Myanmar",
    "niger": "Niger",
    "norvegia": "Norvegia",
    "panama": "Panama",
    "panamà": "Panama",
    "peru": "Peru",
    "perù": "Peru",
    "principato di monaco": "Monaco",
    "repubblica ceca": "Repubblica Ceca",
    "sud africa": "Sudafrica",
    "svezia": "Svezia",
    "usa": "Stati Uniti",
    "u.s.a.": "Stati Uniti",
    "stati uniti d'america": "Stati Uniti",
    "zimbabwe": "Zimbabwe",
    "birmania": "Myanmar",
    "brasile": "Brasile",
    "bosnia-erzegovina": "Bosnia ed Erzegovina",
    "citta del vaticano": "Vaticano",
    "kazakhstan": "Kazakistan",
    "malaysia": "Malesia",
    "azerbaijan": "Azerbaigian",
    "rwanda": "Ruanda",
    "bahrain": "Bahrein",
    "guinea conakry": "Guinea",
    "repubblica moldova": "Moldavia",
    "congo (ex zaire)": "Repubblica Democratica del Congo",
}

PAGE_SIZE = 1000
BATCH_SIZE = 500


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value.strip().strip("\"'")
    return env


def clean(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def nullable(value: object) -> str | None:
    cleaned = clean(value)
    return cleaned or None


def nullable_int(value: object) -> int | None:
    cleaned = clean(value)
    if not cleaned or cleaned == "0":
        return None
    return int(cleaned)


def normalize_language(value: object) -> str | None:
    cleaned = clean(value)
    if not cleaned:
        return None
    return " ".join(part.capitalize() for part in cleaned.lower().split())


def normalize_key(value: str) -> str:
    normalized = (
        value.strip()
        .lower()
        .replace("à", "a")
        .replace("è", "e")
        .replace("é", "e")
        .replace("ì", "i")
        .replace("ò", "o")
        .replace("ù", "u")
    )
    return re.sub(r"\s+", " ", normalized)


def read_country_options() -> set[str]:
    source = CONTACT_COMPONENT.read_text(encoding="utf-8")
    match = re.search(r"const COUNTRY_OPTIONS = \[(.*?)\];", source, re.S)
    if not match:
        raise RuntimeError("COUNTRY_OPTIONS not found in contact-management.tsx")
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def normalize_country(raw_value: str, country_options: set[str]) -> tuple[str | None, bool]:
    value = clean(raw_value)
    if not value:
        return None, True
    if value in country_options:
        return value, True

    by_normalized = {normalize_key(option): option for option in country_options}
    key = normalize_key(value)
    if key in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[key], True
    if key in by_normalized:
        return by_normalized[key], True

    return value, False


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class SupabaseRest:
    def __init__(self, url: str, service_key: str, allow_insecure_tls: bool = False):
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.context = ssl._create_unverified_context() if allow_insecure_tls else None
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        prefer: str | None = None,
    ) -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, context=self.context) as response:
                payload = response.read().decode("utf-8")
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} failed: {error.code} {detail}") from error

    def select_all(self, table: str, select: str, extra: str = "") -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            query = f"?select={urllib.parse.quote(select, safe=',.*()')}&limit={PAGE_SIZE}&offset={offset}{extra}"
            page = self.request("GET", f"/{table}{query}") or []
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                return rows
            offset += PAGE_SIZE

    def insert(self, table: str, rows: list[dict[str, Any]], upsert_conflict: str | None = None) -> None:
        if not rows:
            return
        conflict = ""
        prefer = "return=minimal"
        if upsert_conflict:
            conflict = f"?on_conflict={urllib.parse.quote(upsert_conflict)}"
            prefer = "resolution=merge-duplicates,return=minimal"
        for index in range(0, len(rows), BATCH_SIZE):
            self.request("POST", f"/{table}{conflict}", rows[index : index + BATCH_SIZE], prefer=prefer)

    def patch(self, table: str, filters: str, values: dict[str, Any]) -> None:
        self.request("PATCH", f"/{table}?{filters}", values, prefer="return=minimal")

    def delete(self, table: str, filters: str) -> None:
        self.request("DELETE", f"/{table}?{filters}", prefer="return=minimal")


def table_by_key(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    return {normalize_key(str(row.get(key) or "")): row for row in rows if clean(row.get(key))}


def split_person_name(value: object) -> tuple[str, str]:
    parts = clean(value).split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def parse_access_date(value: object) -> str | None:
    cleaned = clean(value)
    if not cleaned:
        return None
    # Access exports Italian dates as dd/mm/yy or dd/mm/yy HH:MM:SS.
    date_part = cleaned.split()[0]
    pieces = date_part.split("/")
    if len(pieces) != 3:
        return None
    first, second, year = pieces
    if len(year) == 2:
        numeric_year = int(year)
        year = str(2000 + numeric_year if numeric_year < 50 else 1900 + numeric_year)
    first_number = int(first)
    second_number = int(second)
    if second_number > 12 and first_number <= 12:
        month, day = first_number, second_number
    else:
        day, month = first_number, second_number
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def prepare_reference_rows(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    prepared: list[dict[str, Any]] = []
    for row in rows:
        full_name = clean(row["full_name"])
        first_name = clean(row.get("first_name")) or split_person_name(full_name)[0]
        last_name = clean(row.get("last_name")) or split_person_name(full_name)[1]
        prepared.append(
            {
                "legacy_access_contact_name": clean(row["legacy_access_contact_name"]),
                "first_name": first_name,
                "last_name": last_name or None,
                "full_name": " ".join(part for part in [first_name, last_name] if part),
                "active": row.get("active", "true").lower() == "true",
            }
        )
    return prepared


def rebuild_legacy_references(
    client: SupabaseRest,
    references_csv: list[dict[str, str]],
    contact_references_csv: list[dict[str, str]],
) -> None:
    existing_refs = table_by_key(
        client.select_all("internal_references", "id,legacy_access_contact_name"),
        "legacy_access_contact_name",
    )
    new_refs = [
        row
        for row in prepare_reference_rows(references_csv)
        if normalize_key(row["legacy_access_contact_name"]) not in existing_refs
    ]
    client.insert("internal_references", new_refs)

    refreshed_refs = {
        normalize_key(row["legacy_access_contact_name"]): int(row["id"])
        for row in client.select_all("internal_references", "id,legacy_access_contact_name")
        if row.get("legacy_access_contact_name")
    }
    contacts = {
        int(row["legacy_access_id"]): int(row["id"])
        for row in client.select_all("contacts", "id,legacy_access_id", "&legacy_access_id=not.is.null")
    }

    client.delete(
        "contact_references",
        "relationship_kind=eq.legacy_access_contatto",
    )

    compound_legacy_names = [
        row["legacy_access_contact_name"]
        for row in client.select_all(
            "internal_references",
            "legacy_access_contact_name",
            "&profile_id=is.null&legacy_access_contact_name=like.*%2C*",
        )
        if row.get("legacy_access_contact_name")
    ]
    for name in compound_legacy_names:
        client.patch(
            "internal_references",
            "legacy_access_contact_name=eq."
            + urllib.parse.quote(name, safe=""),
            {"active": False},
        )

    links: list[dict[str, Any]] = []
    missing_links = 0
    for row in contact_references_csv:
        contact_id = contacts.get(int(row["contact_legacy_access_id"]))
        reference_id = refreshed_refs.get(normalize_key(row["reference_legacy_access_contact_name"]))
        if not contact_id or not reference_id:
            missing_links += 1
            continue
        links.append(
            {
                "contact_id": contact_id,
                "reference_id": reference_id,
                "relationship_kind": row.get("relationship_kind") or "legacy_access_contatto",
                "is_primary": row.get("is_primary", "true").lower() == "true",
            }
        )
    client.insert("contact_references", links, upsert_conflict="contact_id,reference_id")

    print("legacy references rebuilt")
    print(f"inserted missing atomic references: {len(new_refs)}")
    print(f"disabled compound legacy references: {len(compound_legacy_names)}")
    print(f"contact-reference links written: {len(links)}")
    print(f"missing contact-reference links skipped: {missing_links}")


def import_legacy(
    export_dir: Path,
    apply: bool,
    allow_insecure_tls: bool,
    update_existing: bool,
) -> None:
    env = load_env(ROOT / ".env.local")
    url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_key:
        raise RuntimeError("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")

    country_options = read_country_options()
    contacts_csv = read_csv(export_dir / "contacts.csv")
    groups_csv = read_csv(export_dir / "groups.csv")
    contact_groups_csv = read_csv(export_dir / "contact_groups.csv")
    references_csv = read_csv(export_dir / "internal_references.csv")
    contact_references_csv = read_csv(export_dir / "contact_references.csv")

    country_report: Counter[str] = Counter()
    unknown_countries: Counter[str] = Counter()
    contacts_payload: list[dict[str, Any]] = []

    for row in contacts_csv:
        legacy_id = int(row["legacy_access_id"])
        country, known_country = normalize_country(row.get("country", ""), country_options)
        if country:
            country_report[country] += 1
        if country and not known_country:
            unknown_countries[country] += 1

        first_name = clean(row.get("first_name"))
        last_name = clean(row.get("last_name"))
        mailing_name = nullable(row.get("mailing_name"))
        institutional_role = nullable(row.get("institutional_role"))
        fallback_institution = None
        if not first_name and not last_name:
            fallback_institution = mailing_name or institutional_role or nullable(row.get("city")) or f"Contatto legacy {legacy_id}"

        office_name = nullable(row.get("office_name"))
        institution = office_name or nullable(row.get("institution")) or fallback_institution

        contacts_payload.append(
            {
                "legacy_access_id": legacy_id,
                "legacy_access_old_archive_id": nullable_int(row.get("legacy_access_old_archive_id")),
                "honorific_title": nullable(row.get("honorific_title")),
                "honorific_title_english": nullable(row.get("honorific_title_english")),
                "honorific_title_invitation": nullable(row.get("honorific_title_invitation")),
                "first_name": first_name,
                "last_name": last_name,
                "legacy_description": nullable(row.get("legacy_description")),
                "email": nullable(row.get("email", "").lower()),
                "email_2": nullable(row.get("email_2", "").lower()),
                "phone": nullable(row.get("phone")),
                "phone_home": nullable(row.get("phone_home")),
                "phone_office_2": nullable(row.get("phone_office_2")),
                "mobile_phone": nullable(row.get("mobile_phone")),
                "fax": nullable(row.get("fax")),
                "fax_home": nullable(row.get("fax_home")),
                "telex_office": nullable(row.get("telex_office")),
                "website": nullable(row.get("website")),
                "website_2": nullable(row.get("website_2")),
                "mailing_name": mailing_name,
                "address_line": nullable(row.get("address_line")),
                "postal_code": nullable(row.get("postal_code")),
                "city": nullable(row.get("city")),
                "country": country,
                "home_address_line": nullable(row.get("home_address_line")),
                "home_postal_code": nullable(row.get("home_postal_code")),
                "home_city": nullable(row.get("home_city")),
                "home_province": nullable(row.get("home_province")),
                "home_country": nullable(row.get("home_country")),
                "office_name": office_name,
                "office_address_line": nullable(row.get("office_address_line")),
                "office_postal_code": nullable(row.get("office_postal_code")),
                "office_city": nullable(row.get("office_city")),
                "office_province": nullable(row.get("office_province")),
                "office_country": nullable(row.get("office_country")),
                "spoken_language": normalize_language(row.get("spoken_language")),
                "spoken_language_2": normalize_language(row.get("spoken_language_2")),
                "invitation_language": normalize_language(row.get("invitation_language")),
                "translation_language": normalize_language(row.get("translation_language")),
                "institution": institution,
                "institutional_role": institutional_role,
                "institutional_role_english": nullable(row.get("institutional_role_english")),
                "institutional_role_invitation": nullable(row.get("institutional_role_invitation")),
                "legacy_salutation": nullable(row.get("legacy_salutation")),
                "religion": nullable(row.get("religion")),
                "legacy_organization_id": nullable_int(row.get("legacy_organization_id")),
                "legacy_organization_name": nullable(row.get("legacy_organization_name")),
                "legacy_office_site": nullable(row.get("legacy_office_site")),
                "mail_address_preference": nullable_int(row.get("mail_address_preference")),
                "legacy_contacts_raw": nullable(row.get("legacy_contacts_raw")),
                "accompanist": nullable(row.get("accompanist")),
                "legacy_archive_type": nullable(row.get("legacy_archive_type")),
                "legacy_created_at": parse_access_date(row.get("legacy_created_at")),
                "legacy_updated_at": parse_access_date(row.get("legacy_updated_at")),
                "legacy_invitation_group": nullable(row.get("legacy_invitation_group")),
                "notes": nullable(row.get("notes")),
                "status": row.get("status") or "active",
                "priority": row.get("priority") or "standard",
            }
        )

    print("Dry run" if not apply else "Applying import")
    print(f"contacts: {len(contacts_payload)}")
    print(f"groups: {len(groups_csv)}")
    print(f"contact_groups: {len(contact_groups_csv)}")
    print(f"internal_references: {len(references_csv)}")
    print(f"contact_references: {len(contact_references_csv)}")
    print(f"known/non-empty countries after normalization: {sum(country_report.values())}")
    if unknown_countries:
        print("countries preserved for post-import review:")
        for value, count in unknown_countries.most_common():
            print(f"  {count:4} {value}")

    if not apply:
        return

    client = SupabaseRest(url, service_key, allow_insecure_tls=allow_insecure_tls)

    existing_languages = table_by_key(client.select_all("contact_languages", "id,name"), "name")
    language_names = sorted(
        {
            value
            for contact in contacts_payload
            for value in (
                contact.get("spoken_language"),
                contact.get("spoken_language_2"),
                contact.get("invitation_language"),
                contact.get("translation_language"),
            )
            if isinstance(value, str) and value
        },
        key=str.lower,
    )
    new_languages = [
        {"name": language, "active": True, "sort_order": 100}
        for language in language_names
        if normalize_key(language) not in existing_languages
    ]
    client.insert("contact_languages", new_languages)

    existing_groups = table_by_key(client.select_all("groups", "id,name"), "name")
    new_groups = [
        {"name": clean(row["name"]), "active": row.get("active", "true").lower() == "true"}
        for row in groups_csv
        if normalize_key(row["name"]) not in existing_groups
    ]
    client.insert("groups", new_groups)

    existing_refs = table_by_key(
        client.select_all("internal_references", "id,legacy_access_contact_name"),
        "legacy_access_contact_name",
    )
    new_refs = [
        row
        for row in prepare_reference_rows(references_csv)
        if normalize_key(row["legacy_access_contact_name"]) not in existing_refs
    ]
    client.insert("internal_references", new_refs)

    existing_legacy_ids = {
        int(row["legacy_access_id"])
        for row in client.select_all("contacts", "legacy_access_id", "&legacy_access_id=not.is.null")
    }
    contacts_to_write = (
        contacts_payload
        if update_existing
        else [row for row in contacts_payload if int(row["legacy_access_id"]) not in existing_legacy_ids]
    )
    client.insert("contacts", contacts_to_write, upsert_conflict="legacy_access_id")

    contacts = {
        int(row["legacy_access_id"]): int(row["id"])
        for row in client.select_all("contacts", "id,legacy_access_id", "&legacy_access_id=not.is.null")
    }
    groups = {
        normalize_key(row["name"]): int(row["id"])
        for row in client.select_all("groups", "id,name")
    }
    references = {
        normalize_key(row["legacy_access_contact_name"]): int(row["id"])
        for row in client.select_all("internal_references", "id,legacy_access_contact_name")
        if row.get("legacy_access_contact_name")
    }

    contact_groups_payload = []
    missing_group_links = 0
    for row in contact_groups_csv:
        contact_id = contacts.get(int(row["contact_legacy_access_id"]))
        group_id = groups.get(normalize_key(row["group_name"]))
        if not contact_id or not group_id:
            missing_group_links += 1
            continue
        contact_groups_payload.append({"contact_id": contact_id, "group_id": group_id})
    existing_contact_groups = {
        (int(row["contact_id"]), int(row["group_id"]))
        for row in client.select_all("contact_groups", "contact_id,group_id")
    }
    contact_groups_to_write = [
        row
        for row in contact_groups_payload
        if (int(row["contact_id"]), int(row["group_id"])) not in existing_contact_groups
    ]
    client.insert("contact_groups", contact_groups_to_write, upsert_conflict="contact_id,group_id")

    contact_references_payload = []
    missing_reference_links = 0
    for row in contact_references_csv:
        contact_id = contacts.get(int(row["contact_legacy_access_id"]))
        reference_id = references.get(normalize_key(row["reference_legacy_access_contact_name"]))
        if not contact_id or not reference_id:
            missing_reference_links += 1
            continue
        contact_references_payload.append(
            {
                "contact_id": contact_id,
                "reference_id": reference_id,
                "relationship_kind": row.get("relationship_kind") or "legacy_access_contatto",
                "is_primary": row.get("is_primary", "true").lower() == "true",
            }
        )
    existing_contact_references = {
        (int(row["contact_id"]), int(row["reference_id"]))
        for row in client.select_all("contact_references", "contact_id,reference_id")
    }
    contact_references_to_write = [
        row
        for row in contact_references_payload
        if (int(row["contact_id"]), int(row["reference_id"])) not in existing_contact_references
    ]
    client.insert("contact_references", contact_references_to_write, upsert_conflict="contact_id,reference_id")

    print("import complete")
    print(f"contacts written: {len(contacts_to_write)}")
    print(f"existing contacts skipped: {len(contacts_payload) - len(contacts_to_write)}")
    print(f"inserted missing groups: {len(new_groups)}")
    print(f"inserted missing languages: {len(new_languages)}")
    print(f"inserted missing references: {len(new_refs)}")
    print(f"contact-group links written: {len(contact_groups_to_write)}")
    print(f"existing contact-group links skipped: {len(contact_groups_payload) - len(contact_groups_to_write)}")
    print(f"contact-reference links written: {len(contact_references_to_write)}")
    print(
        "existing contact-reference links skipped: "
        f"{len(contact_references_payload) - len(contact_references_to_write)}"
    )
    print(f"missing contact-group links skipped: {missing_group_links}")
    print(f"missing contact-reference links skipped: {missing_reference_links}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-dir", type=Path, default=DEFAULT_EXPORT_DIR)
    parser.add_argument("--apply", action="store_true", help="Persist the import. Without this flag only prints a review summary.")
    parser.add_argument(
        "--allow-insecure-tls",
        action="store_true",
        help="Allow HTTPS connections to the self-hosted Supabase endpoint when local Python lacks the CA chain.",
    )
    parser.add_argument(
        "--update-existing",
        action="store_true",
        help="Update contacts that already have a legacy_access_id. By default existing legacy contacts are skipped to avoid audit churn.",
    )
    parser.add_argument(
        "--rebuild-legacy-references",
        action="store_true",
        help="Rebuild only legacy contact-reference links from the current CSVs.",
    )
    args = parser.parse_args()

    try:
        if args.rebuild_legacy_references:
            if not args.apply:
                raise RuntimeError("--rebuild-legacy-references requires --apply")
            env = load_env(ROOT / ".env.local")
            url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
            service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
            if not url or not service_key:
                raise RuntimeError("Missing Supabase URL or service role key in .env.local")
            client = SupabaseRest(url, service_key, allow_insecure_tls=args.allow_insecure_tls)
            rebuild_legacy_references(
                client,
                read_csv(args.export_dir / "internal_references.csv"),
                read_csv(args.export_dir / "contact_references.csv"),
            )
        else:
            import_legacy(
                args.export_dir,
                args.apply,
                args.allow_insecure_tls,
                args.update_existing,
            )
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
