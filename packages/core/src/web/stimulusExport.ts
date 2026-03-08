import type { TaskAdapterContext, JSONObject } from "../api/types";
import { recordsToCsv } from "../infrastructure/data";
import { finalizeTaskRun } from "./lifecycle";
import { renderCenteredNotice } from "./ui";

export type StimulusExportRow = Record<string, string | number | boolean | null>;

export function isStimulusExportOnly(config: JSONObject): boolean {
  const task = config.task;
  if (!task || typeof task !== "object" || Array.isArray(task)) return false;
  return (task as Record<string, unknown>).exportStimuliOnly === true;
}

export async function exportStimulusRows(args: {
  context: TaskAdapterContext;
  rows: StimulusExportRow[];
  title?: string;
  message?: string;
  suffix?: string;
}): Promise<{ exported: true; rows: number }> {
  const { context, rows } = args;
  await finalizeTaskRun({
    coreConfig: context.coreConfig,
    selection: context.selection,
    payload: { selection: context.selection, records: rows, exportOnly: true, rows: rows.length },
    csv: { contents: recordsToCsv(rows), suffix: args.suffix ?? "stimulus_list" },
    completionStatus: "complete",
  });

  context.container.innerHTML = renderCenteredNotice({
    title: args.title ?? "Stimulus List Exported",
    message: args.message ?? `Exported ${rows.length} planned trials. No task run was executed.`,
  });
  return { exported: true, rows: rows.length };
}
