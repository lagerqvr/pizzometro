import { describe, expect, it } from "vitest";
import { fileNameFor, saveMessage } from "./share";
import type { Entry } from "./types";

const entry: Entry = {
  id: "e1",
  kind: "pizzeria",
  name: "Margherita",
  rating: 8.5,
  createdAt: new Date(2026, 8, 12).getTime(),
};

describe("fileNameFor", () => {
  it("uses a dated, slugged name", () => {
    expect(fileNameFor(entry)).toBe("pizzometro-20260912-margherita.jpg");
  });

  it("slugs punctuation and spaces out of the name", () => {
    expect(fileNameFor({ ...entry, name: "Pizza  Fritta! (Napoli)" })).toBe(
      "pizzometro-20260912-pizza-fritta-napoli.jpg",
    );
  });

  it("falls back when the name has nothing sluggable", () => {
    expect(fileNameFor({ ...entry, name: "🍕" })).toBe(
      "pizzometro-20260912-pizza.jpg",
    );
  });
});

describe("saveMessage", () => {
  it("has a distinct message for every outcome", () => {
    const messages = (["shared", "downloaded", "cancelled", "failed"] as const).map(
      saveMessage,
    );
    expect(new Set(messages).size).toBe(4);
    expect(messages.every((message) => message.length > 0)).toBe(true);
  });
});
