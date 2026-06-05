#!/usr/bin/env python3
"""Export contact import CSVs from the real legacy Access data database.

`Segreteria2.mdb` is the legacy UI database. The actual archive tables live in
`DbSegreteria2.mdb`; the import is based on `Persone` plus lookup/link tables.

Generated CSVs:

- contacts.csv
- groups.csv
- contact_groups.csv
- internal_references.csv
- contact_references.csv
"""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
from pathlib import Path


CONTACT_HEADERS = [
    "legacy_access_id",
    "legacy_access_old_archive_id",
    "honorific_title",
    "honorific_title_english",
    "honorific_title_invitation",
    "first_name",
    "last_name",
    "legacy_description",
    "email",
    "email_2",
    "phone",
    "phone_home",
    "phone_office_2",
    "mobile_phone",
    "fax",
    "fax_home",
    "telex_office",
    "website",
    "website_2",
    "address_line",
    "postal_code",
    "city",
    "country",
    "home_address_line",
    "home_postal_code",
    "home_city",
    "home_province",
    "home_country",
    "office_name",
    "office_address_line",
    "office_postal_code",
    "office_city",
    "office_province",
    "office_country",
    "institutional_role",
    "institutional_role_english",
    "institutional_role_invitation",
    "institution",
    "legacy_salutation",
    "spoken_language",
    "spoken_language_2",
    "invitation_language",
    "translation_language",
    "religion",
    "legacy_organization_id",
    "legacy_organization_name",
    "legacy_office_site",
    "mail_address_preference",
    "legacy_contacts_raw",
    "accompanist",
    "legacy_archive_type",
    "legacy_created_at",
    "legacy_updated_at",
    "legacy_invitation_group",
    "notes",
    "status",
    "priority",
]


