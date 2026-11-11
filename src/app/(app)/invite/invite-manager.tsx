"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { parseInvites } from "@/lib/validation";
import { addInvitations, removeInvitation, resendInvitation, sendInvitations } from "./actions";

export type InvitationRow = {
  id: string;
  email: string;
  sentAt: string | null;
  acceptedAt: string | null;
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));

function status(r: InvitationRow) {
  if (r.acceptedAt) return `Joined ${fmt(r.acceptedAt)}`;
  if (r.sentAt) return `Invite sent ${fmt(r.sentAt)}`;
  return "Not sent yet";
}

export function InviteManager({
  orgId,
  rows,
  domain,
  testMode,
}: {
  orgId: string;
  rows: InvitationRow[];
  domain: string;
  testMode: boolean;
}) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const existing = rows.filter((r) => !r.acceptedAt).map((r) => r.email);
  const check = draft.trim() ? parseInvites(draft, existing) : null;
  const unsent = rows.filter((r) => !r.sentAt && !r.acceptedAt);

  function add() {
    if (!check || check.error) return;
    setError("");
    start(async () => {
      const r = await addInvitations(orgId, check.emails);
      if (r.ok) setDraft("");
      else setError(r.error);
    });
  }

  function send(only?: string) {
    setError("");
    setNotice("");
    start(async () => {
      const r = only ? await resendInvitation(orgId, only) : await sendInvitations(orgId);
      if (!r.ok) return setError(r.error);
      const s = r.summary!;
      const parts = [];
      if (s.sent.length)
        parts.push(
          only
            ? `Sent a new invite to ${s.sent[0]}. Their old link no longer works.`
            : `Sent ${s.sent.length} invite${s.sent.length === 1 ? "" : "s"}.`,
        );
      if (s.held.length)
        parts.push(
          `Not sent yet (${testMode ? "test mode" : "email isn’t set up"}): ${s.held.join(", ")}.`,
        );
      if (s.failed.length) parts.push(`Couldn’t send to ${s.failed.join(", ")}. Try again.`);
      setNotice(parts.join(" ") || "Nothing to send.");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {testMode && (
        <p className="rounded-[10px] bg-c-amber px-3 py-2 text-[13px] text-c-amber-fg">
          Test mode: invite emails only go to approved test addresses. Others stay here, ready to
          send when Capsule goes live.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <label htmlFor="inv" className="sr-only">
            Email addresses
          </label>
          <Input
            id="inv"
            placeholder={`name@${domain}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            aria-invalid={check?.error ? true : undefined}
          />
          <Button
            variant={check && !check.error ? "primary" : "secondary"}
            size="lg"
            disabled={!check || Boolean(check.error) || pending}
            onClick={add}
          >
            Add
          </Button>
        </div>
        {check?.error ? (
          <FieldError>{check.error}</FieldError>
        ) : (
          <span className="text-xs text-muted-foreground">
            Separate several addresses with commas.
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="rounded-2xl border border-border bg-surface shadow-card">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-4 border-t border-divider px-5 py-3 first:border-t-0"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{r.email}</span>
                <span className="text-xs text-muted-foreground">{status(r)}</span>
              </span>
              {!r.acceptedAt && (
                <span className="flex flex-none gap-1">
                  {r.sentAt && (
                    <Button variant="quiet" disabled={pending} onClick={() => send(r.id)}>
                      Resend
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await removeInvitation(r.id, Boolean(r.sentAt));
                        if (!res.ok) setError(res.error);
                      })
                    }
                  >
                    {r.sentAt ? "Withdraw" : "Remove"}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {unsent.length > 0 && (
        <div>
          <Button variant="primary" size="lg" onClick={() => send()} disabled={pending}>
            {pending ? "Sending…" : `Send ${unsent.length} invite${unsent.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-[13px] text-muted-foreground">
          {notice}
        </p>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}
