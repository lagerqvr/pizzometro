import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBottomInset, useObjectUrl } from "./hooks";

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
 * Everything pinned to the bottom of the screen leans on this. An installed
 * web app is sometimes laid out shorter than the screen it is on, which
 * leaves the bar floating above the bottom until something makes the
 * viewport settle.
 */
describe("useBottomInset", () => {
  function mount(viewportHeight: number, innerHeight: number, offsetTop = 0) {
    const listeners: Record<string, () => void> = {};
    const viewport = {
      height: viewportHeight,
      offsetTop,
      addEventListener: (name: string, fn: () => void) => {
        listeners[name] = fn;
      },
      removeEventListener: () => {},
    };
    vi.stubGlobal("visualViewport", viewport);
    Object.defineProperty(window, "innerHeight", {
      value: innerHeight,
      configurable: true,
    });
    return { viewport, fire: () => listeners.resize?.() };
  }

  it("pushes the bar down when the page is laid out short of the screen", async () => {
    // The launch bug: 844 points of screen, 704 of layout viewport.
    const { fire } = mount(844, 704);
    const { result } = renderHook(() => useBottomInset());

    act(() => fire());

    expect(result.current).toBe(140);
    vi.unstubAllGlobals();
  });

  it("leaves the bar alone once the viewport matches the screen", () => {
    const { fire } = mount(844, 844);
    const { result } = renderHook(() => useBottomInset());
    act(() => fire());
    expect(result.current).toBe(0);
    vi.unstubAllGlobals();
  });

  it("does not lift the bar above a keyboard", () => {
    // Keyboard up: the visible area is shorter, and the bar belongs behind it.
    const { fire } = mount(508, 844);
    const { result } = renderHook(() => useBottomInset());
    act(() => fire());
    expect(result.current).toBe(0);
    vi.unstubAllGlobals();
  });

  it("counts a page scrolled down to reveal something", () => {
    const { fire } = mount(700, 704, 100);
    const { result } = renderHook(() => useBottomInset());
    act(() => fire());
    expect(result.current).toBe(96);
    vi.unstubAllGlobals();
  });
});
