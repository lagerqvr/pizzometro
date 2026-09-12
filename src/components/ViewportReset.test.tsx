import { describe, expect, it } from "vitest";
import { stillTyping } from "./ViewportReset";

describe("stillTyping", () => {
  it("holds off while a text field has the keyboard up", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    expect(stillTyping(input)).toBe(true);
    expect(stillTyping(textarea)).toBe(true);
  });

  it("puts the screen back once nothing is focused", () => {
    expect(stillTyping(null)).toBe(false);
    expect(stillTyping(document.createElement("body"))).toBe(false);
  });

  it("does not treat a tapped button as typing", () => {
    // Saving a rating focuses the button, and the keyboard is on its way out.
    expect(stillTyping(document.createElement("button"))).toBe(false);
  });

  it("counts an editable element", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    // jsdom does not implement isContentEditable, so it is set directly.
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(stillTyping(div)).toBe(true);
  });
});
