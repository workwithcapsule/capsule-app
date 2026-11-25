"use client";

import { useRef, useState } from "react";
import {
  BookOpenText,
  File,
  FileDoc,
  FilePdf,
  FigmaLogo,
  Image as ImageIcon,
  LinkSimple,
  Notebook,
  Plus,
  PresentationChart,
  Table,
  UploadSimple,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  attachmentLabel,
  checkLink,
  fileKind,
  KIND_LABEL,
  linkTypeFromUrl,
  looksLikeUrl,
  MAX_FILE_BYTES,
  normalizeUrl,
  type AttachmentKind,
} from "@/lib/attachments";
import type { Attachment, CapsuleData, Permissions } from "@/lib/capsule-types";
import { fmtRelative } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { addAttachment, fileLink, removeAttachment, restoreAttachment } from "../actions";
import type { useCapsule } from "./use-capsule";
import { track } from "@/lib/analytics";

type Change = ReturnType<typeof useCapsule>["change"];

const ICON: Record<AttachmentKind, Icon> = {
  figma: FigmaLogo,
  google_docs: FileDoc,
  google_sheets: Table,
  google_slides: PresentationChart,
  notion: Notebook,
  confluence: BookOpenText,
  loom: VideoCamera,
  link: LinkSimple,
  pdf: FilePdf,
  image: ImageIcon,
  sheet_file: Table,
  doc_file: FileDoc,
  slides_file: PresentationChart,
  video_file: VideoCamera,
  file: File,
};

const kindOf = (a: Pick<Attachment, "kind" | "linkType" | "name">): AttachmentKind =>
  a.kind === "link" ? (a.linkType ?? "link") : fileKind(a.name);

let tempSeq = 0;

/** Keeps a file name safe for a storage path while staying readable. */
const safeName = (name: string) =>
  name
    .replace(/[^\w.\- ]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(-120) || "file";

function Tile({ kind, size = 32 }: { kind: AttachmentKind; size?: number }) {
  const I = ICON[kind];
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center bg-subtle text-muted-foreground"
      style={{ width: size, height: size, borderRadius: Math.round(size / 4) }}
    >
      <I size={Math.round(size / 2)} />
    </span>
  );
}

/**
 * Attachments, under Components (design-decisions.md section 14): files and
 * links with a type icon, who added them and when. Team members add (upload,
 * drag and drop, or a link); the person who added an item, or the capsule
 * owner, removes it with Undo. Others see the list read-only, and don't see
 * the section when it's empty.
 */
