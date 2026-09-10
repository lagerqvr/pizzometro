import { describe, expect, it, vi } from "vitest";
import { CAMERA_LADDER, openStream } from "./Camera";

const stream = {} as MediaStream;

describe("openStream", () => {
  it("takes the full sensor when the device can give it", async () => {
    const ask = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>(
      async () => stream,
    );
    await openStream(ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]?.[0]).toEqual(CAMERA_LADDER[0]);
  });

  it("steps down instead of giving up when the ask is too big", async () => {
    // A laptop webcam refusing 4032x3024 used to leave no viewfinder at all.
    const ask = vi
      .fn<(c: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockRejectedValueOnce(new Error("OverconstrainedError"))
      .mockResolvedValueOnce(stream);

    await expect(openStream(ask)).resolves.toBe(stream);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("ends up asking for nothing but a camera", async () => {
    // Everything with a preference refused; only the bare ask succeeds.
    const ask = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>(
      async (constraints) => {
        if (constraints.video === true) return stream;
        throw new Error("OverconstrainedError");
      },
    );

    await expect(openStream(ask)).resolves.toBe(stream);
    expect(ask).toHaveBeenCalledTimes(CAMERA_LADDER.length);
    expect(ask.mock.calls.at(-1)?.[0]).toEqual({ video: true, audio: false });
  });

  it("only fails when there is genuinely no camera", async () => {
    const ask = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>(
      async () => {
        throw new Error("NotFoundError");
      },
    );
    await expect(openStream(ask)).rejects.toThrow("NotFoundError");
    expect(ask).toHaveBeenCalledTimes(CAMERA_LADDER.length);
  });

  it("asks for the back camera before it settles for any", async () => {
    expect(CAMERA_LADDER.at(-1)).toEqual({ video: true, audio: false });
    expect(CAMERA_LADDER.slice(0, -1).every((c) => "facingMode" in (c.video as object))).toBe(true);
  });
});
