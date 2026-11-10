"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent, TopBar } from "@/components/shell/sidebar-content";
import { LAPTOP_UP, WIDE, useMediaQuery } from "@/hooks/use-media-query";

/*
 * The responsive sidebar (design-decisions.md section 14):
 * - Wide (1280px and up): docked full sidebar. Collapsing it to the icon rail
 *   is remembered on this device.
 * - Laptop (900–1279px): icon rail. Expanding opens the full sidebar over
 *   the page with a dimmed backdrop.
 * - Narrow (under 900px): slim top bar; its menu button slides the sidebar in.
 * Only the wide layout ever pushes content. Overlays close on a link, a click
 * outside or Esc, and reset when the window crosses a breakpoint.
 *
 * Which layout shows is decided by CSS, so there is no flash on load.
 */

const NAV_KEY = "capsule-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const wide = useMediaQuery(WIDE);
  const laptopUp = useMediaQuery(LAPTOP_UP);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Pick up the remembered collapse state the head script already applied.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the DOM attribute set before hydration
    setCollapsed(document.documentElement.dataset.nav === "collapsed");
  }, []);

  // Close the overlay when the window crosses a breakpoint, or the page changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on layout change
    setOverlayOpen(false);
  }, [wide, laptopUp, pathname]);

  function setRemembered(next: boolean) {
    setCollapsed(next);
    const root = document.documentElement;
    if (next) root.dataset.nav = "collapsed";
    else delete root.dataset.nav;
    try {
      localStorage.setItem(NAV_KEY, next ? "1" : "0");
    } catch {
      // Storage can be unavailable (private windows); the layout still works.
    }
  }

  function onDockedToggle() {
    if (window.matchMedia(WIDE).matches) setRemembered(!collapsed);
    else setOverlayOpen(true);
  }

  const railShowing = !wide || collapsed;
  const closeOverlay = () => setOverlayOpen(false);

  return (
    <div className="flex min-h-dvh flex-col laptop:flex-row">
      <a
        href="#main"
        className="sr-only z-[90] rounded-full bg-surface px-4 py-2 shadow-pop focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <TopBar open={overlayOpen} onOpen={() => setOverlayOpen(true)} />

      <aside
        aria-label="Sidebar"
        className="sb-auto sticky top-0 z-50 hidden h-dvh w-[248px] flex-none self-start overflow-y-auto border-r border-border bg-bg laptop:flex rail:w-[68px]"
      >
        <SidebarContent
          placement="docked"
          toggleLabel={railShowing ? "Expand menu" : "Collapse menu"}
          toggleExpanded={!railShowing}
          onToggle={onDockedToggle}
        />
      </aside>

      <Sheet open={overlayOpen && !wide} onOpenChange={setOverlayOpen}>
        <SheetContent
          aria-label="Sidebar"
          onCloseAutoFocus={(e) => {
            // Return focus to whichever menu button is showing at this width.
            e.preventDefault();
            const which = window.matchMedia(LAPTOP_UP).matches ? "docked" : "topbar";
            document.querySelector<HTMLElement>(`[data-nav-toggle="${which}"]`)?.focus();
          }}
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent
            placement="overlay"
            toggleLabel={laptopUp ? "Collapse menu" : "Close menu"}
            toggleExpanded
            onToggle={closeOverlay}
            onNavigate={closeOverlay}
            narrow={!laptopUp}
          />
        </SheetContent>
      </Sheet>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        {children}
      </main>
    </div>
  );
}
