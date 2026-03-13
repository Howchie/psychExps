export async function runTrialWithEnvelope(args) {
    await args.before?.(args.context);
    try {
        const result = await args.execute(args.context);
        await args.after?.(args.context, result);
        return result;
    }
    catch (error) {
        await args.onError?.(args.context, error);
        throw error;
    }
    finally {
        await args.finalize?.(args.context);
    }
}
//# sourceMappingURL=trialExecution.js.map