"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { searchCapsules, type SearchHit } from "@/app/(app)/search/actions";
import { CapsuleMark } from "@/components/logo";
import { cn } from "@/lib/utils";

export const OPEN_SEARCH = "capsule:open-search";

/**
 * Search (⌘K, or the Search button in the sidebar): capsules by name or key,
 * your recent capsules when nothing is typed (prototype palette,
 * build-decisions.md 49).
 */
export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [active, setActive] = useState(0);
  const [, start] = useTransition();
  const seq = useRef(0);

  // Every way of opening starts fresh, with your recent capsules.
  const openRef = useRef(false);
  function show(next: boolean) {
    openRef.current = next;
    setOpen(next);
    if (next) {
      setQ("");
      setHits(null);
      run("");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show(!openRef.current);
      }
    };
    const onOpen = () => show(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH, onOpen);
    };
    // `show` only uses state setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function run(text: string) {
    const id = ++seq.current;
    start(async () => {
      const r = await searchCapsules(text);
      if (id === seq.current) {
        setHits(r);
        setActive(0);
      }
    });
  }

  function go(h: SearchHit) {
    show(false);
    router.push(`/capsules/${h.key.toLowerCase()}`);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={show}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[75] bg-transparent" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-[76] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-pop outline-none data-[state=open]:animate-in data-[state=open]:duration-150 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] motion-reduce:data-[state=open]:animate-none"
        >
          <DialogPrimitive.Title className="sr-only">Search capsules</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-divider px-4">
            <MagnifyingGlass
              size={16}
              className="flex-none text-muted-foreground"
              aria-hidden="true"
            />
            <label htmlFor="search-q" className="sr-only">
              Search capsules by name or key
            </label>
            <input
              id="search-q"
              autoFocus
              autoComplete="off"
              role="combobox"
              aria-expanded={Boolean(hits?.length)}
              aria-controls="search-results"
              aria-activedescendant={hits?.length ? `search-hit-${active}` : undefined}
              value={q}
              placeholder="Search capsules by name or key"
              onChange={(e) => {
                setQ(e.target.value);
                run(e.target.value);
              }}
              onKeyDown={(e) => {
                if (!hits?.length) return;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const d = e.key === "ArrowDown" ? 1 : -1;
                  setActive((a) => (a + d + hits.length) % hits.length);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(hits[active]);
                }
              }}
              className="h-[52px] min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint focus-visible:outline-none"
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto py-1.5">
            {hits === null ? (
              <p className="px-[18px] py-3.5 text-[13px] text-muted-foreground">Searching…</p>
            ) : hits.length ? (
              <>
                {!q.trim() && (
                  <p className="px-4 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                    Recent capsules
                  </p>
                )}
                <ul id="search-results" role="listbox" aria-label="Capsules">
                  {hits.map((h, i) => (
                    <li
                      key={h.key}
                      id={`search-hit-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2.5 px-4 py-2",
                        i === active && "bg-subtle",
                      )}
                    >
                      <span className="text-muted-foreground">
                        <CapsuleMark width={16} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{h.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{h.key}</span> · {h.space}
                        </span>
                      </span>
                      {!h.yours && <span className="text-xs text-muted-foreground">Can view</span>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="px-[18px] py-3.5 text-[13px] text-muted-foreground">
                {q.trim()
                  ? "No capsules match. Try a different word, or a key like EN-1."
                  : "Capsules you’re on or follow will show up here."}
              </p>
            )}
          </div>
          <div className="flex gap-3.5 border-t border-divider px-4 py-2.5 text-xs text-muted-foreground">
            <span>↑↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
