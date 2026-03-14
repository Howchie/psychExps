import { exportStimulusRows, isStimulusExportOnly } from "../web/stimulusExport";
export async function maybeExportStimulusRows(args) {
    if (!isStimulusExportOnly(args.context.taskConfig))
        return null;
    return exportStimulusRows({
        context: args.context,
        rows: args.rows,
        suffix: args.suffix,
    });
}
//# sourceMappingURL=stimulusExport.js.map