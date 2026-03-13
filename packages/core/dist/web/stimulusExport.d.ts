import type { TaskAdapterContext, JSONObject } from "../api/types";
export type StimulusExportRow = Record<string, string | number | boolean | null>;
export declare function isStimulusExportOnly(config: JSONObject): boolean;
export declare function exportStimulusRows(args: {
    context: TaskAdapterContext;
    rows: StimulusExportRow[];
    title?: string;
    message?: string;
    suffix?: string;
}): Promise<{
    exported: true;
    rows: number;
}>;
