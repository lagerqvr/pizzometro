import { describe, expect, it } from "vitest";
import { loadSettings, parseSettings, saveSettings } from "./settings";
import { DEFAULT_SETTINGS } from "./types";

describe("parseSettings", () => {
  it("falls back to the defaults with nothing stored", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to the defaults on corrupt JSON", () => {
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects an unknown corner", () => {
    expect(parseSettings('{"stampCorner":"middle"}').stampCorner).toBe(
      DEFAULT_SETTINGS.stampCorner,
    );
  });

  it("keeps valid values", () => {
    const parsed = parseSettings(
      '{"stampCorner":"br","cameraGuides":false,"systemCamera":true}',
    );
    expect(parsed.stampCorner).toBe("br");
    expect(parsed.cameraGuides).toBe(false);
    expect(parsed.systemCamera).toBe(true);
  });

  it("defaults to the phone's own camera app", () => {
    // iOS forgets camera permission for an installed web app every launch,
    // and the camera app needs none.
    expect(parseSettings("{}").systemCamera).toBe(true);
    expect(parseSettings('{"systemCamera":false}').systemCamera).toBe(false);
    expect(parseSettings('{"systemCamera":"yes"}').systemCamera).toBe(true);
  });

  it("keeps full-quality photos unless told otherwise", () => {
    expect(parseSettings("{}").photoQuality).toBe("full");
    expect(parseSettings('{"photoQuality":"balanced"}').photoQuality).toBe(
      "balanced",
    );
    // Anything else is not a quality.
    expect(parseSettings('{"photoQuality":"tiny"}').photoQuality).toBe("full");
  });

  it("defaults to a mirrored picture, kept in the photo's own shape", () => {
    expect(parseSettings("{}").mirrorCamera).toBe(true);
    expect(parseSettings("{}").squareCrop).toBe(false);
  });

  it("shows the map unless it is turned off", () => {
    expect(parseSettings("{}").showMap).toBe(true);
    expect(parseSettings('{"showMap":false}').showMap).toBe(false);
    expect(parseSettings('{"showMap":"no"}').showMap).toBe(true);
  });

  it("starts in the bottom-left corner, in small type", () => {
    expect(parseSettings("{}").stampCorner).toBe("bl");
    expect(parseSettings("{}").stampSize).toBe("s");
  });

  it("keeps those two once they are changed", () => {
    const parsed = parseSettings('{"mirrorCamera":false,"squareCrop":true}');
    expect(parsed.mirrorCamera).toBe(false);
    expect(parsed.squareCrop).toBe(true);
  });

  it("fills in stamp fields missing from an older stored shape", () => {
    const parsed = parseSettings('{"stamp":{"rating":false,"date":true}}');
    expect(parsed.stamp.rating).toBe(false);
    expect(parsed.stamp.date).toBe(true);
    // Not stored at all, so it falls back to the default.
    expect(parsed.stamp.name).toBe(true);
    expect(parsed.stamp.place).toBe(true);
  });
});

describe("saveSettings / loadSettings", () => {
  it("round-trips through localStorage", () => {
    saveSettings({ ...DEFAULT_SETTINGS, stampCorner: "bl", cameraGuides: false });
    const loaded = loadSettings();
    expect(loaded.stampCorner).toBe("bl");
    expect(loaded.cameraGuides).toBe(false);
  });
});