export function AttachmentsSection({
  view,
  perms,
  change,
}: {
  view: CapsuleData;
  perms: Permissions;
  change: Change;
}) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const canAdd = perms.onTeam;
  const list = view.attachments;
  if (!canAdd && list.length === 0) return null;

  const nameOf = (id: string | null) =>
    id === view.me.id ? "You" : (view.people.find((p) => p.id === id)?.name ?? "Someone");
  const canRemove = (a: Attachment) => a.addedBy === view.me.id || perms.isOwner;

  function closeLink() {
    setLinkOpen(false);
    setUrl("");
    setTitle("");
    setError("");
  }

  function addLink() {
    const check = checkLink(
      url,
      title,
      list.map((a) => a.url),
    );
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const temp: Attachment = {
      id: `temp-${++tempSeq}`,
      kind: "link",
      name: check.name,
      url: check.url,
      storagePath: null,
      linkType: check.linkType,
      sizeBytes: null,
      addedBy: view.me.id,
      createdAt: new Date().toISOString(),
    };
    change(
      { type: "addAttachment", attachment: temp },
      async () => {
        const r = await addAttachment({
          orgId: view.capsule.orgId,
          capsuleId: view.capsule.id,
          kind: "link",
          name: check.name,
          url: check.url,
          linkType: check.linkType,
        });
        if (r.ok) track("attachment_added", { attachment_type: check.linkType });
        return r;
      },
      {
        message: `Attached “${check.name}”.`,
        undo: (data) => ({
          op: { type: "removeAttachment", id: data?.id ?? temp.id },
          save: () => removeAttachment(data!.id),
        }),
      },
    );
    closeLink();
  }

  function upload(files: FileList | File[]) {
    const all = Array.from(files);
    const tooBig = all.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooBig.length) {
      toast(
        `${tooBig.map((f) => `“${f.name}”`).join(", ")} ${
          tooBig.length === 1 ? "is" : "are"
        } over 25 MB, so ${tooBig.length === 1 ? "it wasn’t" : "they weren’t"} attached.`,
      );
    }
    const supabase = createClient();
    for (const f of all.filter((x) => x.size <= MAX_FILE_BYTES && x.size > 0)) {
      const temp: Attachment = {
        id: `temp-${++tempSeq}`,
        kind: "file",
        name: f.name,
        url: null,
        storagePath: null,
        linkType: null,
        sizeBytes: f.size,
        addedBy: view.me.id,
        createdAt: new Date().toISOString(),
      };
      change(
        { type: "addAttachment", attachment: temp },
        async () => {
          const path = `${view.capsule.id}/${crypto.randomUUID()}/${safeName(f.name)}`;
          const { error: upErr } = await supabase.storage
            .from("attachments")
            .upload(path, f, { contentType: f.type || undefined, upsert: false });
          if (upErr)
            return { ok: false as const, error: `Couldn’t upload “${f.name}”. Try again.` };
          const r = await addAttachment({
            orgId: view.capsule.orgId,
            capsuleId: view.capsule.id,
            kind: "file",
            name: f.name.slice(0, 300),
            storagePath: path,
            sizeBytes: f.size,
            mimeType: f.type || null,
          });
          if (r.ok) track("attachment_added", { attachment_type: fileKind(f.name) });
          return r;
        },
        {
          message: `Attached “${f.name}”.`,
          undo: (data) => ({
            op: { type: "removeAttachment", id: data?.id ?? temp.id },
            save: () => removeAttachment(data!.id),
          }),
        },
      );
    }
  }

  function remove(a: Attachment) {
    change({ type: "removeAttachment", id: a.id }, () => removeAttachment(a.id), {
      message: `Removed “${a.name}”.`,
      undo: { op: { type: "addAttachment", attachment: a }, save: () => restoreAttachment(a.id) },
    });
  }

  async function openFile(a: Attachment) {
    if (!a.storagePath) return;
    // Open the tab now (browsers block tabs opened after a wait), then point it at the file.
    const tab = window.open("", "_blank");
    const r = await fileLink(a.storagePath);
    if (!r.ok) {
      tab?.close();
      toast(r.error);
      return;
    }
    if (tab) tab.location.assign(r.data!.url);
    else window.location.assign(r.data!.url);
  }

  const drop = canAdd
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          depth.current++;
          setDragging(true);
        },
        onDragLeave: () => {
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDragging(false);
        },
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        },
      }
    : {};

  const preview = url.trim() && looksLikeUrl(url) ? linkTypeFromUrl(normalizeUrl(url)) : null;

  return (
    <section aria-labelledby="att-h" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="att-h" className="text-base leading-6 font-semibold">
          Attachments{" "}
          {list.length > 0 && (
            <span className="font-normal text-muted-foreground">{list.length}</span>
          )}
        </h2>
        {canAdd && (
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Upload files"
              onChange={(e) => {
                if (e.target.files?.length) upload(e.target.files);
                e.target.value = "";
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="h-8 pr-3 pl-2.5">
                  <Plus size={14} />
                  Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px]">
                <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                  <UploadSimple size={14} />
                  Upload a file
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                  <LinkSimple size={14} />
                  Add a link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {linkOpen && (
        <div
          role="group"
          aria-label="Add a link"
          className="flex animate-rise flex-wrap items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
        >
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
            <label htmlFor="att-url" className="sr-only">
              Link
            </label>
            <input
              id="att-url"
              autoFocus
              autoComplete="off"
              value={url}
              aria-invalid={error ? true : undefined}
              placeholder="Paste a link to a doc, design, page or video"
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                } else if (e.key === "Escape") closeLink();
              }}
              className="h-9 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none placeholder:text-faint focus:border-control aria-[invalid=true]:border-c-red-fg"
            />
            <label htmlFor="att-title" className="sr-only">
              Name (optional)
            </label>
            <input
              id="att-title"
              autoComplete="off"
              maxLength={300}
              value={title}
              placeholder="Name (optional)"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                } else if (e.key === "Escape") closeLink();
              }}
              className="h-9 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none placeholder:text-faint focus:border-control"
            />
            {error ? (
              <span role="alert" className="text-xs text-c-amber-fg">
                {error}
              </span>
            ) : (
              preview && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Tile kind={preview} size={18} />
                  Adds as {preview === "link" ? "a link" : `a ${KIND_LABEL[preview]}`}
                </span>
              )
            )}
          </div>
          <div className="flex gap-1.5">
            <Button variant="primary" disabled={!url.trim()} onClick={addLink}>
              Add link
            </Button>
            <Button variant="quiet" onClick={closeLink}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div
          {...drop}
          className={cn(
            "flex items-center gap-2.5 rounded-2xl border border-dashed border-dash px-5 py-4 text-sm text-muted-foreground transition-colors",
            dragging && "border-control bg-subtle",
          )}
        >
          <UploadSimple size={16} aria-hidden="true" className="flex-none" />
          <span>
            Drop files here, or{" "}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="font-medium text-foreground hover:underline"
            >
              upload
            </button>{" "}
            or{" "}
            <button
              type="button"
              onClick={() => setLinkOpen(true)}
              className="font-medium text-foreground hover:underline"
            >
              add a link
            </button>
            . Specs, designs, decks and recordings all work.
          </span>
        </div>
      ) : (
        <ul
          {...drop}
          className={cn(
            "rounded-2xl border border-border bg-surface shadow-card transition-colors",
            dragging && "border-control bg-subtle",
          )}
        >
          {list.map((a) => {
            const pending = a.id.startsWith("temp-");
            const line = (
              <>
                <Tile kind={kindOf(a)} />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="truncate text-sm font-medium text-foreground">{a.name}</span>
                  <span className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                    {pending && a.kind === "file" ? "Uploading…" : attachmentLabel(a)} ·{" "}
                    {nameOf(a.addedBy)} · {fmtRelative(a.createdAt)}
                  </span>
                </span>
              </>
            );
            return (
              <li
                key={a.id}
                className={cn(
                  "group flex min-h-14 items-center gap-2 border-t border-divider py-2 pr-2 pl-4 first:border-t-0",
                  pending && "opacity-60",
                )}
              >
                {a.kind === "link" ? (
                  <a
                    href={a.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg no-underline"
                  >
                    {line}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => openFile(a)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
                  >
                    {line}
                  </button>
                )}
                {canRemove(a) && !pending && (
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => remove(a)}
                    className="inline-flex size-8 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-subtle hover:text-foreground focus-visible:opacity-100 laptop:opacity-0 laptop:group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canAdd && list.length > 0 && (
        <p className="-mt-1 text-xs text-muted-foreground">
          Drop files anywhere on the list to attach them.
        </p>
      )}
    </section>
  );
}
