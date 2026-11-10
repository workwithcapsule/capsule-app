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