def clean(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def normalize_reference_label(value: object) -> str:
    return clean(str(value or "").replace("?", ""))


def split_reference_names(value: object) -> list[str]:
    raw = normalize_reference_label(value)
    if not raw:
        return []
    return [part for part in (normalize_reference_label(part) for part in raw.split(",")) if part]


def split_person_name(value: object) -> tuple[str, str]:
    parts = clean(value).split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def export_table(mdb_path: Path, table: str) -> list[dict[str, str]]:
    result = subprocess.run(
        ["mdb-export", str(mdb_path), table],
        check=True,
        capture_output=True,
        text=True,
    )
    return list(csv.DictReader(result.stdout.splitlines()))


def get_value(row: dict[str, str], *candidates: str) -> str:
    lower_lookup = {key.lower(): key for key in row}
    for candidate in candidates:
        key = lower_lookup.get(candidate.lower())
        if key is not None:
            return clean(row.get(key))
    return ""


def lookup(rows: list[dict[str, str]], id_column: str, value_column: str) -> dict[str, str]:
    return {
        clean(row.get(id_column)): clean(row.get(value_column))
        for row in rows
        if clean(row.get(id_column))
    }


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def status_from_attivo(value: object) -> str:
    return "active" if clean(value).upper() == "S" else "standby"


def selected_mailing_address(row: dict[str, str], home_country: str, office_country: str) -> tuple[str, str, str, str]:
    preference = clean(row.get("IndirizzoPosta"))
    # In the old UI, 1 usually means personal/home and 2 office. If absent,
    # prefer the office address because it is much more populated.
    if preference == "1":
        return (
            get_value(row, "Indirizzo"),
            get_value(row, "Cap"),
            get_value(row, "Comune"),
            home_country,
        )
    return (
        get_value(row, "IndirizzoUfficio") or get_value(row, "Indirizzo"),
        get_value(row, "CapUfficio") or get_value(row, "Cap"),
        get_value(row, "ComuneUfficio") or get_value(row, "Comune"),
        office_country or home_country,
    )


def normalize_group_key(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def build_exports(mdb_path: Path) -> dict[str, list[dict[str, str]]]:
    people = export_table(mdb_path, "Persone")
    states = lookup(export_table(mdb_path, "Stati"), "IdStato", "Stato")
    languages = lookup(export_table(mdb_path, "Lingue"), "IdLingua", "Lingua")
    groups_by_id = lookup(export_table(mdb_path, "Gruppi"), "IdGruppo", "Gruppo")
    religions_by_id = lookup(export_table(mdb_path, "Religioni"), "IdReligione", "Religione")
    organizations_by_id = lookup(export_table(mdb_path, "Organizzazioni"), "IdOrganizzazione", "Organizzazione")
    archive_types_by_id = lookup(export_table(mdb_path, "TipoArchivio"), "IdTipoArchivio", "TipoArchivio")

    contacts: list[dict[str, str]] = []
    groups: dict[str, dict[str, str]] = {}
    contact_groups: set[tuple[str, str]] = set()
    references: dict[str, dict[str, str]] = {}
    contact_references: dict[tuple[str, str], bool] = {}

    for row in people:
        legacy_id = get_value(row, "IdPersona")
        if not legacy_id:
            continue

        home_country = states.get(get_value(row, "IdStatoCasa"), "")
        office_country = states.get(get_value(row, "IdStatoUfficio"), "")
        primary_country = states.get(get_value(row, "IdStato"), "") or office_country or home_country
        address_line, postal_code, city, country = selected_mailing_address(row, home_country, office_country or primary_country)
        organization_id = get_value(row, "IdOrganizzazione")

        contacts.append(
            {
                "legacy_access_id": legacy_id,
                "legacy_access_old_archive_id": get_value(row, "IdOldArchivio"),
                "honorific_title": get_value(row, "Titolo"),
                "honorific_title_english": get_value(row, "TitoloInglese"),
                "honorific_title_invitation": get_value(row, "TitoloInvito"),
                "first_name": get_value(row, "Nome"),
                "last_name": get_value(row, "Cognome"),
                "legacy_description": get_value(row, "Descrizione"),
                "email": get_value(row, "eMail1"),
                "email_2": get_value(row, "eMail2"),
                "phone": get_value(row, "TelefonoUfficio1"),
                "phone_home": get_value(row, "TelefonoCasa"),
                "phone_office_2": get_value(row, "TelefonoUfficio2"),
                "mobile_phone": get_value(row, "Cellulare"),
                "fax": get_value(row, "FaxUfficio"),
                "fax_home": get_value(row, "FaxCasa"),
                "telex_office": get_value(row, "TelexUfficio"),
                "website": get_value(row, "HomePage1"),
                "website_2": get_value(row, "HomePage2"),
                "address_line": address_line,
                "postal_code": postal_code,
                "city": city,
                "country": country,
                "home_address_line": get_value(row, "Indirizzo"),
                "home_postal_code": get_value(row, "Cap"),
                "home_city": get_value(row, "Comune"),
                "home_province": get_value(row, "Provincia"),
                "home_country": home_country,
                "office_name": get_value(row, "NomeUfficio"),
                "office_address_line": get_value(row, "IndirizzoUfficio"),
                "office_postal_code": get_value(row, "CapUfficio"),
                "office_city": get_value(row, "ComuneUfficio"),
                "office_province": get_value(row, "ProvinciaUfficio"),
                "office_country": office_country or primary_country,
                "institutional_role": get_value(row, "Carica"),
                "institutional_role_english": get_value(row, "CaricaInglese"),
                "institutional_role_invitation": get_value(row, "CaricaInvito"),
                "institution": get_value(row, "NomeUfficio") or organizations_by_id.get(organization_id, ""),
                "legacy_salutation": get_value(row, "Intestazione"),
                "spoken_language": languages.get(get_value(row, "LinguaInvito"), "")
                or languages.get(get_value(row, "LinguaParlata"), ""),
                "spoken_language_2": languages.get(get_value(row, "LinguaParlata2"), ""),
                "invitation_language": languages.get(get_value(row, "LinguaInvito"), ""),
                "translation_language": languages.get(get_value(row, "LinguaTraduzione"), ""),
                "religion": religions_by_id.get(get_value(row, "IdReligione"), ""),
                "legacy_organization_id": organization_id,
                "legacy_organization_name": organizations_by_id.get(organization_id, ""),
                "legacy_office_site": get_value(row, "Sede"),
                "mail_address_preference": get_value(row, "IndirizzoPosta"),
                "legacy_contacts_raw": get_value(row, "Contatti"),
                "accompanist": get_value(row, "Accompagnatore"),
                "legacy_archive_type": archive_types_by_id.get(get_value(row, "IdTipoArchivio"), ""),
                "legacy_created_at": get_value(row, "Creazione_scheda"),
                "legacy_updated_at": get_value(row, "Aggiornamento_dati"),
                "legacy_invitation_group": get_value(row, "GruppoInviti"),
                "notes": get_value(row, "CampoNote"),
                "status": status_from_attivo(row.get("Attivo")),
                "priority": "standard",
            }
        )

        main_group = groups_by_id.get(get_value(row, "IdGruppo"), "")
        if main_group:
            key = normalize_group_key(main_group)
            groups.setdefault(key, {"name": main_group, "active": "true"})
            contact_groups.add((legacy_id, main_group))

        reference_names = split_reference_names(get_value(row, "Contatti"))
        for index, reference_name in enumerate(reference_names):
            reference_first_name, reference_last_name = split_person_name(reference_name)
            ref_key = normalize_group_key(reference_name)
            references.setdefault(
                ref_key,
                {
                    "legacy_access_contact_name": reference_name,
                    "first_name": reference_first_name,
                    "last_name": reference_last_name,
                    "full_name": reference_name,
                    "active": "true",
                },
            )
            contact_references.setdefault((legacy_id, reference_name), index == 0)

    return {
        "contacts": contacts,
        "groups": sorted(groups.values(), key=lambda item: item["name"].lower()),
        "contact_groups": [
            {"contact_legacy_access_id": contact_id, "group_name": group_name}
            for contact_id, group_name in sorted(contact_groups, key=lambda item: (int(item[0]), item[1].lower()))
        ],
        "internal_references": sorted(
            references.values(),
            key=lambda item: item["legacy_access_contact_name"].lower(),
        ),
        "contact_references": [
            {
                "contact_legacy_access_id": contact_id,
                "reference_legacy_access_contact_name": reference_name,
                "relationship_kind": "legacy_access_contatti",
                "is_primary": "true" if is_primary else "false",
            }
            for (contact_id, reference_name), is_primary in sorted(
                contact_references.items(),
                key=lambda item: (int(item[0][0]), item[0][1].lower()),
            )
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mdb",
        default="old_software/DbSegreteria2.mdb",
        type=Path,
        help="Path to the legacy Access data .mdb file.",
    )
    parser.add_argument(
        "--out",
        default="old_software/export",
        type=Path,
        help="Output directory for generated CSV files.",
    )
    args = parser.parse_args()

    if not args.mdb.exists():
        raise SystemExit(f"Access database not found: {args.mdb}")

    args.out.mkdir(parents=True, exist_ok=True)
    exports = build_exports(args.mdb)

    write_csv(args.out / "contacts.csv", CONTACT_HEADERS, exports["contacts"])
    write_csv(args.out / "groups.csv", ["name", "active"], exports["groups"])
    write_csv(
        args.out / "contact_groups.csv",
        ["contact_legacy_access_id", "group_name"],
        exports["contact_groups"],
    )
    write_csv(
        args.out / "internal_references.csv",
        ["legacy_access_contact_name", "first_name", "last_name", "full_name", "active"],
        exports["internal_references"],
    )
    write_csv(
        args.out / "contact_references.csv",
        [
            "contact_legacy_access_id",
            "reference_legacy_access_contact_name",
            "relationship_kind",
            "is_primary",
        ],
        exports["contact_references"],
    )

    for name, data in exports.items():
        print(f"{name}: {len(data)}")


if __name__ == "__main__":
    main()
