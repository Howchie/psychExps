import type { TaskAdapterContext } from "../api/types";
import { exportStimulusRows, isStimulusExportOnly } from "../web/stimulusExport";

export interface MaybeExportStimulusRowsArgs {
  context: TaskAdapterContext;
  suffix: string;
  rows: Array<Record<string, string | number | boolean | null>>;
}

export async function maybeExportStimulusRows(args: MaybeExportStimulusRowsArgs): Promise<unknown | null> {
  if (!isStimulusExportOnly(args.context.taskConfig)) return null;
  return exportStimulusRows({
    context: args.context,
    rows: args.rows,
    suffix: args.suffix,
  });
}
