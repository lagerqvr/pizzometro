import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useObjectUrl } from "./hooks";

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
