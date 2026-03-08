import type { SelectionContext } from "../api/types";
export declare function downloadJson(data: unknown, filePrefix: string, selection: SelectionContext): void;
export declare function downloadCsv(csv: string, filePrefix: string, selection: SelectionContext, suffix?: string): void;
export declare function csvCell(value: unknown): string;
export declare function recordsToCsv<T extends object>(records: T[]): string;
export declare function inferCsvFromPayload(payload: unknown): string | null;
