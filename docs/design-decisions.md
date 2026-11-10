# Capsule — Design Decisions

Decisions from a voice working session on November 5, 2026. These build on the homepage, full queue, Capsules list and New capsule prototypes.

## 1. Leaving the new capsule flow

When someone leaves the new capsule flow partway through, ask what to do with their work.

- **Only ask if something was entered.** Leaving an untouched form doesn't trigger a prompt.
- **Three choices:** Save as draft, Discard, Keep editing.
- **Where drafts live:** a Drafts filter on the Capsules page, plus a "Resume draft" prompt the next time the person clicks New capsule.

## 2. Capsule page — overall layout

The capsule page is where people land from an attention item or from "Open capsule."

- **Top of the page:** capsule name, outcome, status, owner and launch date.
- **"Needs you here" strip:** directly under the header, listing only the current person's items in this capsule.
- **Overview stays close:** the overall picture sits right below, with no extra clicks to reach it.
- **One scrolling page, not tabs.**
  - Main column: components, each showing its owner, due date, progress and work items.
  - Side panel: the capsule team and this capsule's activity feed, including agent actions.
- **AI chat is out of V1.** The floating "Ask about this capsule" chat was cut from V1 (decided Nov 5, hi-fi review). Delegating to an agent happens through the Delegate button.
- **Inline editing:** click a field (date, owner, collaborators and so on) to change it in place. No separate Edit capsule screen.

## 3. Component order — involvement first

Beyond "Needs you here," components are ordered by whether the person is involved in them.

- Components where the person is the **owner or a collaborator** appear first.
- Components they aren't involved in follow.
- Decided: within each group, order by status, then nearest due date. Components show as tabs (section 10).

## 4. Follower view

Someone who only follows a capsule has no responsibilities in it, so the page should look different.

- **No "Needs you here" strip.** Followers have nothing assigned.
- **Lead with Activity: the same Activity feed collaborators see, with the same name, just placed higher on the page. For followers it shows** date shifts, status changes, scope changes and finished milestones.
- **Components ordered by risk:** blocked or at-risk components first, since that's what a stakeholder cares about most.
- **Lighter editing:** followers likely can't edit fields inline. Permissions are still to be decided.
- **Follow and unfollow:** a "Following" button with Unfollow inside; after unfollowing it becomes "+ Follow." No "Ask to join."

## 5. Onboarding

Onboarding has two paths: the first person setting up an organization, and people invited into an existing one.

**First person in an organization**

1. Sign up (work Google or Microsoft account, or email) and name the organization.
2. Set up components: start from defaults (Tech, Operations, Sales, Marketing), rename, edit descriptions inline, pick each one's color, or add your own.
3. Create your first spaces, each public or private.
4. Connect tools: Jira, monday, or skip for now.
5. Use Capsule from Claude or ChatGPT: explain that agents connect from those apps, with a link to connect.
6. Invite teammates, then finish with a short welcome animation and land on the homepage. No "create your first capsule" step.

**Invited person**

1. Confirm your profile and the areas you usually work in.
2. See your spaces and the capsules in them that already have something for you.
3. Finish with the welcome animation and land on the homepage. The homepage is not a step.

## 6. Agents and integrations (V1)

- **Agents connect through an MCP server.** People use Capsule from Claude or ChatGPT instead of setting up agents inside Capsule.
- **Attribution:** each action through that connection is tagged with the app that sent it and the person who approved it, for example "done by Claude, on behalf of Christina."
- **Not in V1:** telling apart actions an agent took on its own from ones a person asked for. Every agent action is shown the same way.
- **Jira and Monday:** both have public APIs and support OAuth. Register Capsule as an app in each developer portal; marketplace listing comes later.

## 7. Next before high fidelity

Wireframe these, then move to a coded high-fidelity prototype:

- The capsule page (sections 2–4, 10): wireframed
- Reviewing an agent's finished work: wireframed
- Onboarding (section 5): wireframed
- Color direction (section 11): chosen

