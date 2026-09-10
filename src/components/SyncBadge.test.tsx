import { describe, expect, it } from "vitest";
import { manualSyncMessage, syncMessage } from "./SyncBadge";
import type { SyncState } from "@/lib/sync";

function state(patch: Partial<SyncState> = {}): SyncState {
  return {
    status: "idle",
    lastSyncedAt: null,
    pending: 0,
    online: true,
    members: [],
    ...patch,
  };
}

describe("syncMessage", () => {
  it("stays silent while a state holds, however long", () => {
    // The poll re-asserts "offline" every minute; none of them speak.
    const offline = state({ status: "offline", pending: 2 });
    expect(syncMessage("offline", offline)).toBeNull();
    expect(syncMessage("idle", state())).toBeNull();
    expect(syncMessage("syncing", state({ status: "syncing" }))).toBeNull();
  });

  it("says what is waiting when signal goes with work queued", () => {
    const message = syncMessage("idle", state({ status: "offline", pending: 2 }));
    expect(message?.tone).toBe("warn");
    expect(message?.text).toContain("2 ratings stay");
  });

  it("counts one rating in the singular", () => {
    const message = syncMessage("idle", state({ status: "offline", pending: 1 }));
    expect(message?.text).toContain("1 rating stays");
  });

  it("says nothing when signal goes and nothing is waiting", () => {
    expect(syncMessage("idle", state({ status: "offline", pending: 0 }))).toBeNull();
  });

  it("announces a reconnection only when something moved", () => {
    const carried = syncMessage(
      "offline",
      state({ moved: { pushed: 0, pulled: 3 } }),
    );
    expect(carried?.text).toBe("Back online — 3 new ratings");

    const sent = syncMessage("offline", state({ moved: { pushed: 1, pulled: 0 } }));
    expect(sent?.text).toBe("Back online — 1 rating synced");

    // Reconnecting with an empty queue is not news; the badge shows it.
    const quiet = syncMessage("offline", state({ moved: { pushed: 0, pulled: 0 } }));
    expect(quiet).toBeNull();
  });

  it("never interrupts for a failure that will be retried", () => {
    expect(syncMessage("syncing", state({ status: "error", pending: 1 }))).toBeNull();
  });

  it("mentions missing storage once and never again", () => {
    const message = syncMessage("syncing", state({ status: "unavailable" }));
    expect(message?.once).toBe(true);
    expect(message?.text).toContain("not set up yet");
  });

  it("says nothing at all when there is no trip", () => {
    expect(syncMessage("idle", state({ status: "off" }))).toBeNull();
  });
});

describe("manualSyncMessage", () => {
  it("always answers a tap, even when nothing moved", () => {
    // The quiet rules are for syncs nobody asked for; this one was asked for.
    expect(manualSyncMessage(state({ moved: { pushed: 0, pulled: 0 } })).text).toBe(
      "Synced — nothing new",
    );
  });

  it("says what came back", () => {
    expect(manualSyncMessage(state({ moved: { pushed: 0, pulled: 2 } })).text).toBe(
      "Synced — 2 new ratings",
    );
    expect(manualSyncMessage(state({ moved: { pushed: 0, pulled: 1 } })).text).toBe(
      "Synced — 1 new rating",
    );
  });

  it("says what went up", () => {
    expect(manualSyncMessage(state({ moved: { pushed: 3, pulled: 0 } })).text).toBe(
      "Synced — 3 ratings sent",
    );
  });

  it("says both when the sync went both ways", () => {
    expect(manualSyncMessage(state({ moved: { pushed: 1, pulled: 2 } })).text).toBe(
      "Synced — 1 sent, 2 received",
    );
  });

  it("warns rather than pretending, when it could not sync", () => {
    expect(manualSyncMessage(state({ status: "offline" }))).toMatchObject({
      tone: "warn",
    });
    expect(manualSyncMessage(state({ status: "error" })).tone).toBe("warn");
    expect(manualSyncMessage(state({ status: "unavailable" })).tone).toBe("warn");
  });
});
