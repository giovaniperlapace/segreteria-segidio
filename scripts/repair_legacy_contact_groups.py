#!/usr/bin/env python3
"""Remove contact-group links wrongly imported from Access PersoneGruppi roles.

The operational group for a legacy contact comes from Persone.IdGruppo. An older
export also treated PersoneGruppi.IdRuolo as extra contact groups. This script
computes those role-derived pairs from Access and removes only those exact pairs
from Supabase, leaving the Persone.IdGruppo group and unrelated manual links
untouched.
"""

from __future__ import annotations

import argparse
import csv
import subprocess
import urllib.parse
from collections import defaultdict
from pathlib import Path
from typing import Any

from import_legacy_access_contacts import SupabaseRest, clean, load_env, normalize_key


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MDB = ROOT / "old_software" / "DbSegreteria2.mdb"
BATCH_SIZE = 100


def export_table(mdb_path: Path, table: str) -> list[dict[str, str]]:
    result = subprocess.run(
        ["mdb-export", str(mdb_path), table],
        check=True,
        capture_output=True,
        text=True,
    )
    return list(csv.DictReader(result.stdout.splitlines()))


def lookup(rows: list[dict[str, str]], id_column: str, value_column: str) -> dict[str, str]:
    return {
        clean(row.get(id_column)): clean(row.get(value_column))
        for row in rows
        if clean(row.get(id_column))
    }


def access_group_names(mdb_path: Path) -> set[str]:
    return {
        normalize_key(row["Gruppo"])
        for row in export_table(mdb_path, "Gruppi")
        if clean(row.get("Gruppo"))
    }


def role_derived_wrong_pairs(mdb_path: Path) -> set[tuple[int, str]]:
    people = export_table(mdb_path, "Persone")
    groups_by_id = lookup(export_table(mdb_path, "Gruppi"), "IdGruppo", "Gruppo")
    roles_by_id = lookup(export_table(mdb_path, "Ruoli"), "IdRuolo", "Ruolo")

    main_pairs: set[tuple[int, str]] = set()
    for row in people:
        legacy_id = clean(row.get("IdPersona"))
        group_name = groups_by_id.get(clean(row.get("IdGruppo")), "")
        if legacy_id and group_name:
            main_pairs.add((int(legacy_id), normalize_key(group_name)))

    role_pairs: set[tuple[int, str]] = set()
    for relation in export_table(mdb_path, "PersoneGruppi"):
        legacy_id = clean(relation.get("IdPersona"))
        role_name = roles_by_id.get(clean(relation.get("IdRuolo")), "")
        if legacy_id and role_name:
            role_pairs.add((int(legacy_id), normalize_key(role_name)))

    return role_pairs - main_pairs


def batched(values: list[int], size: int) -> list[list[int]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def delete_wrong_links(client: SupabaseRest, rows: list[dict[str, int]]) -> None:
    contact_ids_by_group_id: dict[int, list[int]] = defaultdict(list)
    for row in rows:
        contact_ids_by_group_id[row["group_id"]].append(row["contact_id"])

    for group_id, contact_ids in contact_ids_by_group_id.items():
        for batch in batched(sorted(contact_ids), BATCH_SIZE):
            filter_value = f"group_id=eq.{group_id}&contact_id=in.({','.join(map(str, batch))})"
            client.delete("contact_groups", urllib.parse.quote(filter_value, safe="=&.,()"))


def delete_extra_groups(client: SupabaseRest, group_ids: list[int]) -> None:
    for batch in batched(sorted(group_ids), BATCH_SIZE):
        filter_value = f"id=in.({','.join(map(str, batch))})"
        client.delete("groups", urllib.parse.quote(filter_value, safe="=&.,()"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mdb", type=Path, default=DEFAULT_MDB)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--allow-insecure-tls", action="store_true")
    args = parser.parse_args()

    env = load_env(ROOT / ".env.local")
    url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_key:
        raise RuntimeError("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")

    valid_access_group_names = access_group_names(args.mdb)
    wrong_legacy_pairs = role_derived_wrong_pairs(args.mdb)
    client = SupabaseRest(url, service_key, allow_insecure_tls=args.allow_insecure_tls)

    contacts_by_legacy_id = {
        int(row["legacy_access_id"]): int(row["id"])
        for row in client.select_all("contacts", "id,legacy_access_id", "&legacy_access_id=not.is.null")
    }
    legacy_id_by_contact_id = {contact_id: legacy_id for legacy_id, contact_id in contacts_by_legacy_id.items()}
    group_rows = client.select_all("groups", "id,name")
    groups_by_name = {normalize_key(str(row["name"])): int(row["id"]) for row in group_rows}
    group_name_by_id = {group_id: name for name, group_id in groups_by_name.items()}

    wrong_db_pairs = {
        (contacts_by_legacy_id[legacy_id], groups_by_name[group_name])
        for legacy_id, group_name in wrong_legacy_pairs
        if legacy_id in contacts_by_legacy_id and group_name in groups_by_name
    }
    existing_contact_groups = {
        (int(row["contact_id"]), int(row["group_id"]))
        for row in client.select_all("contact_groups", "contact_id,group_id")
    }
    contact_group_counts: dict[int, int] = defaultdict(int)
    for _contact_id, group_id in existing_contact_groups:
        contact_group_counts[group_id] += 1
    rows_to_delete = [
        {"contact_id": contact_id, "group_id": group_id}
        for contact_id, group_id in sorted(wrong_db_pairs & existing_contact_groups)
    ]
    extra_group_rows = [
        row
        for row in group_rows
        if normalize_key(str(row["name"])) not in valid_access_group_names
        and contact_group_counts[int(row["id"])] == 0
    ]

    print(f"role-derived Access pairs not matching Persone.IdGruppo: {len(wrong_legacy_pairs)}")
    print(f"matching wrong links currently present in Supabase: {len(rows_to_delete)}")
    print(f"extra role-derived empty groups to remove: {len(extra_group_rows)}")
    if rows_to_delete:
        print("sample links to remove:")
        for row in rows_to_delete[:10]:
            print(
                "  "
                f"legacy_access_id={legacy_id_by_contact_id.get(row['contact_id'])} "
                f"group={group_name_by_id.get(row['group_id'])}"
            )

    if not args.apply:
        print("dry run only; rerun with --apply to remove these links")
        return

    delete_wrong_links(client, rows_to_delete)
    delete_extra_groups(client, [int(row["id"]) for row in extra_group_rows])
    print(f"removed wrong contact-group links: {len(rows_to_delete)}")
    print(f"removed extra empty groups: {len(extra_group_rows)}")


if __name__ == "__main__":
    main()
