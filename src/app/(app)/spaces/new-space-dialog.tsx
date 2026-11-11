"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { prefixError, suggestPrefix } from "@/lib/validation";
import { createSpace } from "./actions";

/** Anyone in the org can create a public space. They join it as its manager. */
export function NewSpaceDialog({ takenPrefixes }: { takenPrefixes: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixEdited, setPrefixEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");

  const shownPrefix = prefixEdited
    ? prefix
    : name.trim()
      ? suggestPrefix(name.trim(), takenPrefixes)
      : "";
  const nameError = name.trim() ? "" : "Give the space a name.";
  const prefixMsg = prefixError(shownPrefix, takenPrefixes);

  function reset() {
    setName("");
    setPrefix("");
    setPrefixEdited(false);
    setDescription("");
    setTried(false);
    setError("");
  }

  function submit() {
    setTried(true);
    if (nameError || prefixMsg) return;
    setError("");
    start(async () => {
      const r = await createSpace({ name, prefix: shownPrefix, description });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      toast(`Created ${name.trim()}. It’s in Your spaces now.`);
      router.push(`/spaces/${r.keyPrefix!.toLowerCase()}`);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary" size="md">
          <Plus size={16} />
          New space
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>New space</DialogTitle>
        <p className="-mt-2 text-[13px] leading-[18px] text-muted-foreground">
          Spaces group capsules by team, product or program. Anyone in your org can browse and join
          it.
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ns-name">Name</Label>
            <Input
              id="ns-name"
              autoFocus
              maxLength={80}
              placeholder="Customer Success"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={tried && nameError ? true : undefined}
            />
            <FieldError>{tried ? nameError : ""}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ns-prefix">Key prefix</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ns-prefix"
                className="w-20 font-mono uppercase"
                maxLength={4}
                placeholder="CS"
                value={shownPrefix}
                onChange={(e) => {
                  setPrefixEdited(true);
                  setPrefix(e.target.value.toUpperCase());
                }}
                aria-invalid={(tried || prefixEdited) && prefixMsg ? true : undefined}
                aria-describedby="ns-prefix-hint"
              />
              <span id="ns-prefix-hint" className="text-xs text-muted-foreground">
                Capsules here will be <span className="font-mono">{shownPrefix || "??"}-1</span>,{" "}
                <span className="font-mono">{shownPrefix || "??"}-2</span>… It can’t change later.
              </span>
            </div>
            <FieldError>
              {(tried || prefixEdited) && shownPrefix ? prefixMsg : tried ? prefixMsg : ""}
            </FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ns-desc">
              Description <span className="font-normal text-muted-foreground">· optional</span>
            </Label>
            <Input
              id="ns-desc"
              maxLength={200}
              placeholder="What this space is for"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="md" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Creating…" : "Create space"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
