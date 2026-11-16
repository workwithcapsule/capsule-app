import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Daily clean-up of removed attachments (build-decisions.md 45, 54).
 * Removing an attachment keeps its file for 30 days so Undo always works;
 * after that, this deletes the stored file and the attachment row. Activity
 * keeps its own copy of the name, so history still reads "removed X".
 *
 * Vercel Cron calls this once a day (vercel.json) with the CRON_SECRET it
 * holds, so nobody else can run it.
 */

const KEEP_DAYS = 30;
const BATCH = 500;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server key not set" }, { status: 500 });

  const before = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { data: rows, error } = await admin
    .from("attachments")
    .select("id, storage_path")
    .not("removed_at", "is", null)
    .lt("removed_at", before)
    .limit(BATCH);
  if (error) {
    console.error("[cleanup-files] couldn't list removed attachments", error);
    return NextResponse.json({ error: "List failed" }, { status: 500 });
  }

  const paths = (rows ?? []).map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { error: e } = await admin.storage.from("attachments").remove(paths);
    if (e) {
      // Keep the rows so the next run tries these files again.
      console.error("[cleanup-files] couldn't delete files", e);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
  }
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length) {
    const { error: e } = await admin.from("attachments").delete().in("id", ids);
    if (e) {
      console.error("[cleanup-files] couldn't delete rows", e);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ files: paths.length, rows: ids.length });
}
