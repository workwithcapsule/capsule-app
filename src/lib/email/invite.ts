/** The invitation email: "Christina invited you to Acme Partners on Capsule". */

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function inviteEmail(input: {
  inviterName: string;
  orgName: string;
  email: string;
  joinUrl: string;
  /** The link signs them straight in (single use, 7 days). */
  oneClick?: boolean;
}) {
  const { inviterName, orgName, email, joinUrl, oneClick } = input;
  const fine = oneClick
    ? `This link is just for you and works once, for 7 days. After that, sign in with ${email}.`
    : `Sign in with ${email} to join.`;
  const subject = `${inviterName} invited you to ${orgName} on Capsule`;
  const text = [
    `${inviterName} invited you to join ${orgName} on Capsule, where teams follow one outcome from idea to launch.`,
    "",
    `Join ${orgName}: ${joinUrl}`,
    "",
    `${fine} If you weren’t expecting this, you can ignore this email.`,
  ].join("\n");

  // Inline styles only: email apps ignore stylesheets. Stone palette, light.
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAF9F7;font-family:Geist,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#2A2523">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;padding:40px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E6E1DE;border-radius:16px;padding:32px">
<tr><td style="font-size:18px;font-weight:600;letter-spacing:-0.02em;padding-bottom:24px">Capsule</td></tr>
<tr><td style="font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.02em;padding-bottom:12px">${esc(inviterName)} invited you to ${esc(orgName)}</td></tr>
<tr><td style="font-size:15px;line-height:22px;color:#5F5854;padding-bottom:24px">Capsule brings tech and business teams into one place, so everyone can follow an outcome from idea to launch.</td></tr>
<tr><td style="padding-bottom:24px"><a href="${esc(joinUrl)}" style="display:inline-block;background:#DCD6D2;color:#2A2523;text-decoration:none;font-size:14px;font-weight:500;padding:11px 18px;border-radius:999px">Join ${esc(orgName)}</a></td></tr>
<tr><td style="font-size:13px;line-height:18px;color:#5F5854">${esc(fine)} If you weren’t expecting this, you can ignore this email.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { subject, html, text };
}
