import { describe, expect, it } from "vitest";
import {
  attachmentLabel,
  checkLink,
  fileKind,
  fmtSize,
  linkTypeFromUrl,
  titleFromUrl,
} from "@/lib/attachments";

describe("link types", () => {
  it("reads the type from the address", () => {
    expect(linkTypeFromUrl("https://www.figma.com/file/abc/Leaderboard")).toBe("figma");
    expect(linkTypeFromUrl("https://docs.google.com/spreadsheets/d/1")).toBe("google_sheets");
    expect(linkTypeFromUrl("https://docs.google.com/presentation/d/1")).toBe("google_slides");
    expect(linkTypeFromUrl("https://docs.google.com/document/d/1")).toBe("google_docs");
    expect(linkTypeFromUrl("https://www.notion.so/acme/Launch-plan-123")).toBe("notion");
    expect(linkTypeFromUrl("https://acme.atlassian.net/wiki/spaces/X")).toBe("confluence");
    expect(linkTypeFromUrl("https://www.loom.com/share/abc")).toBe("loom");
    expect(linkTypeFromUrl("https://example.com/notfigma.com/")).toBe("link");
  });
});

describe("names and labels", () => {
  it("names a link from its address, or the site when the path is an ID", () => {
    expect(titleFromUrl("https://www.notion.so/acme/launch-plan")).toBe("Launch plan");
    expect(titleFromUrl("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp")).toBe(
      "docs.google.com",
    );
    expect(titleFromUrl("https://www.example.com/")).toBe("example.com");
  });
  it("labels files by type and size", () => {
    expect(fileKind("Launch-messaging-v3.pdf")).toBe("pdf");
    expect(fileKind("photo.JPG")).toBe("image");
    expect(fmtSize(1_258_291)).toBe("1.2 MB");
    expect(
      attachmentLabel({
        kind: "file",
        linkType: null,
        url: null,
        name: "plan.pdf",
        sizeBytes: 84_000,
      }),
    ).toBe("PDF · 82 KB");
    expect(
      attachmentLabel({
        kind: "link",
        linkType: "link",
        url: "https://www.example.com/a",
        name: "",
        sizeBytes: null,
      }),
    ).toBe("example.com");
  });
});

describe("checking a link before adding it", () => {
  it("adds https:// and fills in a name", () => {
    expect(checkLink("figma.com/file/abc/leaderboard-designs", "", [])).toEqual({
      ok: true,
      url: "https://figma.com/file/abc/leaderboard-designs",
      name: "Leaderboard designs",
      linkType: "figma",
    });
  });
  it("flags malformed and duplicate links", () => {
    expect(checkLink("not a link", "", [])).toMatchObject({ ok: false });
    expect(checkLink("javascript:alert(1)", "", [])).toMatchObject({ ok: false });
    expect(checkLink("https://example.com/a", "", ["https://example.com/a"])).toEqual({
      ok: false,
      error: "That link is already attached.",
    });
  });
});
