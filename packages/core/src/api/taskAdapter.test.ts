/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { createTaskAdapter, LifecycleManager } from "./taskAdapter";
import type { SelectionContext, TaskAdapterContext } from "./types";

function makeSelection(): SelectionContext {
  return {
    platform: "local",
    taskId: "test",
    participant: {
      participantId: "p1",
      studyId: "study-1",
      sessionId: "s1",
    },
    source: {
      task: "default",
    },
  };
}

function makeRunContext(taskConfig: Record<string, unknown> = {}): Omit<TaskAdapterContext, "resolver" | "rawTaskConfig" | "moduleRunner"> {
  return {
    container: document.createElement("div"),
    selection: makeSelection(),
    coreConfig: {
      selection: {
        taskId: "test",
      },
    },
    taskConfig,
  };
}

describe("LifecycleManager", () => {
  it("runs initialize -> execute -> terminate", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);
    const run = vi.fn().mockResolvedValue({ result: "success" });
    const terminate = vi.fn().mockResolvedValue(undefined);

    const adapter = createTaskAdapter({
      manifest: { taskId: "test", label: "Test" },
      initialize,
      run,
      terminate,
    });

    const manager = new LifecycleManager(adapter);
    const result = await manager.run(makeRunContext());

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ result: "success" });
  });

  it("calls terminate even when execute fails", async () => {
    const terminate = vi.fn().mockResolvedValue(undefined);

    const adapter = createTaskAdapter({
      manifest: { taskId: "test", label: "Test" },
      run: vi.fn().mockRejectedValue(new Error("execution failed")),
      terminate,
    });

    const manager = new LifecycleManager(adapter);

    await expect(manager.run(makeRunContext())).rejects.toThrow("execution failed");
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("resolves participant-scope variables before initialize", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);

    const adapter = createTaskAdapter({
      manifest: { taskId: "test", label: "Test" },
      initialize,
      run: vi.fn().mockResolvedValue("ok"),
    });

    const manager = new LifecycleManager(adapter);

    await manager.run(
      makeRunContext({
        variables: {
          myVar: "ResolvedValue",
        },
        field: "$var.myVar",
      }),
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        taskConfig: expect.objectContaining({
          field: "ResolvedValue",
        }),
      }),
    );
  });

  it("supports interpolated variable expressions", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);

    const adapter = createTaskAdapter({
      manifest: { taskId: "test", label: "Test" },
      initialize,
      run: vi.fn().mockResolvedValue("ok"),
    });

    const manager = new LifecycleManager(adapter);

    await manager.run(
      makeRunContext({
        variables: {
          pmCategory: "animals",
        },
        field: "${var.pmCategory}_controls",
      }),
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        taskConfig: expect.objectContaining({
          field: "animals_controls",
        }),
      }),
    );
  });

  it("merges task.variables and top-level variables", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);

    const adapter = createTaskAdapter({
      manifest: { taskId: "test", label: "Test" },
      initialize,
      run: vi.fn().mockResolvedValue("ok"),
    });

    const manager = new LifecycleManager(adapter);

    await manager.run(
      makeRunContext({
        task: {
          variables: { a: "A" },
        },
        variables: { b: "B" },
        f1: "$var.a",
        f2: "$var.b",
      }),
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        taskConfig: expect.objectContaining({
          f1: "A",
          f2: "B",
        }),
      }),
    );
  });

  it("does not resolve block-scoped variables at high level", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);

    const adapter = createTaskAdapter({
      manifest: { taskId: "test", label: "Test" },
      initialize,
      run: vi.fn().mockResolvedValue("ok"),
    });

    const manager = new LifecycleManager(adapter);

    await manager.run(
      makeRunContext({
        variables: {
          blockVar: { scope: "block", value: "BlockValue" },
          partVar: { scope: "participant", value: "PartValue" },
        },
        f1: "$var.blockVar",
        f2: "$var.partVar",
      }),
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        taskConfig: expect.objectContaining({
          f1: "$var.blockVar",
          f2: "PartValue",
        }),
      }),
    );
  });

  it("supports direct run(context) adapters without wrapper classes", async () => {
    const seen: string[] = [];

    const adapter = createTaskAdapter({
      manifest: { taskId: "test", label: "Test" },
      initialize: (ctx) => {
        seen.push(`init:${ctx.selection.configPath ?? ""}`);
      },
      run: async (ctx) => {
        seen.push(`run:${ctx.selection.participant.participantId}`);
        return "done";
      },
      terminate: (ctx) => {
        seen.push(`term:${ctx.selection.taskId}`);
      },
    });

    const result = await new LifecycleManager(adapter).run(makeRunContext());

    expect(result).toBe("done");
    expect(seen).toEqual(["init:", "run:p1", "term:test"]);
  });
});

describe("createTaskAdapter", () => {
  it("throws if execute is called before initialize", async () => {
    const adapter = createTaskAdapter({
      manifest: { taskId: "uninitialized", label: "Uninitialized" },
      run: vi.fn().mockResolvedValue("ok"),
    });

    await expect(adapter.execute?.()).rejects.toThrow("was not initialized");
  });
});