Settings and the notifications page can be designed directly in high fidelity.

## 8. Spaces

Spaces group capsules by team, product or program for larger orgs. A space is a home, not a wall: being on a capsule gives access to it, whatever its space.

- **One space per capsule.** Anyone can still be added to any capsule.
- **Open by default.** Anyone can browse and join a public space. Private spaces are invite-only.
- **Creating spaces:** anyone can create a public space; only admins can create a private one.
- **No following a whole space** for now. People follow individual capsules.
- **Private spaces limit visibility.** A capsule in a private space is visible only to that space's members and the capsule team.
- **Space defaults:** a space can carry its usual components, which AI starts from when shaping a capsule.
- **One level only:** Org → Space → Capsule → Component → Work item. No nested spaces.
- **Where it shows:** "Your spaces" in the sidebar, a Space field in New capsule (suggested by AI), a Space filter on the Capsules page, the space in the capsule breadcrumb, and a Spaces step in onboarding. The homepage stays cross-space.

## 9. Navigation, Mentions and creating capsules

The sidebar holds New capsule, Search, Home (with the queue count), Mentions, Capsules, Your spaces, Settings and your profile. Agent permissions live in account settings, not a separate tab.

- **Mentions replaces Notifications.** It opens a quick popover of mentions with an unread count. A mention that needs a reply is also an Ask in your queue, labeled "Also in your queue."
- **Mentions and Asks stay in step.** Replying to an Ask from Home marks its mention as read. Reading a mention does not clear the Ask, because reading isn't answering; only acting on the Ask clears it.
- **Needs your attention:** one-line rows that expand on click, capped at 5 on the homepage, with a full queue page (Waiting on you and Removed tabs, filter by type). Each row shows when it entered the queue. The main button always goes into the capsule.
- **Removing an item:** an X on hover opens reasons (Already done, Not relevant to me, Someone else is handling it, Remind me tomorrow), with Undo.
- **Delegate:** one button everywhere, opening an agent picker.
- **Activity:** today only, for capsules you follow. Agents appear as layered avatars in front of the person they act for.
- **New capsule:** type the outcome and press the send button (Enter sends). "Rather set it up yourself? Fill in the fields" opens a blank capsule. Fields: Name, Outcome, Space, Launch/due date, Date type, Capsule owner, Visible to, Team, and per component an owner, due date, collaborators and work items.
- **Work items at creation:** added by hand, each assignable to a person or agent. The assignee joins that component and the capsule team, and is removed again once they have no work items left there.
- **Drafts:** any number, listed on the Describe step ("Pick up where you left off") and reachable from the Drafts filter on the Capsules page, with a count (Drafts left the sidebar on Nov 6). Leaving the flow with input asks Save as draft, Discard or Keep editing.

## 10. Capsule page details

These refine sections 2–4 after building the wireframe.

- **Components as tabs,** one per component, so the page doesn't scroll forever. Your components come first with a shaded tab; within each group, order by status, then nearest due date.
- **Editing in place:** click a field to edit; a small check saves and an X discards (Enter / Esc). No pencil icons. Changes log to Activity only once saved.
- **Needs you here:** the same X and reasons menu as the homepage, and the same Delegate picker.
- **Followers:** a followers pill in the header (faces, count, "+3 this week") opens the list. Followers see a "Following ⌄" button with Unfollow inside; after unfollowing it becomes "+ Follow." No "Ask to join."
- **Team:** agents sit behind the avatar of the person they act for, not in rows of their own.
- **Overview:** days to launch, components done, work items done, and components with no owner.
- **Agent review:** a drawer with attribution ("Done by Scout (Claude) on behalf of Christina"), what the agent did, what it flagged, the draft, and Approve and share / Request changes / Edit it myself / Discard.
- **AI chat:** not in V1.
- **Synced work items:** a tag with the tool's icon (Jira, monday) and the item key, linking to the original. Their checkbox is locked because status comes from the source tool. The broader sync strategy is still to be decided.

