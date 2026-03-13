import { recordsToCsv } from "../infrastructure/data";
import { finalizeTaskRun } from "./lifecycle";
import { renderCenteredNotice } from "./ui";
export function isStimulusExportOnly(config) {
    const task = config.task;
    if (!task || typeof task !== "object" || Array.isArray(task))
        return false;
    return task.exportStimuliOnly === true;
}
export async function exportStimulusRows(args) {
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
//# sourceMappingURL=stimulusExport.js.map