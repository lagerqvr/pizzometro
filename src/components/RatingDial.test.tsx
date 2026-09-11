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

  it("moves in tenths across the full scale", () => {
    render(<RatingDial value={7} onChange={() => {}} />);
    const slider = screen.getByLabelText(/rating out of ten/i);
    expect(slider).toHaveAttribute("step", "0.1");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "10");
  });

  it("shows a tenth in the readout", () => {
    render(<RatingDial value={8.3} onChange={() => {}} />);
    expect(screen.getByText("8.3")).toBeInTheDocument();
  });

  it("nudges a tenth either way", () => {
    const onChange = vi.fn();
    render(<RatingDial value={8.3} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText(/up a tenth/i));
    expect(onChange).toHaveBeenCalledWith(8.4);

    fireEvent.click(screen.getByLabelText(/down a tenth/i));
    expect(onChange).toHaveBeenCalledWith(8.2);
  });

  it("keeps the arithmetic on a tenth", () => {
    const onChange = vi.fn();
    render(<RatingDial value={7.1} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/up a tenth/i));
    // 7.1 + 0.1 is 7.199999999999999 if nobody is watching.
    expect(onChange).toHaveBeenCalledWith(7.2);
  });

  it("cannot be nudged off either end of the scale", () => {
    const { rerender } = render(<RatingDial value={10} onChange={() => {}} />);
    expect(screen.getByLabelText(/up a tenth/i)).toBeDisabled();

    rerender(<RatingDial value={0} onChange={() => {}} />);
    expect(screen.getByLabelText(/down a tenth/i)).toBeDisabled();
  });
});
