import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider, useConfirm } from "./Confirm";

function Subject({ onAnswer }: { onAnswer: (ok: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={async () =>
        onAnswer(
          await confirm({
            title: "Delete “Margherita”?",
            body: "This cannot be undone.",
            action: "DELETE",
            destructive: true,
          }),
        )
      }
    >
      open
    </button>
  );
}

function setup(onAnswer: (ok: boolean) => void) {
  return render(
    <ConfirmProvider>
      <Subject onAnswer={onAnswer} />
    </ConfirmProvider>,
  );
}

describe("ConfirmProvider", () => {
  it("shows the question and resolves true on the action", async () => {
    const answers: boolean[] = [];
    setup((ok) => answers.push(ok));
    const user = userEvent.setup();

    await user.click(screen.getByText("open"));
    expect(screen.getByText("Delete “Margherita”?")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "DELETE" }));
    await waitFor(() => expect(answers).toEqual([true]));
  });

  it("resolves false on cancel and takes the dialog away", async () => {
    const answers: boolean[] = [];
    setup((ok) => answers.push(ok));
    const user = userEvent.setup();

    await user.click(screen.getByText("open"));
    await user.click(screen.getByRole("button", { name: "CANCEL" }));

    await waitFor(() => expect(answers).toEqual([false]));
    expect(screen.queryByText("Delete “Margherita”?")).not.toBeInTheDocument();
  });

  it("asks nothing until it is asked", () => {
    setup(() => {});
    expect(screen.queryByRole("button", { name: "DELETE" })).toBeNull();
  });
});
