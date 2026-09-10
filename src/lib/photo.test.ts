import { describe, expect, it } from "vitest";
import { PHOTO_MAX } from "./render";

/**
 * The two qualities are a trade between the archive and what has to travel
 * over roaming data, so the numbers themselves are worth pinning down.
 */
describe("photo quality", () => {
  it("keeps a phone's full frame at full quality", () => {
    // A 12-megapixel iPhone photo is 4032 along its longest side.
    expect(PHOTO_MAX.full).toBeGreaterThanOrEqual(4032);
  });

  it("still leaves the browsing size well above the picture it draws", () => {
    // The saved card is 1080px, so 1600 is never the limiting factor.
    expect(PHOTO_MAX.balanced).toBeGreaterThan(1080);
    expect(PHOTO_MAX.balanced).toBeLessThan(PHOTO_MAX.full);
  });
});
