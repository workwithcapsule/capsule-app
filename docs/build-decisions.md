# Build decisions (Nov. 10 2026)

Answers Christina gave before the build started. These sit alongside `v1-scope.md` and `design-decisions.md`.

## Contradictions, and which doc wins

- Followers are read-only and can't comment (V1 scope wins over the permissions table).
- The capsule page shows components as tabs (section 10 wins over section 2).
- The follower view runs Overview, then Activity, then components (section 14 wins over section 4).
- Onboarding is the 5-step V1 flow, with email sign-in and public spaces only (V1 scope wins over section 5).
- Home activity covers capsules you're in or follow (V1 scope wins over section 9).

## Open questions, answered

1. **Repo:** created fresh; Christina provides the GitHub repo to push to.
2. **Mentions:** not in the V1 sidebar. @mentions still send email.
3. **Capsules list page:** a simple all-capsules list is in V1.
4. **Icons:** Phosphor, Regular weight (matches the prototype's line weight).
5. **Appearance:** System, Light and Dark. Default is System.
6. **Previews:** the repo connects to Vercel for preview links on each push.
7. **Org components after onboarding:** an admin-only "Org components" tab in Settings.
8. **Component icons:** component types get an icon field.
9. **Leaving the new capsule flow with input:** ask "Discard" or "Keep editing" (no drafts in V1).
10. **Managing a space (name, members):** the person who created it, plus org admins.
11. **Org admins:** see everything, but edit or comment only where they're on the team.
12. **Needs your attention:** rows have a plain X with Undo, no reasons.
13. **Orbit when AI is fast:** the beads finish landing (about 2.75s) before morphing into the review page.

## Step 2 answers (Nov. 11 2026)

14. **Attachment file size limit:** 25 MB per file.
15. **Supabase region:** US East.
16. **Capsule date type:** "Launch date" or "Due date" (`date_type` is `launch` or `due`).

## Step 3 answers (Nov. 11 2026)

17. **Who can create an org during the beta:** only emails on the approved list (`signup_approvals`, managed in the Supabase dashboard). Everyone else sees "Capsule is invite-only for now" with a link to the waitlist, unless they've been invited.
18. **Step 3 is built in two parts:** 3a (sign-in, first-person onboarding, welcome) and 3b (invite emails and the invited person's flow).
19. **Sign-in:** email link only, no passwords and no 6-digit code.

## One-click invites (Nov. 11 2026)

20. **Invite links sign people straight in.** The invite email's link is private and single-use, and signs the invited person in on the spot (creating their account the first time), so there's no second sign-in email. After that they sign in with the usual emailed link. Links last **7 days**, stop working when used, withdrawn or replaced by a resend.
21. **Invites sent before this change** keep working the old way (sign in, then join). Resend any of them to get a one-click link.

## Step 4 answers (Nov. 11 2026)

22. **Creating spaces:** anyone in the org, from a **New space** button on Browse spaces.
23. **Managing a space in V1:** the creator and org admins can change its name and description. People join and leave themselves; removing members comes later.
24. **Space page capsule list:** a simple list now (key, name, status, owner); filters and sorting come with the Capsules page in step 5.
25. **Browse spaces layout (changes the prototype):** a **Your spaces** section first, then **Other spaces** (public spaces you haven't joined), each alphabetical. Nothing appears twice.

## Step 5 answers (Nov. 11 2026)

26. **Component goal:** each component has an optional goal ("What does done look like for Tech?"), as in the prototype.
27. **"Needs you here" strip:** built in step 8 together with Home's Needs your attention.
28. **New capsule:** goes straight to the "Set up your capsule" form until step 9 adds the AI composer in front of it.
29. **Step 5 in two parts:** 5a (creating capsules and the capsule page) and 5b (the Capsules page and adding or removing components).

## Step 6 answers (Nov. 12 2026)

30. **@mention emails** start in step 11 with the other notification emails. Mentions are saved from step 6.
31. **Comments:** people can delete their own comment (with Undo), but not edit it.
32. **Undo and Activity:** when a change is undone, its entry disappears from Activity, as if it never happened. The log itself keeps both.

## Step 7 answers (Nov. 13 2026)

33. **Follower view:** anyone who isn't on a capsule's team sees it, whether they follow it or not, with a + Follow button.
34. **Team members** don't get a Follow button (they see Share).
35. **Followers pill** is in V1: faces, count, "+N this week" and the list.

## Example data (Nov. 13 2026)

36. **Example data page** (`/dev/examples`) for the emails in `EXAMPLE_DATA_EMAILS`. Example teammates are "+" versions of Christina's email. Each step adds its example. Removed before launch.

## Step 8 answers (Nov. 14 2026)

37. **Removing a Home row** is remembered in a new `dismissals` table (added to the V1 tables), so it works across devices. A removed row comes back if it changes (for example, reassigned to you again).
38. **@mentions show on Home** as "Dana mentioned you in EX-1" rows in Needs your attention. They clear with X, or when you comment on that capsule.
39. **Agent attribution groundwork:** the activity log gets `source` (app, api, mcp) and `agent_client` now; the agent UI comes with the MCP work after V1.
40. **Multiple collaborators per work item** becomes a new **step 12**, before launch, together with a work item detail view and work item statuses.

## Step 9 answers (Nov. 14 2026)

41. **Shaping log and cap:** a new `shaping_requests` table records each shaping (who, org, model, tokens, time taken, and whether it was created, edited, discarded or failed). Each org can shape **30 capsules a day**; after that the Describe page says so and offers Fill in the fields.
42. **Orbit beads before Claude answers:** guessed from the words typed (as in the prototype) and colored right away, then corrected to the real components when the answer arrives.
43. **"Start a capsule" on Home:** yes, as in the prototype; sending from Home goes straight into Orbit.
44. **Model:** Claude Opus 5.5 at medium effort, set by `ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT`. If a safety filter declines a description, Anthropic retries on a fallback model.

## Step 10 answers (Nov. 14 2026)

45. **Removed files:** the stored copy is kept, so Undo always works; removed attachments stop showing everywhere. Deleting stored copies of files removed more than 30 days ago is on the pre-launch list (V1 has no background job runner).
46. **Component tags on attachments:** not in V1. The `component_id` column stays for later; the section shows no tags.

## Step 11 answers (Nov. 15 2026)

47. **When notification emails go out:** about 20 seconds after the change, and only if it's still true then (so Undo cancels the email, and quick edits don't spam people). Nobody is emailed about their own actions; followers aren't emailed. One combined email per person when a capsule is created.
48. **Turning emails off:** one switch in Settings → Profile ("Email me when I'm made an owner, assigned work or @mentioned"), on by default; every email links to it.
49. **Search:** capsules only, by name or key, with recent capsules shown when the box is empty.

## Step 12 answers (Nov. 15 2026)

50. **Work item statuses:** Not started, In progress, In review and Done (no Blocked; that stays for capsules and components). The checkbox and Done stay in step: checking an item off makes it Done, and Done checks it off.
51. **Work item detail view:** a 600px drawer from the right over the capsule page, like the prototype's drawer. Clicking a work item's title opens it. It has the title, status, assignee, notes, collaborators and the item's own Activity.
52. **Overall status with several people:** suggested from their pieces (all done → Done, any in review → In review, any started → In progress). It follows the pieces until someone sets it by hand; then the drawer shows "Suggested from the pieces: X · Use suggestion". The assignee, the lead, the component owner and the capsule owner can set it.
53. **Collaborators on a work item** (table `work_item_collaborators`): each has their part ("piece", up to 80 characters) and their own status; one can be the lead. They join the component's team like assignees. Each collaborator can change their own part and status, or leave. The assignee, the item's creator, the lead and the owners add and remove people and pick the lead. New collaborators get an email (the same 20-second rule) and a row on Home ("Your part: …"), except when they're also the assignee, where the item's own row covers it.

## Launch prep answers (Nov. 16 2026)

54. **Removed files** are deleted 30 days after removal by a daily Vercel Cron job (`/api/cron/cleanup-files`, protected by `CRON_SECRET`); the attachment row goes too, and Activity keeps its own copy of the name. Vercel Cron is a built-in scheduled request, not the job runner left out of V1.
55. **Monitoring:** Sentry for errors (browser and server, errors only, no request bodies) and PostHog for page views, session replays (everything typed is hidden) and feature flags. Both stay off until their keys are set in Vercel. Signed-in people are identified by id, name and email, and their org.
56. **Welcome animation:** a sketch first (docs/sketches/welcome-motion.html) before building it.
57. **Welcome animation, built:** as the sketch, with each bead showing its component's own icon and color (the org's components, in order, up to 8), like Orbit's beads. "Replay the welcome" is on the Example data page.

## Step 13 answers (Nov. 18 2026)

58. **What AI apps can do:** see (Needs your attention, your work items, capsule search, a capsule, your spaces) plus create a capsule, add a work item, change its status, title or notes, assign it and comment (work items have no due date of their own; components do). No removing, deleting, org settings or invites.
59. **Who can connect:** everyone in the org. Org-wide limits come later.
60. **Emails for AI-made changes:** sent as for a person's own change, saying "via Claude".
61. **How it's built:** the MCP server is a route in this app (`/mcp`, official TypeScript MCP SDK with Vercel's `mcp-handler`). Sign-in is Supabase's OAuth 2.1 server with dynamic client registration and a consent page at `/oauth/consent`. The AI app's token is a normal Supabase token for that person, so row-level security and `private.can()` apply unchanged. The database records the source (`mcp`) and the app's name on every event from the token itself, so it can't be faked.
62. **Costs:** none extra. The AI runs on the person's own Claude or ChatGPT plan; Capsule doesn't call the Claude API for MCP. Supabase's OAuth server is free during its beta; MCP requests use the same Vercel functions as the app.

63. **Checking an AI app's token:** Supabase doesn't let OAuth app tokens call its "who am I" endpoint, so the database checks them instead (`public.current_app_session`): signature and expiry, that the token was issued to an app, that its session hasn't ended and that the person still has the app connected. Disconnect in Settings revokes the approval, so the app's next request is refused.
64. **The app's badge:** a small purple sparkle in front of the person's avatar, with "via Claude" after their name. Real app logos can come later; the name always shows.
