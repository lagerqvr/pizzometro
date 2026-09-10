import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlacePicker } from "./PlacePicker";
import type { Place } from "@/lib/types";

const nearby: Place[] = [
  { id: "osm:1", name: "Pizzeria Trianon", address: "Via P. Colletta", distance: 80 },
  { id: "osm:2", name: "Da Michele", address: "Via Sersale", distance: 140 },
];

function geolocation(behaviour: "ok" | "denied" | "silent") {
  return {
    getCurrentPosition: (ok: PositionCallback, fail?: PositionErrorCallback) => {
      if (behaviour === "ok") {
        ok({ coords: { latitude: 40.85, longitude: 14.26 } } as GeolocationPosition);
      } else if (behaviour === "denied") {
        fail?.({ code: 1, message: "denied" } as GeolocationPositionError);
      }
      // "silent" answers neither, the way iOS sometimes does.
    },
  };
}

function serve(places: Place[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ places }), { status: 200 })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PlacePicker", () => {
  it("offers what is nearby once the phone knows where it is", async () => {
    vi.stubGlobal("navigator", { ...navigator, geolocation: geolocation("ok") });
    serve(nearby);

    render(<PlacePicker value={null} onChange={vi.fn()} />);

    expect(await screen.findByText("Pizzeria Trianon")).toBeInTheDocument();
    expect(screen.getByText("THIS PLACE?")).toBeInTheDocument();
  });

  it("hands back the place that was tapped", async () => {
    vi.stubGlobal("navigator", { ...navigator, geolocation: geolocation("ok") });
    serve(nearby);
    const onChange = vi.fn();
    render(<PlacePicker value={null} onChange={onChange} />);

    await userEvent.setup().click(await screen.findByText("Da Michele"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Da Michele" }),
    );
  });

  it("always lets a name be typed, even with no GPS", async () => {
    vi.stubGlobal("navigator", { ...navigator, geolocation: geolocation("denied") });
    serve([]);
    const onChange = vi.fn();
    render(<PlacePicker value={null} onChange={onChange} />);

    expect(await screen.findByText("NO GPS — TYPE IT")).toBeInTheDocument();

    await userEvent.setup().type(
      screen.getByRole("textbox", { name: "Search for a place" }),
      "Sorbillo",
    );
    await userEvent.setup().click(await screen.findByText(/Use “Sorbillo”/));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sorbillo" }),
    );
  });

  it("gives up on a location that never answers, rather than saying LOCATING for ever", async () => {
    vi.stubGlobal("navigator", { ...navigator, geolocation: geolocation("silent") });
    serve([]);
    render(<PlacePicker value={null} onChange={vi.fn()} />);

    expect(screen.getByText("LOCATING…")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(10_500);

    await waitFor(() =>
      expect(screen.getByText("NO GPS — TYPE IT")).toBeInTheDocument(),
    );
  });

  it("shows a chosen place instead of hunting for another", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { ...navigator, geolocation: geolocation("ok") });

    render(<PlacePicker value={nearby[0]} onChange={vi.fn()} />);

    expect(screen.getByText("Pizzeria Trianon")).toBeInTheDocument();
    expect(screen.getByText("CHANGE")).toBeInTheDocument();
    // Editing an old rating must not spend a lookup re-answering a settled
    // question — that is Overpass's rate limit being burned for nothing.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a chosen place be cleared", async () => {
    vi.stubGlobal("navigator", { ...navigator, geolocation: geolocation("ok") });
    serve(nearby);
    const onChange = vi.fn();
    render(<PlacePicker value={nearby[0]} onChange={onChange} />);

    await userEvent.setup().click(screen.getByText("CHANGE"));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