## 11. Statuses and color

Palette A, "Stone," is the direction: warm neutrals with no brand accent, in light and dark mode. Color only carries meaning, through statuses and component labels. Status pills show the word only, with no dot or icon.

| Status | Color | Light (background / text) | Dark (background / text) |
| --- | --- | --- | --- |
| Not Started | Gray | #EEEAE6 / #4A443F | #2A2725 / #D6D0CA |
| In Progress | Blue | #DBEAFE / #1E40AF | #1E2A4A / #93C5FD |
| In Review | Amber | #FEF3C7 / #92400E | #3A2A10 / #FCD34D |
| Done | Green | #DCFCE7 / #166534 | #13301F / #86EFAC |
| Blocked | Red | #FEE2E2 / #991B1B | #3B1616 / #FCA5A5 |

- **Component colors:** a fixed set of 10 (Blue, Teal, Green, Olive, Amber, Orange, Red, Pink, Purple, Gray), each with light and dark versions. Defaults: Tech blue, Operations teal, Sales green, Marketing orange, Compliance purple, Support amber, Legal gray, Design pink, Finance olive; custom components get the next unused color. Admins change them only within the set, in onboarding or component settings.
- **Neutrals:** light background #FAF9F7 (lightened from #F7F5F3 during hi-fi), surface #FFFFFF, text #2A2523, muted #5F5854; dark background #171513, surface #1F1C1A, text #F1ECE8, muted #B3ABA4. Body text passes 4.5:1 in both modes.
- **Icons:** Phosphor-style thin line icons; the person and calendar icons label component owner and due date. AI and agents use a placeholder in mocks and the agent's own logo in production.

## 12. Permissions (draft)

Who can do what on a capsule. ✓ means allowed. "Own" means only on their own component or item.

| Action | Capsule owner | Component owner | Collaborator | Follower | Space admin | Org admin |
| --- | --- | --- | --- | --- | --- | --- |
| View the capsule | ✓ | ✓ | ✓ | ✓ | ✓ | Public spaces only |
| Follow or unfollow | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Comment and @mention | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Create a capsule in the space | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit capsule name, outcome, launch date | ✓ | — | — | — | ✓ | — |
| Change capsule status | ✓ | — | — | — | ✓ | — |
| Add or remove components | ✓ | — | — | — | ✓ | — |
| Edit a component's owner, due date, status | ✓ | Own | — | — | ✓ | — |
| Add or remove collaborators | ✓ | Own | — | — | ✓ | — |
| Create work items | ✓ | ✓ | ✓ | — | ✓ | — |
| Assign work items | ✓ | Own | To self | — | ✓ | — |
| Complete a work item | ✓ | Own | If assigned | — | — | — |
| Delegate to their own agent | ✓ | ✓ | ✓ | — | — | — |
| Approve agent work | Own agent | Own agent | Own agent | — | — | — |
| Archive or delete the capsule | ✓ | — | — | — | ✓ | — |
| Manage the space (members, name) | — | — | — | — | ✓ | ✓ |
| Create a space | Public | Public | Public | Public | Public | Public and private |
| Manage component types and colors | — | — | — | — | — | ✓ |
| Connect integrations | — | — | — | — | — | ✓ |
| Set agent limits for the org | — | — | — | — | — | ✓ |

Rules behind the table:

- In a private space, only its members can see its capsules, whatever their role.
- Agents act with the permissions of the person they work for, and only within the org's agent limits.
- Synced Jira and monday items: title edits stay in Capsule, and completion is locked to the source tool (no write-back in V1).
- **Capsule visibility** can be changed in place by the capsule owner or a space admin: everyone in the org, members of the capsule's space, or only people on the capsule. In a private space it is locked to space members. Switching to "only people on the capsule" warns that followers outside the team will lose access.

To confirm:

