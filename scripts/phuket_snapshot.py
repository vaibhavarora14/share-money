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


def http_json(url: str, headers: dict[str, str], data: bytes | None = None) -> Any:
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:240]
        raise SystemExit(f"request failed: HTTP {error.code} {detail}") from error


def project_ref() -> str:
    return os.environ.get("SUPABASE_PROJECT_REF", "").strip() or "xesuklogveedeppxbbit"


def rest_credentials() -> tuple[str, str]:
    ref = project_ref()
    url = (
        os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "").strip()
        or os.environ.get("SUPABASE_URL", "").strip()
        or f"https://{ref}.supabase.co"
    ).rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if key:
        return url, key
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        raise SystemExit("missing SUPABASE_ACCESS_TOKEN to load project API keys")
    payload = http_json(
        f"https://api.supabase.com/v1/projects/{ref}/api-keys",
        {"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    rows = payload if isinstance(payload, list) else []
    service = next(
        (
            row.get("api_key") or row.get("key") or ""
            for row in rows
            if isinstance(row, dict) and str(row.get("name") or row.get("id") or "").lower() in {"service_role", "service-role"}
        ),
        "",
    )
    if not service:
        raise SystemExit("management API did not return a service_role key")
    return url, service


def rest_get(base_url: str, key: str, table: str, query: str) -> list[dict[str, str]]:
    url = f"{base_url}/rest/v1/{table}?{query}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Prefer": "count=none",
    }
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8") or "[]")
    except urllib.error.HTTPError as error:
        if error.code in {404, 300, 406}:
            return []
        detail = error.read().decode("utf-8", errors="replace")[:240]
        if error.code == 400 and ("does not exist" in detail or "schema cache" in detail):
            return []
        raise SystemExit(f"rest {table} failed: HTTP {error.code} {detail}") from error
    if not isinstance(body, list):
        raise SystemExit(f"rest {table} returned unexpected payload")
    return stringify_rows(body)


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
    base_url, key = rest_credentials()
    groups = rest_get(
        base_url,
        key,
        "groups",
        "name=ilike.*phuket*&select=id,name,settlement_currency,unify_balances,created_at&order=created_at.desc",
    )
    if not groups:
        groups = rest_get(
            base_url,
            key,
            "groups",
            "name=ilike.*phuket*&select=id,name,created_at&order=created_at.desc",
        )
    if not groups:
        sample = rest_get(base_url, key, "groups", "select=name&order=created_at.desc&limit=12")
        raise SystemExit(
            "no group name matched Phuket. sample names: "
            + ", ".join((row.get("name") or "")[:40] for row in sample)
        )

    group = groups[0]
    group_id = group["id"]

    raw_participants = rest_get(
        base_url,
        key,
        "participants",
        f"group_id=eq.{group_id}&select=id,user_id,type,full_name,email",
    )
    participants: list[dict[str, str]] = []
    for row in raw_participants:
        email = (row.get("email") or "").strip()
        participants.append({
            "id": row.get("id") or "",
            "user_id": row.get("user_id") or "",
            "type": row.get("type") or "",
            "first_name": first_name(row.get("full_name") or ""),
            "email_hash": hashlib.md5(email.lower().encode("utf-8")).hexdigest() if email else "",
        })

    expenses = rest_get(
        base_url,
        key,
        "transactions",
        f"group_id=eq.{group_id}&type=eq.expense&select=id,amount,currency,paid_by_participant_id&limit=1000",
    )
    tx_ids = [row["id"] for row in expenses if row.get("id")]
    splits: list[dict[str, str]] = []
    for i in range(0, len(tx_ids), 50):
        chunk = ",".join(tx_ids[i:i + 50])
        splits.extend(rest_get(
            base_url,
            key,
            "transaction_splits",
            f"transaction_id=in.({chunk})&select=transaction_id,participant_id,amount",
        ))
    settlements = rest_get(
        base_url,
        key,
        "settlements",
        f"group_id=eq.{group_id}&select=from_participant_id,to_participant_id,amount,currency&limit=1000",
    )
    overrides = rest_get(
        base_url,
        key,
        "group_exchange_rates",
        f"group_id=eq.{group_id}&select=from_currency,to_currency,rate,source",
    )
    market = rest_get(
        base_url,
        key,
        "exchange_rates",
        "base_currency=eq.USD&select=quote_currency,rate,as_of,provider",
    )

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
