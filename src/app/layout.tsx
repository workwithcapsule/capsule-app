import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { IdentifyPerson } from "@/components/monitoring";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toaster";
import { createClient } from "@/lib/supabase/server";
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

/** Supplies the browser telemetry singleton with the current authenticated identity. */
async function AuthenticatedMonitoring() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;

  const [{ data: user }, { data: membership }] = await Promise.all([
    supabase.from("users").select("name, email").eq("id", userId).maybeSingle(),
    supabase
      .from("org_members")
      .select("org_id, orgs(name)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);
  const org = membership?.orgs as unknown as { name: string } | null;

  return (
    <IdentifyPerson
      user={{
        id: userId,
        name: user?.name ?? "",
        email: user?.email ?? (claims?.claims?.email as string | undefined) ?? "",
      }}
      org={{ id: membership?.org_id ?? "", name: org?.name ?? "" }}
    />
  );
}

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
        <AuthenticatedMonitoring />
        <ThemeProvider>
          <Toaster>{children}</Toaster>
        </ThemeProvider>
      </body>
    </html>
  );
}