- Can followers comment, or only read?
- Can an org admin see private spaces they are not a member of?
- What happens to a capsule when its owner leaves the company?

## 13. Prototype scope

- The coded prototype is a clickable demo on sample data, for user testing and investor demos. It is not the first version of the real app.
- Desktop first. Phone screens only need to not break.
- Walkthrough and cast: Demo script
- Build handoff for the coded prototype: Prototype handoff
- Recommended stack and first-pass schema for the real V1: Tech stack
- First pricing idea, compared with Jira, Linear and monday: Pricing idea

## 14. Decisions from the prototype review (Nov 5–6)

Decided while building and reviewing the coded prototype. Where a decision changes an earlier section, it says which.

- **Settings show only what you can change.** A global rule: if a person can't act on a setting, it doesn't appear. Connected tools and Org components show for org admins only. Locked agent permissions are hidden too.
- **Follower view order.** Overview comes first, then Activity, then components ordered by risk. There's no "Needs you here" strip. (Updates section 4.)
- **Pick-and-save editing.** Status, owner and visibility: click the field, pick from a menu, and it saves right away with Undo in a toast. Dates: clicking opens the date picker, picking a date saves, and clicking away cancels. Name and outcome keep the check and X. Visibility still warns before followers lose access. (Updates section 10, editing in place.)
- **Space pages.** Clicking a space opens "\[Space\] capsules", whether it's public or private, its member count and a link back to All capsules. Filter counts only count that space, and the Drafts filter is hidden there.
- **Threaded comments and mentions.** Replies attach to the comment they answer. Capsule Activity shows each thread with replies nested and a Reply link, and a thread moves up when it gets a new message. The Mentions popover shows one row per thread, with the comment it answers. Replying in a thread clears the matching Ask, and everyone already in the thread hears about replies. (Updates section 9.)
- **Prototype data choices.** Bob is the follower persona, not Marcus as in the Demo script. Jon's due-soon item sits under Operations, because the hi-fi board shows Tech as already done.
- **Capsule keys use the space prefix.** Engineering EN, Partner Programs PP, Risk & Compliance RC, Sales Enablement SE (for example EN-142); not ENG, which Jira issues already use. Admins set the prefix when they create a space. A capsule that moves to another space gets the new prefix, and its old key still opens it.
- **Onboarding has 5 steps.** Claude & ChatGPT folds into Connect tools, which has a Work tools section (Jira, monday) and an AI tools section (the labeled-action example, Claude, ChatGPT, and "Works with any app that supports MCP"). (Updates section 5.)
- **Basic validation in onboarding.** Name, organization and a valid work email are required. A badly formatted invite email can't be added, and invites can be removed. Space key prefixes are 2 to 4 letters and unique.
- **Composer placeholder.** "Describe the outcome you're working toward" on Home and New capsule; the Try chips carry the examples.
- **Shaping motion: Orbit.** Picked direction A from the motion study, at 1× speed. The composer shrinks into a glass orb, and the component beads land one at a time (1.1, 1.65, 2.2 and 2.75s) and orbit it. When the review page opens (about 3.3s), each bead morphs into its real component row. Owners and dates show a "thinking" indicator, then resolve one row at a time. Details and the create bar come in last. The glass stays neutral, and only the component colors carry tint. Reduced motion skips the animation and fades straight to the review.
- **Review page copy.** Subtitle: "Everything here is editable, and nobody is notified until you create it." There's no "Suggested for \[space\]" label on Components. The create bar always reads "Component owners will be notified when you click create."
- **No initial badges on spaces.** Spaces appear by name only: in the sidebar, the space page title, the space picker and onboarding.
- **Linking Jira and monday items.** Both are done from the "Add a work item" line, on a capsule and while shaping a new one. The link button opens a picker where you switch between Jira and monday, search by key or title (use the arrow keys and Enter), and pick an item. Items already linked in the capsule show as "Linked". You can also paste a Jira key, a Jira link or a monday item link into the field: a "Link …" suggestion appears, and Enter links the item instead of adding plain text. A linked item brings its title, assignee and status. It keeps its tool badge and can't be ticked in Capsule, because completion syncs from the tool. Linking an open item to a Done component moves the component back to In progress. Linking also adds an Activity entry and an Undo toast. To confirm: whether to create a new Jira or monday item from Capsule, which isn't in the prototype.
- **Attachments.** A section on the capsule page, under Components. Team members can upload files (from the Add menu or by dragging onto the section) and add links. A link's type is read from its address: Figma, Google Docs, Sheets or Slides, Notion, Confluence, Loom, or a plain link. A missing name is filled in from the address, and duplicate or malformed links are flagged. Each row shows a type icon, the name, the type or size, who added it and when, plus an optional component tag. The person who added an item, or the capsule owner, can remove it, with Undo. Adding and removing show up in Activity. Followers and viewers see the list read-only, and don't see the section when it's empty.
- **Orbit center is a mini page.** The beads orbit a small frosted page about 176 × 108px. It has no text, only a heading bar and three shimmering placeholder lines. Beads on the back half of the orbit pass behind it.
- **Responsive sidebar.** The page never wraps under the sidebar. Behavior depends on window width:
  - **Wide (1280px and up):** the full sidebar is docked, and collapsing it to the icon rail is remembered.
  - **Laptop (900–1279px):** the sidebar is a rail, and expanding it opens the full sidebar over the page, with a dimmed backdrop.
  - **Narrow (under 900px):** a slim top bar whose menu button slides the sidebar in from the left.

  Only the wide layout ever pushes content. The overlays close on a link, a click outside or Esc, and reset when the window crosses a breakpoint.
