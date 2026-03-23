#!/usr/bin/env python3
"""Validate n-back/PM stimulus CSV constraints.

Usage:
  python scripts/validate_stimuli_rules.py temp/test_stimuli.csv
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path
from typing import Iterable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate n-back and PM rules for a stimuli CSV.")
    parser.add_argument("csv_path", type=Path, help="Path to stimuli CSV file")
    parser.add_argument(
        "--max-print",
        type=int,
        default=50,
        help="Maximum number of violations to print (default: 50)",
    )
    parser.add_argument(
        "--annotated-out",
        type=Path,
        default=None,
        help="Path for annotated CSV output (default: <input>.validated.csv)",
    )
    return parser.parse_args()


def parse_lure_distance(code: str | None, trial_type: str | None) -> int | None:
    for value in (code, trial_type):
        if not value:
            continue
        m = re.fullmatch(r"lure_(\d+)", value, flags=re.IGNORECASE)
        if m:
            return int(m.group(1))
        m = re.fullmatch(r"L(\d+)", value, flags=re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None


def is_pm_row(code: str | None, trial_type: str | None) -> bool:
    return (code or "").strip().upper() == "PM" or (trial_type or "").strip().upper() == "PM"


def is_filler_row(code: str | None, trial_type: str | None) -> bool:
    return (code or "").strip().upper() == "F" or (trial_type or "").strip().upper() == "F"


def is_nback_row(code: str | None, trial_type: str | None) -> bool:
    return (code or "").strip().upper() == "N" or (trial_type or "").strip().upper() == "N"


def contains_control(category: str | None) -> bool:
    return "control" in (category or "").strip().lower()


def parse_boolish(value: str | None) -> bool | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"1", "true", "t", "yes", "y"}:
        return True
    if text in {"0", "false", "f", "no", "n", ""}:
        return False
    return None


def require_headers(fieldnames: Iterable[str] | None, required: list[str]) -> None:
    if fieldnames is None:
        raise ValueError("CSV has no header row")
    missing = [h for h in required if h not in fieldnames]
    if missing:
        raise ValueError(f"Missing required column(s): {', '.join(missing)}")


def main() -> int:
    args = parse_args()

    if not args.csv_path.exists():
        print(f"ERROR: file not found: {args.csv_path}")
        return 2

    with args.csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        try:
            require_headers(reader.fieldnames, ["item"])
        except ValueError as e:
            print(f"ERROR: {e}")
            return 2
        if reader.fieldnames and "trial_code" not in reader.fieldnames and "trial_type" not in reader.fieldnames:
            print("ERROR: expected at least one trial column: 'trial_code' or 'trial_type'")
            return 2

        category_col = "category" if reader.fieldnames and "category" in reader.fieldnames else "source_category"
        if reader.fieldnames and category_col not in reader.fieldnames:
            print("ERROR: expected a category column named 'category' or 'source_category'")
            return 2

        rows = list(reader)

    errors: list[str] = []
    row_errors: list[list[str]] = [[] for _ in rows]

    has_used_as_source = bool(reader.fieldnames and "used_as_source" in reader.fieldnames)

    # Only control F words explicitly marked as NOT used_as_source must be unique in the full file.
    control_f_non_source_words = {
        (row.get("item") or "")
        for row in rows
        if is_filler_row(row.get("trial_code"), row.get("trial_type"))
        and contains_control(row.get(category_col))
        and has_used_as_source
        and parse_boolish(row.get("used_as_source")) is False
    }

    item_occurrence_count: dict[str, int] = {}
    for row in rows:
        token = row.get("item") or ""
        item_occurrence_count[token] = item_occurrence_count.get(token, 0) + 1

    for i, row in enumerate(rows):
        row_num = i + 2  # account for 1-based lines and header row
        item = (row.get("item") or "")
        trial_code = row.get("trial_code")
        trial_type = row.get("trial_type")
        category = row.get(category_col)

        if is_nback_row(trial_code, trial_type):
            if i < 2:
                msg = f"row {row_num}: N trial does not have two previous rows"
                errors.append(msg)
                row_errors[i].append("N trial does not have two previous rows")
            else:
                back_item = rows[i - 2].get("item") or ""
                if item != back_item:
                    msg = f"row {row_num}: N item '{item}' must match item two rows back '{back_item}'"
                    errors.append(msg)
                    row_errors[i].append(f"N mismatch: expected '{back_item}', found '{item}'")

        lure_distance = parse_lure_distance(trial_code, trial_type)
        if lure_distance is not None:
            if i < lure_distance:
                msg = f"row {row_num}: lure_{lure_distance} trial lacks {lure_distance} previous rows"
                errors.append(msg)
                row_errors[i].append(f"lure_{lure_distance} missing prior {lure_distance} row(s)")
            else:
                back_item = rows[i - lure_distance].get("item") or ""
                if item != back_item:
                    msg = (
                        f"row {row_num}: lure item '{item}' must match item "
                        f"{lure_distance} rows back '{back_item}'"
                    )
                    errors.append(msg)
                    row_errors[i].append(
                        f"lure_{lure_distance} mismatch: expected '{back_item}', found '{item}'"
                    )

        if is_pm_row(trial_code, trial_type) and contains_control(category):
            msg = f"row {row_num}: PM item '{item}' has control category '{category}'"
            errors.append(msg)
            row_errors[i].append(f"PM category invalid: '{category}'")

        if item in control_f_non_source_words and item_occurrence_count.get(item, 0) > 1:
            msg = (
                f"row {row_num}: non-source control F word '{item}' appears "
                f"{item_occurrence_count[item]} times in file"
            )
            errors.append(msg)
            row_errors[i].append(
                f"non-source control F word reused in file: '{item}' (count={item_occurrence_count[item]})"
            )

    out_path = args.annotated_out
    if out_path is None:
        out_path = args.csv_path.with_suffix(".validated.csv")
    fieldnames = list(rows[0].keys()) if rows else []
    fieldnames.extend(["rule_status", "rule_reasons"])
    with out_path.open("w", newline="", encoding="utf-8") as out_f:
        writer = csv.DictWriter(out_f, fieldnames=fieldnames)
        writer.writeheader()
        for i, row in enumerate(rows):
            reasons = row_errors[i]
            row_copy = dict(row)
            row_copy["rule_status"] = "FAIL" if reasons else "PASS"
            row_copy["rule_reasons"] = " | ".join(reasons)
            writer.writerow(row_copy)

    if errors:
        print(f"FAIL: {len(errors)} rule violation(s) in {args.csv_path}")
        print(f"Annotated output written to {out_path}")
        if not has_used_as_source:
            print("NOTE: 'used_as_source' column not present; non-source control-word uniqueness rule was skipped.")
        shown = 0
        for msg in errors:
            if shown >= args.max_print:
                break
            print(f" - {msg}")
            shown += 1
        if len(errors) > shown:
            print(f" - ... and {len(errors) - shown} more violation(s)")
        return 1

    print(f"PASS: all rules satisfied for {args.csv_path}")
    print(f"Annotated output written to {out_path}")
    if not has_used_as_source:
        print("NOTE: 'used_as_source' column not present; non-source control-word uniqueness rule was skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
