"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ConfirmRequest = {
  title: string;
  /** Rich enough to set a trip code in the app's own type. */
  body?: React.ReactNode;
  /** The word on the button that goes through with it. */
  action: string;
  /** Draws the action in accent — for anything that removes something. */
  destructive?: boolean;
  /**
   * A word that has to be typed before the action can be taken. For the
   * handful of things that cannot be undone and affect more than one phone.
   */
  confirmText?: string;
};

type ConfirmApi = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmApi>(async () => false);

/** Replaces window.confirm, which looks like the browser and not like this. */
export function useConfirm(): ConfirmApi {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [typed, setTyped] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const answer = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<ConfirmApi>((next) => {
    setTyped("");
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    const element = dialog.current;
    if (element?.open) {
      if (typeof element.close === "function") element.close();
      else element.removeAttribute("open");
    }
    answer.current?.(ok);
    answer.current = null;
    setRequest(null);
  }, []);

  // A native dialog brings the focus trap, the backdrop and the escape key
  // with it; only its looks are ours.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!request || element.open) return;
    // Browsers without <dialog> still get the panel, just without the
    // backdrop — better than a button that does nothing.
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }, [request]);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          close(false);
        }}
        onClick={(event) => {
          // A tap on the backdrop, outside the panel, means no.
          if (event.target === dialog.current) close(false);
        }}
        aria-labelledby="confirm-title"
        className="m-auto w-[min(24rem,calc(100vw-2.5rem))] border border-ink bg-paper p-0 text-ink shadow-[6px_6px_0_rgba(33,33,33,0.2)] backdrop:bg-ink/45"
      >
        {request && (
          <div className="animate-rise">
            <div className="border-b border-rule px-5 pb-3 pt-4">
              <h2 id="confirm-title" className="text-sm font-medium">
                {request.title}
              </h2>
              {request.body && (
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {request.body}
                </p>
              )}
              {request.confirmText && (
                <label className="mt-3 block">
                  <span className="label">
                    Type “{request.confirmText}” to confirm
                  </span>
                  <input
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="mt-1 w-full border-b border-rule bg-transparent py-2 text-base outline-none focus:border-ink"
                  />
                </label>
              )}
            </div>
            <div className="grid grid-cols-2 gap-px bg-rule">
              <button
                type="button"
                onClick={() => close(false)}
                className="bg-paper py-4 text-[0.6875rem] tracking-[0.22em] text-muted"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={
                  Boolean(request.confirmText) &&
                  typed.trim().toLowerCase() !==
                    request.confirmText!.toLowerCase()
                }
                onClick={() => close(true)}
                className={`bg-paper py-4 text-[0.6875rem] tracking-[0.22em] disabled:opacity-40 ${
                  request.destructive ? "text-accent" : "text-ink"
                }`}
              >
                {request.action}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
