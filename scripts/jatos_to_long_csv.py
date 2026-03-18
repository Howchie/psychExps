#!/usr/bin/env python3
"""Convert JATOS-style JSON/NDJSON export into one-row-per-trial long CSV."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


def load_payloads(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []

    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        payloads: list[dict[str, Any]] = []
        for idx, line in enumerate(text.splitlines(), start=1):
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON on line {idx}: {exc}") from exc
            if isinstance(parsed, dict):
                payloads.append(parsed)
        return payloads

    if isinstance(obj, dict):
        return [obj]
    if isinstance(obj, list):
        return [x for x in obj if isinstance(x, dict)]
    return []


def first_non_null(records: list[dict[str, Any]], *keys: str) -> Any:
    for rec in records:
        for key in keys:
            value = rec.get(key)
            if value is not None:
                return value
    return None


def record_score(rec: dict[str, Any]) -> int:
    score = 0
    phase = str(rec.get("phase") or "").lower()
    if "response" in phase:
        score += 8
    if rec.get("responseKey") is not None or rec.get("response") is not None:
        score += 4
    if rec.get("responseRtMs") is not None or rec.get("rt") is not None:
        score += 2
    if rec.get("clockTimeUnixMs") is not None:
        score += 1
    return score


def choose_best_record(records: list[dict[str, Any]]) -> dict[str, Any]:
    return max(records, key=record_score)


def get_any(d: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def to_trial_rows(payloads: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}
    unique_counter = 0

    for payload in payloads:
        selection = payload.get("selection", {}) or {}
        participant = selection.get("participant", {}) or {}
        task_id = selection.get("taskId")
        default_variant_id = selection.get("variantId")

        for rec in payload.get("records", []) or []:
            if not isinstance(rec, dict):
                continue

            participant_id = rec.get("participantId") or participant.get("participantId")
            variant_id = rec.get("variantId") or default_variant_id
            block_index = get_any(rec, "blockIndex", "block_index", "blockId", "block_id", "block")
            trial_index = get_any(
                rec, "trialIndex", "trial_index", "trialId", "trial_id", "index"
            )
            if trial_index is None:
                unique_counter += 1
                trial_index = f"__row_{unique_counter}"

            key = (participant_id, variant_id, block_index, trial_index)
            if key not in grouped:
                grouped[key] = {
                    "selection": selection,
                    "participant": participant,
                    "task_id": task_id,
                    "records": [],
                }
            grouped[key]["records"].append(rec)

    rows: list[dict[str, Any]] = []
    record_columns: set[str] = set()
    for (_, _, _, _), bundle in grouped.items():
        records: list[dict[str, Any]] = bundle["records"]
        best = choose_best_record(records)
        participant = bundle["participant"]

        phase_list = sorted({str(r.get("phase")) for r in records if r.get("phase") is not None})

        row: dict[str, Any] = {
            "participant_id": best.get("participantId") or participant.get("participantId"),
            "study_id": participant.get("studyId"),
            "session_id": participant.get("sessionId"),
            "sona_id": participant.get("sonaId"),
            "task_id": bundle["task_id"],
            "variant_id": best.get("variantId") or bundle["selection"].get("variantId"),
            "block_index": get_any(best, "blockIndex", "block_index", "blockId", "block_id", "block"),
            "trial_index": get_any(
                best, "trialIndex", "trial_index", "trialId", "trial_id", "index"
            ),
            "phase_count": len(phase_list),
            "phases": "|".join(phase_list),
        }

        all_keys = set().union(*(r.keys() for r in records))
        for key in sorted(all_keys):
            record_columns.add(key)
            row[key] = first_non_null(records, key)
        rows.append(row)

    rows.sort(
        key=lambda r: (
            str(r.get("participant_id") or ""),
            str(r.get("block_index") if r.get("block_index") is not None else ""),
            str(r.get("trial_index") if r.get("trial_index") is not None else ""),
        )
    )
    return rows, sorted(record_columns)


def write_csv(rows: list[dict[str, Any]], output_path: Path, record_columns: list[str]) -> None:
    base_fieldnames = [
        "participant_id",
        "study_id",
        "session_id",
        "sona_id",
        "task_id",
        "variant_id",
        "block_index",
        "trial_index",
        "phase_count",
        "phases",
    ]
    fieldnames = base_fieldnames + [c for c in record_columns if c not in base_fieldnames]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert JATOS-style JSON/NDJSON exports to one-row-per-trial CSV."
    )
    parser.add_argument("input", type=Path, help="Input JSON/NDJSON file")
    parser.add_argument("output", type=Path, nargs="?", help="Output CSV path")
    args = parser.parse_args()

    output = args.output or args.input.with_suffix(".csv")
    payloads = load_payloads(args.input)
    rows, record_columns = to_trial_rows(payloads)
    write_csv(rows, output, record_columns)
    print(f"Wrote {len(rows)} rows to {output}")


if __name__ == "__main__":
    main()
