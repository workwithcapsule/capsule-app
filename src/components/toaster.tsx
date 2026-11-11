"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Toasts from the prototype: a dark pill at the bottom of the screen, gone
 * after 5 seconds, at most 3 at a time, with an optional Undo. Used app-wide.
 */

type Toast = { id: number; message: string; undo?: () => void | Promise<void> };
type ShowToast = (message: string, options?: { undo?: Toast["undo"]; ms?: number }) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, options = {}) => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, message, undo: options.undo }].slice(-3));
      setTimeout(() => dismiss(id), options.ms ?? 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex min-h-11 max-w-[calc(100vw-32px)] animate-rise items-center gap-2.5 rounded-full bg-foreground py-2 pr-2 pl-4 text-sm text-bg shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
              !t.undo && "pr-4",
            )}
          >
            <span>{t.message}</span>
            {t.undo && (
              <button
                type="button"
                onClick={async () => {
                  dismiss(t.id);
                  await t.undo?.();
                }}
                className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-bg underline underline-offset-[3px] focus-visible:outline-bg"
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
