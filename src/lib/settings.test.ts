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

  it("defaults to the built-in viewfinder", () => {
    expect(parseSettings("{}").systemCamera).toBe(false);
    expect(parseSettings('{"systemCamera":"yes"}').systemCamera).toBe(false);
  });

  it("keeps full-quality photos unless told otherwise", () => {
    expect(parseSettings("{}").photoQuality).toBe("full");
    expect(parseSettings('{"photoQuality":"balanced"}').photoQuality).toBe(
      "balanced",
    );
    // Anything else is not a quality.
    expect(parseSettings('{"photoQuality":"tiny"}').photoQuality).toBe("full");
  });

  it("defaults to a mirrored camera and square pictures", () => {
    expect(parseSettings("{}").mirrorCamera).toBe(true);
    expect(parseSettings("{}").squareCrop).toBe(true);
  });

  it("keeps those two once they are turned off", () => {
    const parsed = parseSettings('{"mirrorCamera":false,"squareCrop":false}');
    expect(parsed.mirrorCamera).toBe(false);
    expect(parsed.squareCrop).toBe(false);
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
