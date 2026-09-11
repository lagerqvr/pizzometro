import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useObjectUrl, useSettleAtBottom } from "./hooks";

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

  it("asks the browser to place the bar, once", async () => {
    const { node, writes, reads } = element();
    renderHook(() => useSettleAtBottom({ current: node }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    // A transform written, a layout read to make it count, then cleared.
    expect(writes).toEqual(["translateZ(0)", ""]);
    expect(reads()).toBeGreaterThan(0);
  });

  it("does it once and then leaves the bar alone", async () => {
    const { node, writes } = element();
    renderHook(() => useSettleAtBottom({ current: node }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    const afterFirst = writes.length;

    // Correcting it again and again is what made it chase the screen.
    window.dispatchEvent(new Event("resize"));
    window.visualViewport?.dispatchEvent?.(new Event("resize"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(writes.length).toBe(afterFirst);
  });

  it("does nothing when there is no bar to place", () => {
    const ref = { current: null };
    expect(() => renderHook(() => useSettleAtBottom(ref))).not.toThrow();
  });
});
