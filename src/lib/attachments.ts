/*
 * Attachments (step 10, design-decisions.md section 14): reading a link's
 * type from its address, naming links and files, and the checks shown when
 * adding a link. Shared by the browser and the server.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // decision 14

export type LinkType =
  | "figma"
  | "google_docs"
  | "google_sheets"
  | "google_slides"
  | "notion"
  | "confluence"
  | "loom"
  | "link";

/** How each kind of attachment is labeled (prototype ATT_KINDS). */
export type AttachmentKind =
  LinkType | "pdf" | "image" | "sheet_file" | "doc_file" | "slides_file" | "video_file" | "file";

export const KIND_LABEL: Record<AttachmentKind, string> = {
  figma: "Figma file",
  google_docs: "Google Doc",
  google_sheets: "Google Sheet",
  google_slides: "Google Slides",
  notion: "Notion page",
  confluence: "Confluence page",
  loom: "Loom video",
  link: "Link",
  pdf: "PDF",
  image: "Image",
  sheet_file: "Spreadsheet",
  doc_file: "Document",
  slides_file: "Presentation",
  video_file: "Video",
  file: "File",
};

/** The link's type, read from its address. */
export function linkTypeFromUrl(url: string): LinkType {
  const u = url.toLowerCase();
  if (/(^|\/\/|\.)figma\.com\//.test(u)) return "figma";
  if (/docs\.google\.com\/spreadsheets|sheets\.google\.com/.test(u)) return "google_sheets";
  if (/docs\.google\.com\/presentation|slides\.google\.com/.test(u)) return "google_slides";
  if (/docs\.google\.com\/document|drive\.google\.com|docs\.google\.com/.test(u))
    return "google_docs";
  if (/(^|\/\/|\.)notion\.(so|site)\//.test(u)) return "notion";
  if (/atlassian\.net\/wiki|confluence/.test(u)) return "confluence";
  if (/(^|\/\/|\.)loom\.com\//.test(u)) return "loom";
  return "link";
}

/** A file's kind, read from its name. */
export function fileKind(name: string): AttachmentKind {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (/^(png|jpe?g|gif|webp|svg|heic)$/.test(ext)) return "image";
  if (/^(xlsx?|csv|numbers)$/.test(ext)) return "sheet_file";
  if (/^(docx?|pages|txt|md|rtf)$/.test(ext)) return "doc_file";
  if (/^(pptx?|key)$/.test(ext)) return "slides_file";
  if (/^(mp4|mov|webm)$/.test(ext)) return "video_file";
  return "file";
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Something that looks like a web address, with or without https://. */
export function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(s.trim());
}

/** Adds https:// when it's missing. */
export function normalizeUrl(s: string): string {
  const t = s.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** A readable name from the address: the last part of the path, or the site. */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const t = decodeURIComponent(seg)
      .replace(/[-_+]+/g, " ")
      .replace(/\.[a-z0-9]+$/i, "")
      .trim();
    // IDs (long unbroken strings with numbers in them) make poor names; use the site.
    const looksLikeId = (/^[a-z0-9]{12,}$/i.test(seg) && /\d/.test(seg)) || /^\d+$/.test(seg);
    if (t && !looksLikeId) {
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The second line of a row: "Figma file", "PDF · 1.2 MB", "example.com". */
export function attachmentLabel(a: {
  kind: "file" | "link";
  linkType: LinkType | null;
  url: string | null;
  name: string;
  sizeBytes: number | null;
}): string {
  if (a.kind === "link") {
    if (a.linkType && a.linkType !== "link") return KIND_LABEL[a.linkType];
    try {
      return new URL(a.url ?? "").hostname.replace(/^www\./, "");
    } catch {
      return "Link";
    }
  }
  const k = fileKind(a.name);
  const size = a.sizeBytes != null ? ` · ${fmtSize(a.sizeBytes)}` : "";
  return `${KIND_LABEL[k]}${size}`;
}

export type LinkCheck =
  { ok: true; url: string; name: string; linkType: LinkType } | { ok: false; error: string };

/** Checks a link before adding it (design-decisions.md section 14). */
export function checkLink(raw: string, name: string, existing: (string | null)[]): LinkCheck {
  const t = raw.trim();
  if (!t) return { ok: false, error: "Paste a link first." };
  if (!looksLikeUrl(t) || /^[a-z]+:(?!\/\/)/i.test(t.replace(/^https?:\/\//i, ""))) {
    return {
      ok: false,
      error: "That doesn’t look like a link. Paste the full address, like figma.com/file/…",
    };
  }
  const url = normalizeUrl(t);
  if (existing.some((e) => e === url))
    return { ok: false, error: "That link is already attached." };
  return {
    ok: true,
    url,
    name: name.trim().slice(0, 300) || titleFromUrl(url),
    linkType: linkTypeFromUrl(url),
  };
}
