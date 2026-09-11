import { describe, expect, it } from "vitest";
import { detailFor } from "./route";

/**
 * The map has to work for two pizzerias on one street and for a trip that
 * wandered across a region, and those want completely different answers.
 */
describe("detailFor", () => {
  it("draws the street plan over a few blocks", () => {
    expect(detailFor(0.01).roads).toContain("residential");
    expect(detailFor(0.01).roads).toContain("pedestrian");
  });

  it("drops the lanes once the view covers a city", () => {
    const city = detailFor(0.3);
    expect(city.roads).not.toContain("residential");
    expect(city.roads).toContain("tertiary");
  });

  it("keeps only the roads that describe a region", () => {
    expect(detailFor(1.5).roads).toBe("motorway|trunk|primary");
    expect(detailFor(8).roads).toBe("motorway|trunk");
  });

  it("never asks for more than a phone can draw", () => {
    for (const span of [0.005, 0.06, 0.4, 2, 11]) {
      expect(detailFor(span).limit).toBeLessThanOrEqual(900);
      expect(detailFor(span).limit).toBeGreaterThan(0);
    }
  });

  it("asks for less as the view grows, never more", () => {
    const spans = [0.01, 0.1, 1, 5];
    const counts = spans.map((s) => detailFor(s).roads.split("|").length);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });
});
