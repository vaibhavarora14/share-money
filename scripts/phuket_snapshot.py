#!/usr/bin/env python3
"""Anonymized Phuket group snapshot from a production-equivalent database.

Prints JSON with first-name labels only. Never prints emails, full names,
or connection strings.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from urllib.parse import quote_plus


def round_money(amount: float) -> float:
    return float(Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def stringify_rows(rows: list[Any]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        out.append({key: "" if value is None else str(value) for key, value in row.items()})
    return out


def query_via_management_api(sql: str) -> list[dict[str, str]] | None:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    ref = os.environ.get("SUPABASE_PROJECT_REF", "").strip() or "xesuklogveedeppxbbit"
    if not token:
        return None
    payload = json.dumps({"query": sql}).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:240]
        raise SystemExit(f"management query failed: HTTP {error.code} {detail}") from error
    rows = body if isinstance(body, list) else body.get("data") or body.get("result") or []
    if not isinstance(rows, list):
        raise SystemExit("management query returned unexpected payload")
    return stringify_rows(rows)


def db_url() -> str:
    url = os.environ.get("SUPABASE_DATABASE_URL", "").strip()
    if url:
        return url
    password = os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
    ref = os.environ.get("SUPABASE_PROJECT_REF", "xesuklogveedeppxbbit").strip()
    if not password:
        raise SystemExit("missing SUPABASE_DATABASE_URL or SUPABASE_DB_PASSWORD")
    return (
        f"postgresql://postgres.{ref}:{quote_plus(password)}"
        f"@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
    )


def psql(url: str, sql: str) -> list[dict[str, str]]:
    result = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "-A", "-F", "\t", "-P", "footer=off", "-c", sql],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        err = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "psql failed"
        raise SystemExit(f"query failed: {err}")
    raw = result.stdout
    if not raw.strip():
        return []
    reader = csv.DictReader(io.StringIO(raw), delimiter="\t")
    return list(reader)


def query(sql: str) -> list[dict[str, str]]:
    managed = query_via_management_api(sql)
    if managed is not None:
        return managed
    return psql(db_url(), sql)


def first_name(value: str) -> str:
    token = (value or "").strip().split(" ")[0]
    return token or "Member"


def unique_label(name: str, used: dict[str, int]) -> str:
    used[name] = used.get(name, 0) + 1
    if used[name] == 1:
        return name
    return f"{name} {used[name]}"


def short_id(value: str) -> str:
    if not value:
        return ""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:10]


def canonical_map(participants: list[dict[str, str]]) -> dict[str, str]:
    best: dict[str, tuple[int, str]] = {}
    rank = {"member": 2, "former": 1}

    def key_for(row: dict[str, str]) -> str | None:
        email_hash = row.get("email_hash") or ""
        user_id = row.get("user_id") or ""
        if email_hash:
            return f"e:{email_hash}"
        if user_id:
            return f"u:{user_id}"
        return None

    for row in participants:
        ident = key_for(row)
        if not ident:
            continue
        score = rank.get(row.get("type") or "", 0)
        current = best.get(ident)
        if not current or score > current[0]:
            best[ident] = (score, row["id"])

    remap: dict[str, str] = {}
    for row in participants:
        ident = key_for(row)
        if not ident:
            continue
        winner = best[ident][1]
        if winner != row["id"]:
            remap[row["id"]] = winner
    return remap


def compute_balances(
    participants: list[dict[str, str]],
    expense_rows: list[dict[str, str]],
    split_rows: list[dict[str, str]],
    settlement_rows: list[dict[str, str]],
) -> list[dict[str, Any]]:
    remap = canonical_map(participants)
    by_id = {row["id"]: row for row in participants}
    labels_used: dict[str, int] = {}
    labels: dict[str, str] = {}

    def canon(pid: str) -> str:
        return remap.get(pid, pid)

    def label_for(pid: str) -> str:
        if pid in labels:
            return labels[pid]
        row = by_id.get(pid) or {}
        labels[pid] = unique_label(first_name(row.get("first_name") or ""), labels_used)
        return labels[pid]

    nets: dict[tuple[str, str], float] = defaultdict(float)

    splits_by_tx: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in split_rows:
        splits_by_tx[row["transaction_id"]].append(row)

    for tx in expense_rows:
        payer = canon(tx.get("paid_by_participant_id") or "")
        if not payer:
            continue
        currency = (tx.get("currency") or "").upper()
        amount = float(tx["amount"])
        splits = splits_by_tx.get(tx["id"]) or []
        if not splits:
            continue
        nets[(payer, currency)] += amount
        for split in splits:
            pid = canon(split.get("participant_id") or "")
            if not pid:
                continue
            nets[(pid, currency)] -= float(split["amount"])

    for row in settlement_rows:
        sender = canon(row.get("from_participant_id") or "")
        receiver = canon(row.get("to_participant_id") or "")
        if not sender or not receiver:
            continue
        currency = (row.get("currency") or "").upper()
        amount = float(row["amount"])
        if amount <= 0:
            continue
        nets[(sender, currency)] += amount
        nets[(receiver, currency)] -= amount

    balances: list[dict[str, Any]] = []
    for (pid, currency), amount in sorted(nets.items()):
        rounded = round_money(amount)
        if abs(rounded) <= 0.01:
            continue
        person = by_id.get(pid) or {}
        balances.append({
            "label": label_for(pid),
            "user_id": short_id(person.get("user_id") or pid),
            "participant_id": short_id(pid),
            "amount": rounded,
            "currency": currency,
        })
    return balances


def main() -> None:
    group_columns = {
        row.get("column_name")
        for row in query(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'groups'
              AND column_name IN ('settlement_currency', 'unify_balances');
            """
        )
    }
    settlement_select = (
        "coalesce(settlement_currency, '')" if "settlement_currency" in group_columns else "''"
    )
    unify_select = (
        "coalesce(unify_balances, false)::text" if "unify_balances" in group_columns else "'false'"
    )
    groups = query(
        f"""
        SELECT id::text, name, {settlement_select} AS settlement_currency,
               {unify_select} AS unify_balances,
               created_at::text
        FROM public.groups
        WHERE name ILIKE '%phuket%'
        ORDER BY created_at DESC;
        """,
    )
    if not groups:
        all_names = query("SELECT name FROM public.groups ORDER BY created_at DESC LIMIT 40;")
        raise SystemExit(
            "no group name matched Phuket. sample names: "
            + ", ".join((row.get("name") or "")[:40] for row in all_names[:12])
        )

    group = groups[0]
    group_id = group["id"]

    participants = query(
        f"""
        SELECT id::text,
               coalesce(user_id::text, '') AS user_id,
               coalesce(type, '') AS type,
               split_part(coalesce(full_name, ''), ' ', 1) AS first_name,
               CASE
                 WHEN email IS NULL OR btrim(email) = '' THEN ''
                 ELSE md5(lower(btrim(email)))
               END AS email_hash
        FROM public.participants
        WHERE group_id = '{group_id}';
        """,
    )
    expenses = query(
        f"""
        SELECT id::text, amount::text, currency,
               coalesce(paid_by_participant_id::text, '') AS paid_by_participant_id
        FROM public.transactions
        WHERE group_id = '{group_id}' AND type = 'expense';
        """,
    )
    splits = query(
        f"""
        SELECT s.transaction_id::text, coalesce(s.participant_id::text, '') AS participant_id,
               s.amount::text
        FROM public.transaction_splits s
        JOIN public.transactions t ON t.id = s.transaction_id
        WHERE t.group_id = '{group_id}' AND t.type = 'expense';
        """,
    )
    settlements = query(
        f"""
        SELECT coalesce(from_participant_id::text, '') AS from_participant_id,
               coalesce(to_participant_id::text, '') AS to_participant_id,
               amount::text, currency
        FROM public.settlements
        WHERE group_id = '{group_id}';
        """,
    )
    tables = {
        row.get("table_name")
        for row in query(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('group_exchange_rates', 'exchange_rates');
            """
        )
    }
    overrides = query(
        f"""
        SELECT from_currency, to_currency, rate::text, source
        FROM public.group_exchange_rates
        WHERE group_id = '{group_id}';
        """,
    ) if "group_exchange_rates" in tables else []
    market = query(
        """
        SELECT quote_currency, rate::text, as_of::text, provider
        FROM public.exchange_rates
        WHERE base_currency = 'USD';
        """,
    ) if "exchange_rates" in tables else []

    usd_rates = {"USD": 1.0}
    as_of = None
    for row in market:
        code = (row.get("quote_currency") or "").upper()
        rate = float(row["rate"])
        if code and rate > 0:
            usd_rates[code] = rate
        as_of = row.get("as_of") or as_of

    snapshot = {
        "group": {
            "name": group["name"],
            "settlement_currency": (group.get("settlement_currency") or "").upper() or None,
            "unify_balances": str(group.get("unify_balances") or "").lower() == "true",
            "member_count": len(participants),
            "expense_count": len(expenses),
            "settlement_count": len(settlements),
            "match_count": len(groups),
        },
        "rate_book": {
            "as_of": as_of,
            "usd_rates": usd_rates,
            "overrides": [
                {
                    "from": row["from_currency"].upper(),
                    "to": row["to_currency"].upper(),
                    "rate": float(row["rate"]),
                    "source": row.get("source") or "group",
                }
                for row in overrides
            ],
        },
        "balances": compute_balances(participants, expenses, splits, settlements),
    }

    out_path = os.environ.get("SNAPSHOT_PATH", "phuket-snapshot.json")
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, indent=2)
        handle.write("\n")
    json.dump(snapshot, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
