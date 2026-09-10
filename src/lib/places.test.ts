import { describe, expect, it } from "vitest";
import type { OverpassElement } from "./places";
import {
  distanceMeters,
  formatDistance,
  manualPlace,
  mergePlaces,
  parseNominatim,
  parseOverpass,
} from "./places";

const napoli = { lat: 40.8518, lon: 14.2681 };

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(napoli, napoli)).toBe(0);
  });

  it("matches a known short distance", () => {
    // ~111 m per 0.001° of latitude.
    const north = { lat: napoli.lat + 0.001, lon: napoli.lon };
    expect(distanceMeters(napoli, north)).toBeGreaterThan(105);
    expect(distanceMeters(napoli, north)).toBeLessThan(118);
  });

  it("is symmetric", () => {
    const other = { lat: 40.86, lon: 14.28 };
    expect(distanceMeters(napoli, other)).toBe(distanceMeters(other, napoli));
  });
});

describe("formatDistance", () => {
  it("uses metres below a kilometre and km above", () => {
    expect(formatDistance(240)).toBe("240 m");
    expect(formatDistance(1500)).toBe("1.5 km");
  });

  it("renders nothing when the distance is unknown", () => {
    expect(formatDistance(undefined)).toBe("");
  });
});

describe("parseOverpass", () => {
  const elements: OverpassElement[] = [
    {
      type: "node",
      id: 1,
      lat: napoli.lat + 0.001,
      lon: napoli.lon,
      tags: { name: "Sorbillo", "addr:street": "Via dei Tribunali", "addr:housenumber": "32" },
    },
    {
      type: "way",
      id: 2,
      center: { lat: napoli.lat + 0.01, lon: napoli.lon },
      tags: { name: "Di Matteo" },
    },
    { type: "node", id: 3, lat: napoli.lat, lon: napoli.lon, tags: {} },
  ];

  it("drops unnamed elements", () => {
    expect(parseOverpass(elements)).toHaveLength(2);
  });

  it("reads coordinates from a way's center", () => {
    const places = parseOverpass(elements, napoli);
    const way = places.find((place) => place.id === "osm:way/2");
    expect(way?.lat).toBeCloseTo(napoli.lat + 0.01);
  });

  it("builds a street address when both parts are tagged", () => {
    const [nearest] = parseOverpass(elements, napoli);
    expect(nearest.address).toBe("Via dei Tribunali 32");
  });

  it("sorts nearest first", () => {
    const places = parseOverpass(elements, napoli);
    expect(places[0].name).toBe("Sorbillo");
    expect(places[0].distance).toBeLessThan(places[1].distance!);
  });

  it("de-duplicates places sharing a name", () => {
    const duplicated = [...elements, { type: "node", id: 9, lat: 1, lon: 1, tags: { name: "Sorbillo" } }];
    expect(parseOverpass(duplicated).filter((p) => p.name === "Sorbillo")).toHaveLength(1);
  });

  it("survives an empty response", () => {
    expect(parseOverpass([])).toEqual([]);
  });
});

describe("parseNominatim", () => {
  it("keeps the venue name and a short address, dropping country noise", () => {
    const [place] = parseNominatim([
      {
        osm_type: "node",
        osm_id: 7,
        name: "Da Michele",
        display_name: "Da Michele, Via Cesare Sersale, Forcella, Napoli, Campania, Italia",
        lat: "40.8497",
        lon: "14.2632",
      },
    ]);
    expect(place.name).toBe("Da Michele");
    expect(place.address).toBe("Via Cesare Sersale, Forcella");
    expect(place.id).toBe("osm:node/7");
  });

  it("falls back to the first part of display_name when name is missing", () => {
    const [place] = parseNominatim([
      { place_id: 3, display_name: "Gino Sorbillo, Napoli, Italia" },
    ]);
    expect(place.name).toBe("Gino Sorbillo");
    expect(place.id).toBe("nominatim:3");
  });

  it("computes distance when the caller knows where it is", () => {
    const [place] = parseNominatim(
      [{ place_id: 1, display_name: "X, Napoli", lat: "40.8528", lon: "14.2681" }],
      napoli,
    );
    expect(place.distance).toBeGreaterThan(0);
  });

  it("skips results with no usable name", () => {
    expect(parseNominatim([{ place_id: 1, display_name: "" }])).toEqual([]);
  });
});

describe("manualPlace", () => {
  it("makes a stable id from typed text", () => {
    expect(manualPlace("  Sorbillo ")).toEqual({
      id: "manual:sorbillo",
      name: "Sorbillo",
    });
  });
});

describe("mergePlaces", () => {
  it("keeps the first occurrence and preserves order", () => {
    const merged = mergePlaces(
      [{ id: "osm:node/1", name: "Sorbillo" }],
      [
        { id: "osm:node/2", name: "sorbillo" },
        { id: "osm:node/3", name: "Di Matteo" },
      ],
    );
    expect(merged.map((place) => place.id)).toEqual(["osm:node/1", "osm:node/3"]);
  });
});
