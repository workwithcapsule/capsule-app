/*
 * Notification emails (step 11): made an owner, assigned a work item,
 * @mentioned, and added to a new capsule. Same look as the invite email.
 */

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export type Email = { subject: string; html: string; text: string };

/** The shared layout: heading, a few lines, an optional quote, one button, a footer. */
function layout(input: {
  heading: string;
  lines: string[];
  quote?: string;
  button: { label: string; url: string };
  settingsUrl: string;
}): Omit<Email, "subject"> {
  const { heading, lines, quote, button, settingsUrl } = input;
  const footer =
    "You’re getting this because you’re on this capsule’s team. You can turn these emails off in Settings.";
  const text = [
    heading,
    "",
    ...lines,
    ...(quote ? ["", `“${quote}”`] : []),
    "",
    `${button.label}: ${button.url}`,
    "",
    `${footer} ${settingsUrl}`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAF9F7;font-family:Geist,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#2A2523">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;padding:40px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E6E1DE;border-radius:16px;padding:32px">
<tr><td style="font-size:18px;font-weight:600;letter-spacing:-0.02em;padding-bottom:24px">Capsule</td></tr>
<tr><td style="font-size:20px;line-height:26px;font-weight:600;letter-spacing:-0.02em;padding-bottom:12px">${esc(heading)}</td></tr>
${lines.map((l) => `<tr><td style="font-size:15px;line-height:22px;color:#5F5854;padding-bottom:8px">${esc(l)}</td></tr>`).join("\n")}
${quote ? `<tr><td style="padding:8px 0 8px"><div style="border-left:3px solid #E6E1DE;padding:4px 0 4px 12px;font-size:15px;line-height:22px;color:#2A2523">${esc(quote)}</div></td></tr>` : ""}
<tr><td style="padding:16px 0 24px"><a href="${esc(button.url)}" style="display:inline-block;background:#DCD6D2;color:#2A2523;text-decoration:none;font-size:14px;font-weight:500;padding:11px 18px;border-radius:999px">${esc(button.label)}</a></td></tr>
<tr><td style="font-size:12px;line-height:18px;color:#8A827D">${esc(footer)} <a href="${esc(settingsUrl)}" style="color:#5F5854">Notification settings</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return { html, text };
}

type Common = {
  actor: string;
  capsuleKey: string;
  capsuleName: string;
  url: string;
  settingsUrl: string;
};

export function ownerOfComponentEmail(
  i: Common & { component: string; dueDate: string | null },
): Email {
  const subject = `${i.actor} made you the owner of ${i.component} on ${i.capsuleKey}`;
  return {
    subject,
    ...layout({
      heading: `${i.actor} made you the owner of ${i.component}`,
      lines: [
        `${i.component} is part of ${i.capsuleKey} ${i.capsuleName}.${i.dueDate ? ` It’s due ${i.dueDate}.` : ""}`,
      ],
      button: { label: `Open ${i.capsuleKey}`, url: i.url },
      settingsUrl: i.settingsUrl,
    }),
  };
}

export function ownerOfCapsuleEmail(i: Common): Email {
  const subject = `${i.actor} made you the owner of ${i.capsuleKey} ${i.capsuleName}`;
  return {
    subject,
    ...layout({
      heading: `${i.actor} made you the owner of ${i.capsuleName}`,
      lines: [`You’re now accountable for ${i.capsuleKey} landing.`],
      button: { label: `Open ${i.capsuleKey}`, url: i.url },
      settingsUrl: i.settingsUrl,
    }),
  };
}

export function assignedEmail(i: Common & { title: string; component: string }): Email {
  const subject = `${i.actor} assigned you “${i.title}” in ${i.capsuleKey}`;
  return {
    subject,
    ...layout({
      heading: `${i.actor} assigned you “${i.title}”`,
      lines: [`It’s part of ${i.component} on ${i.capsuleKey} ${i.capsuleName}.`],
      button: { label: "Open the work item", url: i.url },
      settingsUrl: i.settingsUrl,
    }),
  };
}

export function mentionEmail(i: Common & { body: string }): Email {
  const subject = `${i.actor} mentioned you in ${i.capsuleKey} ${i.capsuleName}`;
  return {
    subject,
    ...layout({
      heading: `${i.actor} mentioned you in ${i.capsuleName}`,
      lines: [],
      quote: i.body.length > 600 ? `${i.body.slice(0, 597)}…` : i.body,
      button: { label: "Reply in Capsule", url: i.url },
      settingsUrl: i.settingsUrl,
    }),
  };
}

export function addedToCapsuleEmail(
  i: Common & { ownsCapsule: boolean; owns: string[]; items: string[] },
): Email {
  const lines: string[] = [];
  if (i.ownsCapsule) lines.push(`You’re the capsule owner.`);
  if (i.owns.length) lines.push(`You own ${listJoin(i.owns)}.`);
  if (i.items.length === 1) lines.push(`“${i.items[0]}” is assigned to you.`);
  else if (i.items.length > 1)
    lines.push(
      `${i.items.length} work items are assigned to you: ${listJoin(i.items.map((t) => `“${t}”`))}.`,
    );
  const subject = `${i.actor} added you to ${i.capsuleKey} ${i.capsuleName}`;
  return {
    subject,
    ...layout({
      heading: `${i.actor} added you to ${i.capsuleName}`,
      lines,
      button: { label: `Open ${i.capsuleKey}`, url: i.url },
      settingsUrl: i.settingsUrl,
    }),
  };
}

export function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
