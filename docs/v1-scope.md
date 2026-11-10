# Capsule V1 scope (Nov. 10 2026)

The coded prototype is a demo. This list covers the first real version only. The test for what's in: could a Founding Builders team run one real capsule across tech and business teams with it?

## In V1

**Accounts and org**
- Sign in by email (magic link)
- Create an org and invite teammates by email
- Profile: name and avatar
- Org components: Tech, Operations, Sales and Marketing by default. Admins can rename them and pick colors from the preset set.

**Onboarding**
- The full 5-step flow for the first person in an org, as specified in the design decisions, with V1 limits:
  1. Account: name, org and work email, using email sign-in (SSO comes later)
  2. Components: rename, describe, and pick colors and icons, or add your own
  3. Spaces: type the first space, with a suggested key prefix (public spaces only in V1)
  4. Connect tools: Jira, monday and the MCP tools shown as coming soon, so the step can be skipped
  5. Invite teammates, with email validation
- The welcome animation, then Home
- The invited-person flow: confirm your profile and usual areas, see your spaces and the capsules that already have something for you, then the welcome animation and Home

**Spaces**
- Create public spaces with a key prefix (EN, NA…)
- Browse, join and leave spaces

**Capsules**
- Create a capsule by hand: name, outcome, space, launch date, owner
- AI shaping: describe the outcome, get suggested components and work items, edit them on the review page, then create
- Orbit shaping motion while AI shapes the capsule, as specified in the design decisions (reduced-motion fallback included). It plays while the AI call runs, so the beads stand in for real loading time.
- Capsule status and keys (EN-1, EN-2…)
- Edit in place, with changes logged to Activity

**Components and work items**
- Each component has an owner, due date, status and collaborators
- Work items can be added, assigned to a person, and checked off

**Capsule page**
- Header, Overview stats, component tabs, Team and Activity
- Basic comments with @mentions (team members only)

**Attachments**
- A section under Components, as specified in the design decisions
- Team members upload files (Add menu or drag and drop) and add links. Files are stored in Supabase Storage with a size limit.
- Link types are read from the address: Figma, Google Docs, Sheets or Slides, Notion, Confluence, Loom, or a plain link. A missing name is filled in from the address, and duplicate or malformed links are flagged.
- Each row shows the type icon, name, type or size, who added it and when, and an optional component tag
- The person who added an item, or the capsule owner, can remove it, with Undo. Adding and removing both show in Activity.
- Followers see the list read-only and don't see the section when it's empty

**Follow**
- Follow or unfollow any capsule you can see
- Followers get a read-only view (Overview, then Activity, then components) and can't comment

**Home**
- Needs your attention: work items assigned to you, components you own, and unowned components on capsules you own
- Today's activity on capsules you're in or follow

**Basics**
- Search by name or key
- Email notifications through Resend when you're made an owner, assigned an item or @mentioned
- Settings: profile and appearance (light or dark)
- Simple roles: org admin, capsule owner, component owner, member, follower
- Desktop first

## Later (not V1)
- Agents, MCP, Delegate and the agent review drawer
- Jira and monday linking and sync
- Mentions popover and threaded replies
- Queue extras: remove reasons, Removed tab, full queue page
- Private spaces and per-capsule visibility options
- Moving capsules between spaces, including old-key lookup
- Drafts
- Google and Microsoft SSO
- Tablet and phone layouts
- Follower comments

## Decisions (Nov. 10 2026)
- AI shaping is in V1.
- Orbit is in V1. It's the signature moment for AI shaping.
- Full 5-step onboarding and the welcome animation are in V1.
- Attachments are in V1.
- Followers are read-only in V1.
