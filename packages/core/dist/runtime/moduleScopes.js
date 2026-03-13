import { DrtController } from "../engines/drt";
import { OnlineParameterTransformRunner } from "../engines/parameterTransforms";
import { hashSeed } from "../infrastructure/random";
const sessionTransformRunners = new Map();
export function startDrtModuleScope(args) {
    if (!args.drtConfig.enabled)
        return;
    const sessionTransformRunnerKey = args.drtConfig.transformPersistence === "session" && Array.isArray(args.drtConfig.parameterTransforms)
        ? [
            args.participantId,
            args.sessionId,
            args.variantId,
            args.taskSeedKey,
            JSON.stringify(args.drtConfig.parameterTransforms),
        ].join("::")
        : null;
    const sessionTransformRunner = sessionTransformRunnerKey
        ? sessionTransformRunners.get(sessionTransformRunnerKey) ??
            (() => {
                const created = new OnlineParameterTransformRunner(args.drtConfig.parameterTransforms ?? []);
                sessionTransformRunners.set(sessionTransformRunnerKey, created);
                return created;
            })()
        : null;
    args.runner.start({
        module: DrtController.asTaskModule({
            ...args.drtConfig,
            ...(args.onControllerCreated ? { onControllerCreated: args.onControllerCreated } : {}),
            ...(sessionTransformRunner ? { transformRunner: sessionTransformRunner } : {}),
            seed: hashSeed(args.participantId, args.sessionId, args.variantId, args.taskSeedKey, args.seedSuffix ?? `B${args.blockIndex}${args.trialIndex !== null ? `T${args.trialIndex}` : ""}`),
        }),
        address: { scope: args.scope, blockIndex: args.blockIndex, trialIndex: args.trialIndex },
        config: args.drtConfig,
        context: args.context,
    });
}
export function stopModuleScope(args) {
    return args.runner.stop({ scope: args.scope, blockIndex: args.blockIndex, trialIndex: args.trialIndex });
}
//# sourceMappingURL=moduleScopes.js.map