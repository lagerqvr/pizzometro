import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipField } from "./ChipField";
import { fieldsFor } from "@/lib/entry";

const styles = fieldsFor("pizzeria").styles;

function field(props: Partial<Parameters<typeof ChipField>[0]> = {}) {
  return (
    <ChipField
      label="Style"
      placeholder="Napoletana"
      value=""
      options={styles}
      onChange={() => {}}
      {...props}
    />
  );
}

describe("ChipField", () => {
  it("fills the field from a tap", async () => {
    const onChange = vi.fn();
    render(field({ onChange }));

    await userEvent.setup().click(screen.getByRole("button", { name: "ROMANA" }));

    expect(onChange).toHaveBeenCalledWith("Romana");
  });

  it("marks the one in the field, whatever case it was typed in", () => {
    render(field({ value: "  napoletana " }));
    expect(screen.getByRole("button", { name: "NAPOLETANA" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clears the field when the chosen chip is tapped again", async () => {
    const onChange = vi.fn();
    render(field({ value: "Al taglio", onChange }));

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "AL TAGLIO" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("still takes anything typed", async () => {
    const onChange = vi.fn();
    render(field({ onChange }));

    await userEvent.setup().type(screen.getByRole("textbox"), "C");

    expect(onChange).toHaveBeenCalledWith("C");
  });

  it("is a plain field when there is nothing to suggest", () => {
    render(field({ label: "Pizza", options: [] }));
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
