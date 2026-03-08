export function downloadJson(data, filePrefix, selection) {
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
export function downloadCsv(csv, filePrefix, selection, suffix = "data") {
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
export function csvCell(value) {
    const raw = String(value ?? "");
    if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
        return `"${raw.replaceAll("\"", "\"\"")}"`;
    }
    return raw;
}
export function recordsToCsv(records) {
    if (records.length === 0)
        return "";
    const columns = Object.keys(records[0]);
    const header = columns.join(",");
    const rows = records.map((record) => columns.map((column) => csvCell(record[String(column)])).join(","));
    return [header, ...rows].join("\n");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asRecordArray(value) {
    if (!Array.isArray(value))
        return null;
    if (!value.every((entry) => isRecord(entry)))
        return null;
    return value;
}
export function inferCsvFromPayload(payload) {
    const directRows = asRecordArray(payload);
    if (directRows)
        return recordsToCsv(directRows);
    if (!isRecord(payload))
        return null;
    const preferredKeys = ["records", "trials", "rows", "results", "data"];
    for (const key of preferredKeys) {
        const rows = asRecordArray(payload[key]);
        if (rows)
            return recordsToCsv(rows);
    }
    for (const value of Object.values(payload)) {
        const rows = asRecordArray(value);
        if (rows)
            return recordsToCsv(rows);
    }
    return recordsToCsv([payload]);
}
//# sourceMappingURL=data.js.map