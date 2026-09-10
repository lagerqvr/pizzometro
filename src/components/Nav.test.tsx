import { describe, expect, it } from "vitest";
import { activeTab, keyboardInset } from "./Nav";

describe("activeTab", () => {
  it("keeps the log lit while a single rating is open", () => {
    expect(activeTab("/entry")).toBe("/");
    expect(activeTab("/")).toBe("/");
  });

  it("lights the tab that owns the screen", () => {
    expect(activeTab("/leaderboard")).toBe("/leaderboard");
    expect(activeTab("/settings")).toBe("/settings");
  });

  it("lights nothing on a screen outside the tabs", () => {
    expect(activeTab("/join")).toBeNull();
    expect(activeTab("/new")).toBeNull();
  });
});

describe("keyboardInset", () => {
  it("is nothing when no keyboard is up", () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
  });

  it("is the height the keyboard takes from the visible area", () => {
    // iOS: the layout viewport stays 844 while the visible one shrinks.
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
  });

  it("counts a page that has been scrolled up to reveal a field", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 100 })).toBe(236);
  });

  it("never pulls the bar upwards", () => {
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0);
  });

  it("does nothing where the browser cannot say", () => {
    expect(keyboardInset(844, null)).toBe(0);
    expect(keyboardInset(844, undefined)).toBe(0);
  });
});
