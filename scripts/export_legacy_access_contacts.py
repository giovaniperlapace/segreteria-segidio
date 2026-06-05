#!/usr/bin/env python3
"""Export contact import CSVs from the legacy Access database.

The script does not write to Supabase. It prepares normalized CSVs that can be
reviewed before a future import:

- contacts.csv
- groups.csv
- contact_groups.csv
- internal_references.csv
- contact_references.csv
"""

from __future__ import annotations

import argparse
import csv
import subprocess
from pathlib import Path


CONTACT_HEADERS = [
    "legacy_access_id",
    "honorific_title",
    "first_name",
    "last_name",
    "email",
    "phone",
    "mobile_phone",
    "fax",
    "website",
    "mailing_name",
    "address_line",
    "postal_code",
    "city",
    "country",
    "institutional_role",
    "notes",
    "status",
    "priority",
]


def clean(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def split_reference_names(value: object) -> list[str]:
    """Split legacy Contatto values into atomic internal reference labels."""
    raw = clean(value)
    if not raw:
        return []
    return [part for part in (clean(part) for part in raw.split(",")) if part]


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


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def build_exports(rows: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    contacts: list[dict[str, str]] = []
    groups: dict[str, dict[str, str]] = {}
    contact_groups: set[tuple[str, str]] = set()
    references: dict[str, dict[str, str]] = {}
    contact_references: dict[tuple[str, str], bool] = {}

    city_column = next((key for key in rows[0].keys() if key.lower().startswith("citt")), "")

    for row in rows:
        legacy_id = get_value(row, "ID")
        group_name = get_value(row, "Gruppo")
        reference_names = split_reference_names(get_value(row, "Contatto"))

        contacts.append(
            {
                "legacy_access_id": legacy_id,
                "honorific_title": get_value(row, "Titolo"),
                "first_name": get_value(row, "Nome"),
                "last_name": get_value(row, "Cognome"),
                "email": get_value(row, "E-Mail"),
                "phone": get_value(row, "Tel_Fisso"),
                "mobile_phone": get_value(row, "Tel_Cellulare"),
                "fax": get_value(row, "Fax"),
                "website": get_value(row, "Sito_Web"),
                "mailing_name": get_value(row, "Recapito"),
                "address_line": get_value(row, "Via"),
                "postal_code": get_value(row, "Cap"),
                "city": clean(row.get(city_column)) if city_column else "",
                "country": get_value(row, "Paese"),
                "institutional_role": get_value(row, "Qualifica"),
                "notes": get_value(row, "CampoNote"),
                "status": "active",
                "priority": "standard",
            }
        )

        if group_name:
            groups.setdefault(group_name.lower(), {"name": group_name, "active": "true"})
            if legacy_id:
                contact_groups.add((legacy_id, group_name))

        for index, reference_name in enumerate(reference_names):
            reference_first_name, reference_last_name = split_person_name(reference_name)
            references.setdefault(
                reference_name.lower(),
                {
                    "legacy_access_contact_name": reference_name,
                    "first_name": reference_first_name,
                    "last_name": reference_last_name,
                    "full_name": reference_name,
                    "active": "true",
                },
            )
            if legacy_id:
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
                "relationship_kind": "legacy_access_contatto",
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
        default="old_software/Segreteria2.mdb",
        type=Path,
        help="Path to the legacy Access .mdb file.",
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
    rows = export_table(args.mdb, "EXPO2000")
    exports = build_exports(rows)

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
