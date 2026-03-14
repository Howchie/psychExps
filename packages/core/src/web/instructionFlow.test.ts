import { describe, expect, it } from "vitest";
import { createInstructionRenderer, renderSimpleInstructionScreenHtml } from "./instructionFlow";

describe("renderSimpleInstructionScreenHtml", () => {
  it("appends intro html only on intro sections", () => {
    const introHtml = renderSimpleInstructionScreenHtml(
      {
        title: "Task",
        pageText: "Welcome",
        section: "intro",
        pageIndex: 0,
        blockLabel: "Block 1",
      },
      { introAppendHtml: "<p>Extra intro</p>" },
    );
    const blockHtml = renderSimpleInstructionScreenHtml(
      {
        title: "Task",
        pageText: "Block text",
        section: "block_intro",
        pageIndex: 0,
        blockLabel: "Block 1",
      },
      { introAppendHtml: "<p>Extra intro</p>" },
    );
    expect(introHtml).toContain("Extra intro");
    expect(blockHtml).not.toContain("Extra intro");
  });

  it("can suppress block label rendering", () => {
    const html = renderSimpleInstructionScreenHtml(
      {
        title: "Task",
        pageText: "Block text",
        section: "block_intro",
        pageIndex: 0,
        blockLabel: "Block 1",
      },
      { showBlockLabel: false },
    );
    expect(html).not.toContain("Block 1");
  });
});

describe("createInstructionRenderer", () => {
  it("renders summary sections as title/body cards when configured", () => {
    const render = createInstructionRenderer({
      summarySectionPattern: /^blockEnd(Before|After)Post_/,
      showBlockLabel: true,
    });
    const html = render({
      section: "blockEndBeforePost_0",
      pageIndex: 0,
      pageText: "Summary Title\nLine A\nLine B",
      blockLabel: "Block 2",
    });
    expect(html).toContain("<h2>Summary Title</h2>");
    expect(html).toContain("Line A");
    expect(html).toContain("Block 2");
  });
});
