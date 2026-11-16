/**
 * The header every Capsule email shares: the mark and the "Capsule" wordmark.
 * The mark is a PNG served by the app (public/email), because Gmail and
 * other email apps block SVG. `origin` is the app's address.
 */
export function emailHeader(origin: string): string {
  const src = `${origin.replace(/\/$/, "")}/email/capsule-mark.png`;
  return `<tr><td style="padding-bottom:24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:8px;vertical-align:middle"><img src="${src}" width="26" height="20" alt="" style="display:block;border:0"></td>
<td style="font-size:18px;font-weight:600;letter-spacing:-0.02em;vertical-align:middle;color:#2A2523">Capsule</td>
</tr></table></td></tr>`;
}

/** The origin of a full URL, or "" if it isn't one. */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
