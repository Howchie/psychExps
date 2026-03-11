/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { waitForContinue, waitForContinueChoice } from "./ui";

describe("waitForContinue", () => {
  it("clears the continue screen after button click", async () => {
    const container = document.createElement("div");
    const waitPromise = waitForContinue(container, "<p>Ready</p>", { buttonId: "continue-btn" });

    const button = container.querySelector("#continue-btn");
    expect(button).toBeInstanceOf(HTMLButtonElement);
    (button as HTMLButtonElement).click();

    await waitPromise;
    expect(container.innerHTML).toBe("");
  });

  it("clears the continue screen after space key", async () => {
    const container = document.createElement("div");
    const waitPromise = waitForContinue(container, "<p>Ready</p>", { buttonId: "continue-btn" });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));

    await waitPromise;
    expect(container.innerHTML).toBe("");
  });
});

describe("waitForContinueChoice", () => {
  it("returns selected exit action and clears screen", async () => {
    const container = document.createElement("div");
    const waitPromise = waitForContinueChoice(container, "<p>Consent</p>", {
      buttons: [
        { id: "consent-yes", label: "I Consent", action: "continue" },
        { id: "consent-no", label: "Disagree", action: "exit" },
      ],
    });

    const button = container.querySelector("#consent-no");
    expect(button).toBeInstanceOf(HTMLButtonElement);
    (button as HTMLButtonElement).click();

    const selected = await waitPromise;
    expect(selected.action).toBe("exit");
    expect(container.innerHTML).toBe("");
  });
});
