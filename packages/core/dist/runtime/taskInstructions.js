import { asObject, asString } from "../utils/coerce";
import { resolveInstructionFlowPages } from "../web/instructionFlow";
export function buildTaskInstructionConfig(args) {
    const instructionsRaw = asObject(args.instructions) ?? {};
    const slots = resolveInstructionFlowPages({
        title: args.title ?? null,
        instructions: instructionsRaw,
        defaults: args.defaults,
    });
    return {
        introPages: slots.intro,
        preBlockPages: slots.preBlock,
        postBlockPages: slots.postBlock,
        endPages: slots.end,
        blockIntroTemplate: asString(instructionsRaw.blockIntroTemplate) ??
            args.blockIntroTemplateDefault ??
            "Press continue when ready.",
        showBlockLabel: typeof instructionsRaw.showBlockLabel === "boolean"
            ? instructionsRaw.showBlockLabel
            : (args.showBlockLabelDefault ?? true),
        preBlockBeforeBlockIntro: typeof instructionsRaw.preBlockBeforeBlockIntro === "boolean"
            ? instructionsRaw.preBlockBeforeBlockIntro
            : (args.preBlockBeforeBlockIntroDefault ?? false),
        blockSummary: instructionsRaw.blockSummary,
    };
}
export function applyResolvedTaskInstructionSurfaces(taskConfig, surfaces) {
    const taskConfigRecord = taskConfig;
    const existingInstructions = asObject(taskConfigRecord.instructions) ?? {};
    const merged = { ...existingInstructions };
    if (surfaces.introPages !== undefined)
        merged.introPages = surfaces.introPages;
    if (surfaces.preBlockPages !== undefined)
        merged.preBlockPages = surfaces.preBlockPages;
    if (surfaces.postBlockPages !== undefined)
        merged.postBlockPages = surfaces.postBlockPages;
    if (surfaces.endPages !== undefined)
        merged.endPages = surfaces.endPages;
    if (surfaces.blockIntroTemplate !== undefined)
        merged.blockIntroTemplate = surfaces.blockIntroTemplate;
    if (typeof surfaces.showBlockLabel === "boolean")
        merged.showBlockLabel = surfaces.showBlockLabel;
    if (typeof surfaces.preBlockBeforeIntro === "boolean") {
        merged.preBlockBeforeBlockIntro = surfaces.preBlockBeforeIntro;
    }
    if (surfaces.blockSummary !== undefined)
        merged.blockSummary = surfaces.blockSummary;
    taskConfigRecord.instructions = merged;
}
export function applyTaskInstructionConfig(taskConfig, instructions) {
    applyResolvedTaskInstructionSurfaces(taskConfig, {
        introPages: instructions.introPages,
        preBlockPages: instructions.preBlockPages,
        postBlockPages: instructions.postBlockPages,
        endPages: instructions.endPages,
        blockIntroTemplate: instructions.blockIntroTemplate,
        showBlockLabel: instructions.showBlockLabel,
        preBlockBeforeIntro: instructions.preBlockBeforeBlockIntro,
        blockSummary: instructions.blockSummary,
    });
}
//# sourceMappingURL=taskInstructions.js.map