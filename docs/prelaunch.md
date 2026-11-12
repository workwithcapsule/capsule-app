# Before launch

Things to do before Capsule opens to Founding Builders teams. Add to this as
we go; tick items off in the pull request that does them.

## Design and motion

- [ ] **Welcome animation, aligned with Orbit.** The current welcome (title lifts
  in, text and button fade) matches the prototype. Before launch, rework it so
  it feels like part of the same motion family as Orbit: the frosted glass, the
  component beads in the org's own colors settling into place, the same easing
  and timing, with the reduced-motion fade kept. (Christina, Nov. 11 2026)
- [ ] Capsule logo and AI mark (Christina is designing these), then use the logo
  on sign-in, onboarding, the welcome screen and in emails.

## Email

- [ ] Switch invite emails to live: set `EMAIL_MODE=live` in Vercel (Production
  only). Until then, invites only go to `EMAIL_TEST_ALLOWLIST`.
- [ ] Final copy and styling for the Supabase sign-in email templates.

## Domain and settings

- [ ] Connect app.workwithcapsule.com to the Vercel project.
- [ ] In Supabase → Authentication → URL Configuration, change the Site URL to
  https://app.workwithcapsule.com and add it to Redirect URLs.
- [ ] Approve each Founding Builders admin's email in `signup_approvals`.

## Example data

- [ ] Remove the examples (Example data page → Remove examples), then remove
  the page itself (`src/app/(app)/dev/examples`, `src/lib/examples`) and the
  `EXAMPLE_DATA_EMAILS` setting in Vercel.
