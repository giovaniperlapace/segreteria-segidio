#!/usr/bin/env python3
"""Import legacy Access events, invitations and attendance into Supabase.

Only the historical information required by the app is imported:

- Eventi -> events
- PersoneInviti -> event_invitations, only for known legacy events and contacts
- SpedizioniEmail -> optional conservative recovery of missing contact emails

Old Access Flag values are intentionally not imported. The new app has its own
per-event attention flag for future operational use.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MDB = ROOT / "old_software" / "DbSegreteria2.mdb"
PAGE_SIZE = 1000
BATCH_SIZE = 500
ROME = ZoneInfo("Europe/Rome")
EMAIL_PATTERN = re.compile(r"^[^\s@;<>]+@[^\s@;<>]+\.[^\s@;<>]+$")


def load_env(path: Path) -> dict[str, str]:
  env: dict[str, str] = {}
  if not path.exists():
    return env
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


def parse_access_datetime(value: str) -> datetime | None:
  raw = clean(value)
  if not raw:
    return None
  parsed = datetime.strptime(raw, "%m/%d/%y %H:%M:%S")
  return datetime.combine(parsed.date(), parsed.time() or time.min, tzinfo=ROME)


def read_mdb_table(mdb: Path, table: str) -> list[dict[str, str]]:
  output = subprocess.check_output(["mdb-export", str(mdb), table])
  return list(csv.DictReader(output.decode("utf-8", errors="replace").splitlines()))


def split_emails(value: str) -> list[str]:
  emails: list[str] = []
  for part in re.split(r"[;,\s]+", value or ""):
    email = part.strip().strip("<>,;").lower()
    if EMAIL_PATTERN.match(email):
      emails.append(email)
  return emails


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

  def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
    if not rows:
      return
    path = f"/{table}?on_conflict={urllib.parse.quote(conflict)}"
    for index in range(0, len(rows), BATCH_SIZE):
      self.request(
        "POST",
        path,
        rows[index : index + BATCH_SIZE],
        prefer="resolution=merge-duplicates,return=minimal",
      )

  def patch(self, table: str, filters: str, row: dict[str, Any]) -> None:
    self.request("PATCH", f"/{table}?{filters}", row, prefer="return=minimal")


def event_status(starts_at: datetime) -> str:
  return "concluded" if starts_at.date() < date.today() else "active"


def map_invitation_status(raw_invited: str) -> str:
  value = clean(raw_invited).lower()
  if value.startswith("no"):
    return "excluded"
  if value == "in attesa":
    return "proposed"
  return "invited"


def map_response_status(raw_viene: str, raw_liturgia: str, raw_ricevimento: str, raw_presenza: str) -> str:
  viene = clean(raw_viene).lower()
  liturgia = clean(raw_liturgia).lower()
  ricevimento = clean(raw_ricevimento).lower()
  presenza = clean(raw_presenza).lower()
  if viene.startswith("no") or viene in {"n", "np", "nip", "+no"} or viene.startswith("nip"):
    return "declined"
  if viene.startswith("forse") or viene.startswith("fors") or viene == "?":
    return "maybe"
  if (
    viene.startswith("si")
    or viene.startswith("sì")
    or viene == "s"
    or liturgia.startswith("si")
    or ricevimento.startswith("si")
    or presenza.startswith("si")
  ):
    return "attending"
  return "no_response"


def map_attendance_status(raw_presenza: str) -> str:
  presenza = clean(raw_presenza).lower()
  if presenza.startswith("si"):
    return "attended"
  if presenza.startswith("no"):
    return "absent"
  return "unknown"


def recover_missing_emails(
  contacts_by_legacy_id: dict[int, dict[str, Any]],
  spedizioni_rows: list[dict[str, str]],
) -> dict[int, str]:
  candidates: dict[int, Counter[str]] = defaultdict(Counter)
  for row in spedizioni_rows:
    raw_id = clean(row.get("IdPersona"))
    if not raw_id.isdigit():
      continue
    legacy_id = int(raw_id)
    contact = contacts_by_legacy_id.get(legacy_id)
    if not contact or contact.get("email") or contact.get("email_2"):
      continue
    for email in split_emails(row.get("Recipiente", "")):
      candidates[legacy_id][email] += 1

  recovered: dict[int, str] = {}
  for legacy_id, counts in candidates.items():
    if not counts:
      continue
    most_common = counts.most_common()
    if len(most_common) > 1 and most_common[0][1] == most_common[1][1]:
      continue
    recovered[legacy_id] = most_common[0][0]
  return recovered


def run_import(args: argparse.Namespace) -> None:
  if not args.mdb.exists():
    raise SystemExit(f"MDB not found: {args.mdb}")

  env = {**load_env(ROOT / ".env.local"), **load_env(ROOT / ".env")}
  url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
  service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
  if not url or not service_key:
    raise SystemExit("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")

  print("Reading legacy Access tables...")
  event_rows = read_mdb_table(args.mdb, "Eventi")
  type_rows = read_mdb_table(args.mdb, "EventiTipo")
  invitation_rows = read_mdb_table(args.mdb, "PersoneInviti")
  type_name_by_id = {clean(row.get("IdTipoEvento")): nullable(row.get("TipoEvento")) for row in type_rows}

  supabase = SupabaseRest(url, service_key, allow_insecure_tls=args.allow_insecure_tls)
  contacts = supabase.select_all("contacts", "id,legacy_access_id,email,email_2")
  contacts_by_legacy_id = {
    int(row["legacy_access_id"]): row
    for row in contacts
    if row.get("legacy_access_id") is not None
  }

  events_payload: list[dict[str, Any]] = []
  event_legacy_ids: set[int] = set()
  for row in event_rows:
    raw_event_id = clean(row.get("IdInvito"))
    starts_at = parse_access_datetime(row.get("Data", ""))
    if not raw_event_id.isdigit() or not starts_at:
      continue
    legacy_id = int(raw_event_id)
    event_legacy_ids.add(legacy_id)
    raw_type_id = clean(row.get("IdTipoEvento"))
    event_type_id = int(raw_type_id) if raw_type_id.isdigit() else None
    events_payload.append({
      "legacy_access_id": legacy_id,
      "legacy_event_type_id": event_type_id,
      "legacy_event_type_name": type_name_by_id.get(raw_type_id),
      "title": clean(row.get("Descrizione")) or f"Evento Access {legacy_id}",
      "starts_at": starts_at.isoformat(),
      "ends_at": None,
      "status": event_status(starts_at),
    })

  print(f"Prepared {len(events_payload)} events.")
  if args.apply:
    supabase.upsert("events", events_payload, "legacy_access_id")
    print("Events upserted.")
  else:
    print("Dry run: events not written.")

  if args.apply:
    db_events = supabase.select_all("events", "id,legacy_access_id", "&legacy_access_id=not.is.null")
    event_id_by_legacy_id = {
      int(row["legacy_access_id"]): int(row["id"])
      for row in db_events
      if row.get("legacy_access_id") is not None
    }
  else:
    event_id_by_legacy_id = {legacy_id: legacy_id for legacy_id in event_legacy_ids}

  invitations_payload: list[dict[str, Any]] = []
  skipped = Counter()
  for row in invitation_rows:
    raw_event_id = clean(row.get("IdInvito"))
    raw_person_id = clean(row.get("IdPersona"))
    if not raw_event_id.isdigit():
      skipped["missing_event_id"] += 1
      continue
    if not raw_person_id.isdigit():
      skipped["missing_person_id"] += 1
      continue
    legacy_event_id = int(raw_event_id)
    legacy_person_id = int(raw_person_id)
    event_id = event_id_by_legacy_id.get(legacy_event_id)
    contact = contacts_by_legacy_id.get(legacy_person_id)
    if event_id is None:
      skipped["event_not_imported"] += 1
      continue
    if contact is None:
      skipped["contact_not_imported"] += 1
      continue

    raw_invited = clean(row.get("Invitato"))
    raw_viene = clean(row.get("Viene"))
    raw_presence = clean(row.get("Presenza"))
    invitations_payload.append({
      "event_id": event_id,
      "contact_id": int(contact["id"]),
      "invitation_status": map_invitation_status(raw_invited),
      "response_status": map_response_status(
        raw_viene,
        row.get("Liturgia", ""),
        row.get("Ricevimento", ""),
        raw_presence,
      ),
      "attendance_status": map_attendance_status(raw_presence),
      "legacy_invited_raw": raw_invited or None,
      "legacy_viene_raw": raw_viene or None,
      "legacy_presence_raw": raw_presence or None,
    })

  print(f"Prepared {len(invitations_payload)} valid invitations.")
  if skipped:
    print("Skipped invitation rows:")
    for key, value in skipped.most_common():
      print(f"  {key}: {value}")

  if args.apply:
    supabase.upsert("event_invitations", invitations_payload, "event_id,contact_id")
    print("Invitations upserted.")
  else:
    print("Dry run: invitations not written.")

  if args.recover_missing_emails:
    spedizioni_rows = read_mdb_table(args.mdb, "SpedizioniEmail")
    recovered = recover_missing_emails(contacts_by_legacy_id, spedizioni_rows)
    print(f"Recoverable missing contact emails with conservative rule: {len(recovered)}")
    if args.apply:
      for legacy_id, email in recovered.items():
        contact_id = contacts_by_legacy_id[legacy_id]["id"]
        filters = f"id=eq.{urllib.parse.quote(str(contact_id))}"
        supabase.patch("contacts", filters, {"email": email})
      print("Recovered contact emails updated.")
    else:
      print("Dry run: recovered emails not written.")


def main() -> None:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--mdb", type=Path, default=DEFAULT_MDB)
  parser.add_argument("--apply", action="store_true")
  parser.add_argument("--allow-insecure-tls", action="store_true")
  parser.add_argument("--recover-missing-emails", action="store_true")
  args = parser.parse_args()
  run_import(args)


if __name__ == "__main__":
  try:
    main()
  except KeyboardInterrupt:
    sys.exit(130)
