export interface TrialExecutionEnvelopeArgs<TContext, TResult> {
    context: TContext;
    execute: (context: TContext) => Promise<TResult>;
    before?: (context: TContext) => Promise<void> | void;
    after?: (context: TContext, result: TResult) => Promise<void> | void;
    onError?: (context: TContext, error: unknown) => Promise<void> | void;
    finalize?: (context: TContext) => Promise<void> | void;
}
export declare function runTrialWithEnvelope<TContext, TResult>(args: TrialExecutionEnvelopeArgs<TContext, TResult>): Promise<TResult>;
