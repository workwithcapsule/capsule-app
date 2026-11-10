# Tech stack and first-pass schema

A recommendation for building the real V1, drafted Nov 6. It assumes a small team (mostly Christina, building with AI coding tools) and a product sold to companies like finance firms, where leaking a private capsule would be serious. The coded prototype is a plain-JavaScript demo and isn't the base for this; what carries over is the design tokens, this data model, the copy and the interaction rules.

## The stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js, React, TypeScript, hosted on Vercel | One language for front end, back end and the MCP server. The most common stack, so AI coding tools are strongest on it and it's easy to hire for. |
| UI | Tailwind and shadcn/ui (built on Radix) | Radix handles the hard parts the prototype leans on: menus, popovers, dialogs, focus and keyboard. The Stone tokens and dark mode map straight onto Tailwind variables. |
| Database and sign-in | Supabase: Postgres, Google and Microsoft sign-in, realtime, file storage | Postgres row-level security enforces private spaces, "only people on the capsule" and follower access inside the database, so a missed check in app code can't leak data. |
| Background work | Inngest or Trigger.dev | Jira and monday sync, incoming webhooks, retries and scheduled digests run outside web requests. |
| AI | Claude API with structured output | Shaping a capsule from one sentence: components, owners, dates, first work items. |
| Agents | MCP server built with the official TypeScript MCP SDK, behind OAuth | Claude, ChatGPT and other MCP apps connect with the person's own permissions, and every action is recorded as on behalf of that person. |
| Email | Resend | Invites, mentions, digests. |
| Monitoring and analytics | Sentry for errors, PostHog for product analytics and feature flags | PostHog session replays also help with user tests. |

**Later, only when needed:** WorkOS for SAML single sign-on and SCIM user provisioning when enterprise customers ask for it. A separate backend (NestJS or Hono, still TypeScript) only if one app stops being enough.

## Decisions to make early

- **Every row carries its org.** Write the row-level security policies once, and test them with each persona's view (Christina, Dana, Jon, Bob).
- **Activity is an append-only event log.** One stream drives the Activity feed, Mentions, notifications, Undo and the follower view. Each event stores who acted, through which agent, and on whose behalf.
- **Synced items keep their source.** Store the tool, item key, link and last sync time. Completion stays locked to the source tool, as decided.
- **Keys are separate from IDs.** A capsule keeps one internal id and a number; its key (EN-142) is the space prefix plus that number. Old keys are kept so they still open the capsule after a move.
- **Permissions live in one place.** One database function answers "can this person see this capsule?" and everything else uses it.

## First-pass schema

Based on the prototype's sample data. Every table also has id, created\_at and updated\_at.

| Table | Key columns | Notes |
| --- | --- | --- |
| orgs | name, email\_domain | Acme Partners |
| users | email, name, avatar\_url |  |
| org\_members | org\_id, user\_id, role (admin or member), usual\_area | Role drives Settings visibility |
| spaces | org\_id, name, key\_prefix, is\_private | Prefix 2 to 4 letters, unique per org |
| space\_members | space\_id, user\_id, role (admin or member) | Matters for private spaces and "space members" visibility |
| component\_types | org\_id, name, color, description | The org's components; color is one of the fixed 10 |
| capsules | org\_id, space\_id, number, name, outcome, status, launch\_date, date\_type, owner\_id, visibility (org, space or team), archived\_at | Key = space prefix + number |
| capsule\_old\_keys | capsule\_id, key | So EN-142 still opens a capsule that moved to PP |
| components | capsule\_id, component\_type\_id, owner\_id, due\_date, status, position |  |
| component\_people | component\_id, user\_id or agent\_id, role (owner or collaborator) | Assignees join automatically |
| work\_items | component\_id, title, assignee (user or agent), done, note, source (none, Jira or monday), source\_key, source\_url, synced\_at | Synced items: done comes from the source |
| followers | capsule\_id, user\_id |  |
| agents | org\_id, owner\_user\_id, name, app (Claude, ChatGPT or other), permissions | An agent always belongs to one person |
| events | org\_id, capsule\_id, actor\_user\_id, actor\_agent\_id, on\_behalf\_of, kind, data, parent\_event\_id | The activity log. parent\_event\_id makes comment threads |
| mentions | event\_id, user\_id, read\_at | Reading doesn't clear the matching Ask |
| queue\_items | user\_id, capsule\_id, kind, source\_event\_id, status (open, done or removed), removed\_reason, delegated\_agent\_id, resolved\_at | "Needs your attention" |
| drafts | user\_id, data | Unfinished new capsules |
| integrations | org\_id, tool, encrypted tokens, status | Admin-only |

**The visibility rule, in one sentence:** a person can see a capsule if they're on its team; otherwise, in a private space only its members can, and in a public space it depends on the capsule's visibility (everyone in the org, members of the space, or nobody beyond the team).

## Suggested build order

1. Sign-in, orgs, spaces and the permission rule, with tests.
2. Capsules, components and work items, with inline editing.
3. The event log, then Activity, Mentions and comment threads on top of it.
4. Needs your attention (queue items) and the Home page.
5. Shaping a new capsule with the Claude API.
6. Jira sync, then monday.
7. The MCP server and agent review.
8. Onboarding, Settings, email.
