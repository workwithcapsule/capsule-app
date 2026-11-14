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
