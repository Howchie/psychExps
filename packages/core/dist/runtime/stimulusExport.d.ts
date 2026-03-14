import type { TaskAdapterContext } from "../api/types";
export interface MaybeExportStimulusRowsArgs {
    context: TaskAdapterContext;
    suffix: string;
    rows: Array<Record<string, string | number | boolean | null>>;
}
export declare function maybeExportStimulusRows(args: MaybeExportStimulusRowsArgs): Promise<unknown | null>;
