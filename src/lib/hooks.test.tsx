import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useKeyboardInset, useObjectUrl } from "./hooks";

/**
 * The capture flow holds two blobs at once — the photo and the finished
 * card — and stepping back and forth between them must not cost either one
 * its URL.
 */
describe("useObjectUrl", () => {
  it("makes a URL for a blob and releases it when the blob goes", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:one");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const blob = new Blob(["x"]);
    const { result, unmount } = renderHook(() => useObjectUrl(blob));

    expect(result.current).toBe("blob:one");
    expect(create).toHaveBeenCalledWith(blob);

    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:one");

    create.mockRestore();
    revoke.mockRestore();
  });

  it("holds a photo's URL while a second blob comes and goes", () => {
    let next = 0;
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `blob:${(next += 1)}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const photo = new Blob(["photo"]);
    const photoHook = renderHook(({ blob }) => useObjectUrl(blob), {
      initialProps: { blob: photo as Blob | null },
    });
    const photoUrl = photoHook.result.current;

    // The card is rendered, then re-rendered: the photo must not be touched.
    const cardHook = renderHook(({ blob }) => useObjectUrl(blob), {
      initialProps: { blob: new Blob(["card"]) as Blob | null },
    });
    cardHook.rerender({ blob: new Blob(["card 2"]) });

    photoHook.rerender({ blob: photo });

    expect(photoHook.result.current).toBe(photoUrl);
    expect(revoke).not.toHaveBeenCalledWith(photoUrl);

    create.mockRestore();
    revoke.mockRestore();
  });

  it("gives nothing back when there is no blob", () => {
    const { result } = renderHook(() => useObjectUrl(null));
    expect(result.current).toBeNull();
  });
});

/**
 * Everything pinned to the bottom of the screen leans on this: iOS shrinks
 * the visible viewport for the keyboard but leaves fixed elements against
 * the layout one, which is what strands a bar halfway up the screen.
 */
describe("useKeyboardInset", () => {
  function viewport(height: number, offsetTop = 0) {
    const listeners: Record<string, () => void> = {};
    return {
      height,
      offsetTop,
      addEventListener: (name: string, fn: () => void) => {
        listeners[name] = fn;
      },
      removeEventListener: () => {},
      fire: () => Object.values(listeners).forEach((fn) => fn()),
      set: (next: number, top = 0) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window.visualViewport as any).height = next;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window.visualViewport as any).offsetTop = top;
      },
    };
  }

  it("is nothing while no keyboard is up", () => {
    const vv = viewport(844);
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
    vi.unstubAllGlobals();
  });

  it("measures what the keyboard covers when the viewport shrinks", () => {
    const vv = viewport(844);
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const { result } = renderHook(() => useKeyboardInset());

    act(() => {
      vv.set(508);
      vv.fire();
    });

    expect(result.current).toBe(336);
    vi.unstubAllGlobals();
  });

  it("never pulls a bar upwards", () => {
    const vv = viewport(844);
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const { result } = renderHook(() => useKeyboardInset());
    act(() => {
      vv.set(900);
      vv.fire();
    });

    expect(result.current).toBe(0);
    vi.unstubAllGlobals();
  });
});
