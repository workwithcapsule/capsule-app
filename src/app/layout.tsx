import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Capsule", template: "%s · Capsule" },
  description: "Follow one outcome from idea to launch, across every team.",
};

/*
 * Runs before the page paints, so a collapsed sidebar on wide screens
 * doesn't flash open on load. Same storage key as the prototype.
 */
const navScript = `try{if(localStorage.getItem('capsule-nav')==='1')document.documentElement.dataset.nav='collapsed'}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: navScript }} />
      </head>
      <body>
        <ThemeProvider>
          <Toaster>{children}</Toaster>
        </ThemeProvider>
      </body>
    </html>
  );
}
