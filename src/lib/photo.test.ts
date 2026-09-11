import { describe, expect, it } from "vitest";
import { CARD_MAX_FULL, PHOTO_MAX } from "./render";
import { CARD_SIZE, cardSize } from "./compose";

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

/**
 * The photo is kept whole, but the picture has to be composited and encoded
 * on the phone every time one is saved — so the two have different ceilings.
 */
describe("the saved picture at full quality", () => {
  const photo = { width: 1737, height: 3088 };

  it("is bigger than the social size, without being the whole photo", () => {
    const card = cardSize(photo, false, CARD_MAX_FULL);
    expect(Math.max(card.width, card.height)).toBe(CARD_MAX_FULL);
    expect(CARD_MAX_FULL).toBeGreaterThan(CARD_SIZE);
    expect(CARD_MAX_FULL).toBeLessThan(PHOTO_MAX.full);
  });

  it("costs a fraction of the work a full-size canvas would", () => {
    const capped = cardSize(photo, false, CARD_MAX_FULL);
    const whole = cardSize(photo, false, PHOTO_MAX.full);
    const pixels = (c: { width: number; height: number }) => c.width * c.height;
    expect(pixels(capped)).toBeLessThan(pixels(whole) / 2);
  });

  it("still never invents pixels on a small photo", () => {
    expect(cardSize({ width: 900, height: 1200 }, false, CARD_MAX_FULL)).toEqual({
      width: 900,
      height: 1200,
    });
  });
});
