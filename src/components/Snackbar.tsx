"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type Snack = { id: number; message: string; tone: "ok" | "warn" };

type SnackbarApi = (message: string, tone?: "ok" | "warn") => void;

const SnackbarContext = createContext<SnackbarApi>(() => {});

export function useSnackbar(): SnackbarApi {
  return useContext(SnackbarContext);
}

export function SnackbarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<SnackbarApi>((message, tone = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setSnack({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setSnack(null), 4200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <SnackbarContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
        role="status"
        aria-live="polite"
      >
        {snack && (
          <div
            key={snack.id}
            className="animate-snack pointer-events-auto flex w-full max-w-md items-start gap-3 border border-ink bg-ink px-4 py-3 text-paper shadow-[4px_4px_0_rgba(33,33,33,0.25)]"
          >
            <span
              aria-hidden
              className={`mt-[3px] h-3 w-3 shrink-0 ${
                snack.tone === "ok" ? "bg-accent" : "bg-paper"
              }`}
            />
            <p className="text-[0.8125rem] leading-snug">{snack.message}</p>
          </div>
        )}
      </div>
    </SnackbarContext.Provider>
  );
}
