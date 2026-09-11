import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntryCard, EntryCardSkeleton } from "./EntryCard";
import type { Entry } from "@/lib/types";

const base: Entry = {
  id: "e1",
  kind: "pizzeria",
  name: "Margherita",
  rating: 8.5,
  createdAt: Date.now(),
  place: { id: "p1", name: "Sorbillo" },
};

describe("EntryCard", () => {
  it("links to the entry's own view", () => {
    render(<EntryCard entry={base} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/entry?id=e1");
  });

  it("shows the pizzeria under the name", () => {
    render(<EntryCard entry={base} />);
    expect(screen.getByText("SORBILLO")).toBeInTheDocument();
  });

  it("labels a self-made pizza instead of a location", () => {
    render(<EntryCard entry={{ ...base, kind: "homemade", place: undefined }} />);
    expect(screen.getByText("SELF MADE")).toBeInTheDocument();
  });

  it("says so when a pizzeria entry has no location", () => {
    render(<EntryCard entry={{ ...base, place: undefined }} />);
    expect(screen.getByText("NO LOCATION")).toBeInTheDocument();
  });

  it("shows the rank badge only on the leaderboard", () => {
    const { rerender } = render(<EntryCard entry={base} />);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    rerender(<EntryCard entry={base} rank={1} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

describe("EntryCardSkeleton", () => {
  it("holds a card's shape without claiming to be one", () => {
    const { container } = render(<EntryCardSkeleton />);
    // Hidden from anything reading the page aloud: it says nothing yet.
    expect(container.firstChild).toHaveAttribute("aria-hidden");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
