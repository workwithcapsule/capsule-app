# Launch day

Do these in order. "You" steps are in a dashboard; "Claude" steps happen
when you say go. Each one says how to check it worked.

## Before the day (any time)

1. **Sentry (error alerts).** You: sign up at sentry.io (free plan), create a
   project of type **Next.js**, and copy its **DSN** (Project settings → Client
   keys). In Vercel → capsule-app → Settings → Environment Variables, add
   `NEXT_PUBLIC_SENTRY_DSN` = the DSN, for Production and Preview. Optional,
   for readable error details: also add `SENTRY_ORG`, `SENTRY_PROJECT` and a
   `SENTRY_AUTH_TOKEN` (Sentry → Settings → Auth Tokens; mark it Sensitive).
   *Check:* redeploy, then Sentry shows the project as "waiting for events"
   with no errors.
2. **PostHog (analytics, session replays, feature flags).** You: sign up at
   posthog.com (free plan, US or EU cloud), and copy the **Project API key**.
   In Vercel add `NEXT_PUBLIC_POSTHOG_KEY` (Production and Preview). If you
   picked the EU cloud, also add `NEXT_PUBLIC_POSTHOG_HOST` =
   `https://eu.i.posthog.com`. In PostHog → Settings → Session replay, turn
   recording on. *Check:* sign in to Capsule, click around, and PostHog's
   Activity shows your page views under your name.
3. **File clean-up.** You: in Vercel add `CRON_SECRET` = any long random
   string (mark it Sensitive), Production only. *Check:* Vercel → capsule-app →
   Settings → Cron Jobs lists `/api/cron/cleanup-files`, daily.

## On the day

1. **Domain.** You: Vercel → capsule-app → Settings → Domains → Add
   `app.workwithcapsule.com`. Vercel shows one DNS record (a CNAME); add it
   where workwithcapsule.com's DNS lives. *Claude checks* it shows Verified.
2. **Sign-in links.** You: Supabase → Authentication → URL Configuration.
   Set **Site URL** to `https://app.workwithcapsule.com` and add
   `https://app.workwithcapsule.com/**` to **Redirect URLs** (keep the
   vercel.app one for previews).
3. **Sign-in emails go through Resend.** You: Supabase → Authentication →
   Emails → SMTP Settings. It must be on, with host `smtp.resend.com`, port
   465, user `resend`, the password a Resend API key, and sender
   `hello@workwithcapsule.com` / "Christina from Capsule". (Supabase's own
   sender only allows a few emails an hour, which would break sign-ups.)
4. **Sign-in email wording.** You: Supabase → Authentication → Emails →
   Templates.
   - **Magic link:** subject `Your Capsule sign-in link`; body = the whole of
     `supabase/templates/magic-link.html`.
   - **Confirm signup:** subject `Confirm your email for Capsule`; body = the
     whole of `supabase/templates/confirm-signup.html`.
   *Check:* sign out, sign in, and the email has the Capsule mark and button.
5. **Real emails on.** *Claude* sets `EMAIL_MODE` = `live` for Production in
   Vercel and redeploys. *Check:* invite a second address of yours that isn't
   a Gmail "+" version; the invite arrives.
6. **Founding Builders.** You send Claude the admins' work emails. *Claude*
   adds them to the approval list in production. *Check:* each can sign up.
7. **Last: remove Example data.** *Claude* removes the examples, the
   Example data page and the `EXAMPLE_DATA_EMAILS` setting (a small pull
   request for you to merge). *Check:* the sidebar no longer shows Example
   data and the Examples space is gone.

## Turning on AI apps (step 13, once its pull request is merged)

Nobody can connect an AI app until this is on, so it's safe to merge first.

1. **Supabase OAuth server.** You: Supabase → Authentication → **OAuth Server**.
   Turn it on, set the **Authorization path** to `/oauth/consent`, and turn on
   **Allow dynamic client registration** (that's how Claude and ChatGPT add
   themselves). The Site URL from "On the day" step 2 must already be
   `https://app.workwithcapsule.com`.
2. **Try it.** You: in Claude, Settings → Connectors → **Add custom
   connector**, name it Capsule, address `https://app.workwithcapsule.com/mcp`.
   Claude opens Capsule's "Allow Claude to use Capsule as you?" page; click
   Allow. *Check:* ask Claude "What needs me in Capsule?", then see Claude in
   Capsule → Settings → Connected apps. Anything Claude changes shows in
   Activity as "Christina via Claude".

## Turning on Jira linking (step 14, once its pull request is merged)

Nobody sees a Jira option until this is done, so it's safe to merge first.

1. **Register Capsule with Atlassian.** You: go to
   developer.atlassian.com → your profile → **Developer console** → **Create** →
   **OAuth 2.0 integration**. Name it `Capsule`, agree to the terms, Create.
2. **Permissions.** In the app: **Permissions** → **Jira API** → Add →
   Configure. Under **Classic scopes**, add `read:jira-work` and
   `read:jira-user`. Save.
3. **Callback address.** **Authorization** → OAuth 2.0 (3LO) → Configure.
   Callback URL: `https://app.workwithcapsule.com/api/integrations/jira/callback`.
   Save.
4. **Let other companies use it.** **Distribution** → Edit → **Sharing**.
   Fill in the vendor name (Capsule), privacy policy link and the personal
   data question, and save. Without this, only your own Atlassian account can
   connect.
5. **Keys into Vercel.** **Settings** shows a **Client ID** and a **Secret**.
   In Vercel → capsule-app → Settings → Environment Variables (Production and
   Preview) add `ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET` (mark the
   secret Sensitive). *Claude* adds `INTEGRATIONS_ENCRYPTION_KEY` (a random key
   you never need to see) and redeploys.
6. **Try it.** Open a capsule, click the Jira button on a component's "Add a
   work item" line, connect your Jira account, search for an issue and link
   it. *Check:* the item shows its Jira key, status and assignee, and
   Settings → Connected apps shows Jira.
