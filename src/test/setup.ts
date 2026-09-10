import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetSettingsCache, resetTripCache } from "@/lib/hooks";
import { resetSyncState } from "@/lib/sync";

// jsdom knows the <dialog> element but not how to open one.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close(
    this: HTMLDialogElement,
  ) {
    this.open = false;
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetSettingsCache();
  resetTripCache();
  resetSyncState();
});
