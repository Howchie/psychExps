import { DrtController } from "../engines/drt";
import { hashSeed } from "../infrastructure/random";
export function startDrtModuleScope(args) {
    if (!args.drtConfig.enabled)
        return;
    args.runner.start({
        module: DrtController.asTaskModule({
            ...args.drtConfig,
            ...(args.onControllerCreated ? { onControllerCreated: args.onControllerCreated } : {}),
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