- **Shaping from a Jira or monday item (Nov 8).** Paste a Jira link or key, or a monday item link, into the composer on Home or New capsule, on its own or with your own words, and send. There's no preview chip. Capsule handles the link behind the scenes.
  - **What it reads:** Capsule reads the item's title, description and comments, plus its child items (an epic's issues or a monday item's subitems), and uses them with your words to shape the capsule.
  - **Where items land:** the item and its children come in as linked, synced work items in the component each belongs to. Jira items go to Tech, and monday items go by what they're about. There's no "Created from" label.
  - **Owners:** they come from Capsule's own picture of the org, because Jira rarely knows who owns Sales or Ops. Linked items keep their own assignees.
  - **Dates:** the launch date follows the item's due date, and component dates stay on or before it.
  - **Name and outcome:** the outcome uses your words if you wrote some, otherwise the item's description.
  - **Motion:** Orbit stays the same.
  - **Errors:** a link Capsule can't open never blocks you. A link on its own shows "Couldn't open ENG-999 in Jira. Check the link and that you can open it, or describe the outcome instead." A link plus a description shapes from the description alone, with a note on the review page.
  - **V1 scope:** reading child items is in V1.
- **Browse spaces is a simple directory (Nov 9).** It lists every public space, plus private spaces you're a member of. Other private spaces never appear, so their names don't leak. Each row shows the name, key prefix, description, member faces and count, and how many capsules you can see there.
  - **Joining and leaving:** Join (with Undo) adds the space to Your spaces. "Joined" turns into Leave on hover. Leaving keeps every capsule you're on or follow.
  - **Following:** joining doesn't follow anything. Following stays per capsule, as decided.
  - **Space pages for members:** a space you belong to lists every capsule there you can see, not only your own, so someone like Bob can find capsules and follow them.
  - **Sample data:** two more public sample spaces were added, Customer Success (CX) and Data & Analytics (DA).

## 15. Open items

- Sync strategy for Jira and monday items: which fields are read-only, and whether sync goes both ways.
- The Capsule logo and AI mark (Christina is designing these), plus a trademark check on the name.
- Attention items should open the capsule with that exact item selected (a build behavior).
- Settings, including org component settings.
