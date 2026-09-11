import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBottomInset, useObjectUrl, useSettleAtBottom } from "./hooks";

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

/**
 * iOS places the bottom bar at launch and then leaves it where it was when
 * the viewport changes size, until a layout is forced.
 */
describe("useSettleAtBottom", () => {
  function element() {
    const node = document.createElement("nav");
    const writes: string[] = [];
    let reads = 0;
    Object.defineProperty(node, "offsetHeight", {
      get() {
        reads += 1;
        return 56;
      },
    });
    const style = node.style;
    Object.defineProperty(node, "style", {
      get() {
        return new Proxy(style, {
          set(target, key, value) {
            if (key === "transform") writes.push(String(value));
            return Reflect.set(target, key, value);
          },
        });
      },
    });
    return { node, writes, reads: () => reads };
  }

  it("places the bar again once the screen has settled", async () => {
    const { node, writes, reads } = element();
    const ref = { current: node };
    renderHook(() => useSettleAtBottom(ref));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    // A transform written, a layout read to make it count, then cleared.
    expect(writes).toContain("translateZ(0)");
    expect(writes).toContain("");
    expect(reads()).toBeGreaterThan(0);
  });

  it("does nothing when there is no bar to place", () => {
    const ref = { current: null };
    expect(() => renderHook(() => useSettleAtBottom(ref))).not.toThrow();
  });
});
