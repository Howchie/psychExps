import type { SelectionContext } from "../api/types";

export function downloadJson(data: unknown, filePrefix: string, selection: SelectionContext): void {
  const text = JSON.stringify(data, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${filePrefix}_${selection.taskId}_${selection.variantId}_${selection.participant.participantId}_${stamp}.json`;
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadCsv(csv: string, filePrefix: string, selection: SelectionContext, suffix = "data"): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${filePrefix}_${selection.taskId}_${selection.variantId}_${selection.participant.participantId}_${suffix}_${stamp}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replaceAll("\"", "\"\"")}"`;
  }
  return raw;
}

export function recordsToCsv<T extends object>(records: T[]): string {
  if (records.length === 0) return "";

  const columnSet = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record as Record<string, unknown>)) {
      columnSet.add(key);
    }
  }

  const columns = Array.from(columnSet);
  const header = columns.join(",");
  const rows = records.map((record) =>
    columns.map((column) => csvCell((record as Record<string, unknown>)[column])).join(","),
  );
  return [header, ...rows].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => isRecord(entry))) return null;
  return value as Record<string, unknown>[];
}

export function inferCsvFromPayload(payload: unknown): string | null {
  const directRows = asRecordArray(payload);
  if (directRows) return recordsToCsv(directRows);

  if (!isRecord(payload)) return null;

  const preferredKeys = ["records", "trials", "rows", "results", "data"];
  for (const key of preferredKeys) {
    const rows = asRecordArray(payload[key]);
    if (rows) return recordsToCsv(rows);
  }

  for (const value of Object.values(payload)) {
    const rows = asRecordArray(value);
    if (rows) return recordsToCsv(rows);
  }

  return recordsToCsv([payload]);
}
