"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light, dark or match system. The choice is remembered on this device. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="capsule-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
