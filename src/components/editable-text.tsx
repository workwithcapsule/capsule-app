"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Edit in place (design-decisions.md section 10): click the text to edit; the
 * check (or Enter) saves and the X (or Esc) discards. No pencil icons.
 */
export function EditableText({
  value,
  onSave,
  label,
  placeholder,
  required,
  maxLength,
  className,
  inputClassName,
  multiline,
}: {
  value: string;
  onSave: (next: string) => Promise<boolean>;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  /** A two-line text box (for longer text like a capsule's outcome). Enter still saves. */
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const invalid = required && !draft.trim();

  async function save() {
    if (invalid) return;
    if (draft.trim() === value.trim()) return setEditing(false);
    setSaving(true);
    const ok = await onSave(draft.trim());
    setSaving(false);
    if (ok) setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        aria-label={`${label}: ${value || "empty"}. Click to edit.`}
        className={cn(
          "-mx-1.5 max-w-full self-start rounded-lg px-1.5 text-left hover:bg-subtle",
          !value && "text-faint",
          className,
        )}
      >
        {value || placeholder}
      </button>
    );
  }

  return (
    <span
      className={cn("-mx-1.5 flex gap-1", multiline ? "items-start" : "items-center", className)}
    >
      {(() => {
        const props = {
          ref: input,
          "aria-label": label,
          value: draft,
          maxLength,
          placeholder,
          disabled: saving,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setDraft(e.target.value),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          },
          "aria-invalid": invalid ? true : undefined,
          className: cn(
            "min-w-0 flex-1 rounded-lg border border-control bg-surface px-1.5 outline-none focus-visible:outline-none aria-[invalid=true]:border-c-red-fg",
            multiline && "resize-none py-1",
            inputClassName,
          ),
        };
        return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
      })()}
      <button
        type="button"
        aria-label="Save"
        title="Save (Enter)"
        disabled={saving || invalid}
        onClick={() => void save()}
        className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-primary text-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        aria-label="Discard"
        title="Discard (Esc)"
        disabled={saving}
        onClick={cancel}
        className="inline-flex size-8 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-subtle hover:text-foreground"
      >
        <X size={14} />
      </button>
    </span>
  );
}
