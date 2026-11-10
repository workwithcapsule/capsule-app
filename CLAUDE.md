# Capsule — build brief for Claude Code

Capsule is an AI-first work orchestration platform. It brings tech and business teams into one place, so that one outcome (a capsule) can be followed from idea to launch across every team's part of it (components). This repo, `capsule-app`, is the real V1 product. The marketing and waitlist site lives separately in `capsule-web`.

I'm Christina, the solo founder. I'm a product owner, not an engineer, so read "How to work with me" before doing anything.

## Read these first (in `/docs`)

| File | What it is | How to use it |
|---|---|---|
| `v1-scope.md` | What's in V1 and what isn't | **The source of truth for what to build.** If another doc describes a feature that's on the "Later" list here, don't build it. |
| `design-decisions.md` | Detailed behavior, copy, layout, visual system, permissions | How each V1 feature should behave and look. Follow it exactly unless V1 scope limits it. |
| `tech-stack.md` | Stack, first-pass schema, early decisions | The architecture to follow, trimmed by the V1 notes below. |
| `prototype.html` | The clickable demo | **Visual and interaction reference only.** Match its look, copy and motion (especially Orbit). Don't copy its code structure or grow it into the app: it's a plain-JavaScript demo on sample data. |

If two docs disagree, `v1-scope.md` wins, then `design-decisions.md`. If something is still unclear, ask me. Don't guess.

## Stack (V1)

- **App:** Next.js (App Router), React, TypeScript, hosted on Vercel at app.workwithcapsule.com
- **UI:** Tailwind and shadcn/ui (Radix). Use the Stone palette, status pill colors and the 10 component colors from `design-decisions.md` as Tailwind theme variables, with light and dark mode. Type is Geist and Geist Mono. Icons are Phosphor, thin line style.
- **Database, sign-in and files:** Supabase. Postgres with row-level security, email magic-link sign-in, and Storage for attachments.
- **AI:** the Claude API with structured output, for shaping a capsule from a description. Keep the model name in an environment variable.
- **Email:** Resend, sending from hello@workwithcapsule.com as "Christina from Capsule"
- **Monitoring:** Sentry for errors and PostHog for analytics, session replays and feature flags

**Not in V1:** a background job runner (Inngest or Trigger.dev), the MCP server, Jira and monday sync, Google and Microsoft SSO, WorkOS. Don't add them, but don't design anything that blocks them later.

## Data rules

- Start from the schema in `tech-stack.md`. **For V1, build only:** orgs, users, org_members, spaces, space_members, component_types, capsules, components, component_people, work_items, followers, events, mentions, plus a new **attachments** table (capsule_id, component_id optional, kind file or link, name, url or storage path, link type, size, added_by).
- Leave out for now: agents, integrations, drafts, queue_items and capsule_old_keys. In V1, "Needs your attention" is worked out by query from work items and components.
- Keep the forward-compatible columns that cost nothing, such as `spaces.is_private` (always false in V1), `capsules.visibility` (always org in V1) and the work item source fields (always none).
- **Every row carries its org_id.**
- **Permissions live in one place:** a single database function answers "can this person see or edit this?", and every row-level security policy uses it. Use the permissions table in `design-decisions.md`, simplified to the V1 roles: org admin, capsule owner, component owner, member, follower. Followers are read-only and can't comment.
- **Activity is an append-only event log** (`events`). One stream drives Activity, @mentions, email notifications and Undo.
- **Keys are separate from IDs.** A capsule has an internal id and a number, and its key is the space prefix plus that number (EN-1).
- Storage access follows capsule visibility, and uploads have a file size limit.
- Write tests for the access rules, checking what each persona can and can't see.

## Build order

Do one step at a time, and tell me when a step is ready to check.

1. Repo setup, design tokens, layout shell (responsive sidebar per the design decisions)
2. Supabase schema, the permission function, row-level security, and access tests
3. Sign-in, and onboarding for both the first person in an org and invited people (5 steps plus the welcome animation)
4. Spaces: create, browse, join and leave
5. Capsules, components and work items, with editing in place
6. The event log, then Activity, comments and @mentions
7. Follow and the follower view
8. Home: Needs your attention and today's activity
9. AI shaping, with Orbit and the review page
10. Attachments
11. Email notifications, search, Settings

## Orbit

Orbit is a V1 must-have. Build it as specified in `design-decisions.md` and as it looks in `prototype.html`. One change from the motion study: its timing is fixed at about 3.3s, but the AI call takes a variable time. So the beads keep orbiting until the shaping response comes back, and only then does each bead morph into its real component row. With reduced motion on, skip straight to the review page with a fade. If the AI call fails, show a clear error and let me fill in the fields myself.

## How to work with me

- **Before a big change** (a new feature, a schema change, adding a package), tell me your plan in plain language and wait for my OK.
- **After each piece of work,** summarize what changed in a few plain sentences, then tell me exactly how to check it in the browser (which page, what to click, what I should see).
- Keep changes small: one feature per session, committed when it works.
- Explain any error in plain terms along with what you're doing about it.
- Never put secrets in code. Use `.env.local` and Vercel environment variables, and keep `.env.example` up to date.
- Ask before deleting data, running anything against production, or sending email to anyone but me.

## Definition of done

A feature is done when it:
- matches `design-decisions.md` and the prototype
- works in light and dark mode
- respects reduced motion
- holds up at the wide, laptop and narrow sidebar widths (desktop first, phone just mustn't break)
- is covered by access-rule tests where it touches data
- passes type checks and lint, and is committed
- sends no real email except to me while testing
