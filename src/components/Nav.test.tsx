import { describe, expect, it } from "vitest";
import { activeTab } from "./Nav";

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

