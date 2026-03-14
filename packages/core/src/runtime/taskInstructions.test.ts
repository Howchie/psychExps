import { describe, expect, it } from "vitest";
import { applyResolvedTaskInstructionSurfaces, applyTaskInstructionConfig, buildTaskInstructionConfig } from "./taskInstructions";

describe("applyResolvedTaskInstructionSurfaces", () => {
  it("merges normalized instruction surfaces onto taskConfig.instructions", () => {
    const taskConfig: Record<string, unknown> = {
      instructions: {
        introPages: ["Old intro"],
        insertions: [{ at: "task_intro_before", pages: ["Consent"] }],
      },
    };

    applyResolvedTaskInstructionSurfaces(taskConfig, {
      introPages: ["Intro 1"],
      preBlockPages: ["Pre 1"],
      postBlockPages: ["Post 1"],
      endPages: ["End 1"],
      blockIntroTemplate: "Block {blockIndex}",
      showBlockLabel: false,
      preBlockBeforeIntro: true,
    });

    expect(taskConfig.instructions).toEqual({
      introPages: ["Intro 1"],
      preBlockPages: ["Pre 1"],
      postBlockPages: ["Post 1"],
      endPages: ["End 1"],
      blockIntroTemplate: "Block {blockIndex}",
      showBlockLabel: false,
      preBlockBeforeBlockIntro: true,
      insertions: [{ at: "task_intro_before", pages: ["Consent"] }],
    });
  });
});

describe("buildTaskInstructionConfig", () => {
  it("builds standardized instructions with defaults and instruction overrides", () => {
    const config = buildTaskInstructionConfig({
      title: "Task",
      instructions: {
        introPages: ["Intro"],
        showBlockLabel: false,
      },
      defaults: {
        preBlock: ["Pre"],
        postBlock: ["Post"],
      },
      blockIntroTemplateDefault: "Block {nTrials}",
    });
    expect(config).toEqual({
      introPages: ["Intro"],
      preBlockPages: ["Pre"],
      postBlockPages: ["Post"],
      endPages: [],
      blockIntroTemplate: "Block {nTrials}",
      showBlockLabel: false,
      preBlockBeforeBlockIntro: false,
    });
  });
});

describe("applyTaskInstructionConfig", () => {
  it("applies standardized instruction config to taskConfig surfaces", () => {
    const taskConfig: Record<string, unknown> = {};
    applyTaskInstructionConfig(taskConfig, {
      introPages: ["I"],
      preBlockPages: ["P"],
      postBlockPages: ["Q"],
      endPages: ["E"],
      blockIntroTemplate: "T",
      showBlockLabel: true,
      preBlockBeforeBlockIntro: false,
    });
    expect(taskConfig.instructions).toEqual({
      introPages: ["I"],
      preBlockPages: ["P"],
      postBlockPages: ["Q"],
      endPages: ["E"],
      blockIntroTemplate: "T",
      showBlockLabel: true,
      preBlockBeforeBlockIntro: false,
    });
  });
});
