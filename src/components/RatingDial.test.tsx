import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RatingDial } from "./RatingDial";

describe("RatingDial", () => {
  it("shows the current rating and its verdict", () => {
    render(<RatingDial value={8.5} onChange={() => {}} />);
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(screen.getByText("OTTIMA")).toBeInTheDocument();
  });

  it("reports changes as numbers, not strings", () => {
    const onChange = vi.fn();
    render(<RatingDial value={7} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/rating out of ten/i), {
      target: { value: "9.5" },
    });
    expect(onChange).toHaveBeenCalledWith(9.5);
  });

  it("moves in half steps across the full scale", () => {
    render(<RatingDial value={7} onChange={() => {}} />);
    const slider = screen.getByLabelText(/rating out of ten/i);
    expect(slider).toHaveAttribute("step", "0.5");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "10");
  });
});
