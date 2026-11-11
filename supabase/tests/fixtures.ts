/**
 * The people and sample data the access tests run against.
 *
 * Acme Partners:
 *   Christina  org admin, owns capsule EN-1 and the Sales component on it
 *   Alex       org admin, not on any capsule team
 *   Dana       owns the Tech component on EN-1, and capsule EN-2
 *   Jon        member, assigned a work item in Operations on EN-1
 *   Bob        member, follows EN-1 (the follower persona)
 *   Maya       member, not involved in anything
 * Beta Corp (a different org):
 *   Olga       org admin of Beta, owns capsule BE-1
 * Not in any org yet:
 *   Nina       approved to create an org (beta sign-up list)
 *   Sam        not approved, not invited
 *   Ivy        invited to Acme by Christina
 */

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const P = {
  christina: id(0x101),
  alex: id(0x102),
  dana: id(0x103),
  jon: id(0x104),
  bob: id(0x105),
  maya: id(0x106),
  olga: id(0x201),
  nina: id(0x301),
  sam: id(0x302),
  ivy: id(0x303),
} as const;

export type Persona = keyof typeof P;

export const NAMES: Record<Persona, string> = {
  christina: "Christina (org admin, capsule owner)",
  alex: "Alex (org admin, not on the team)",
  dana: "Dana (component owner)",
  jon: "Jon (member with a work item)",
  bob: "Bob (follower)",
  maya: "Maya (member, not involved)",
  olga: "Olga (another org)",
  nina: "Nina (approved, no org yet)",
  sam: "Sam (not approved, no org)",
  ivy: "Ivy (invited to Acme)",
};

export const EMAIL: Record<Persona, string> = {
  christina: "christina@acme.test",
  alex: "alex@acme.test",
  dana: "dana@acme.test",
  jon: "jon@acme.test",
  bob: "bob@acme.test",
  maya: "maya@acme.test",
  olga: "olga@beta.test",
  nina: "nina@newco.test",
  sam: "sam@newco.test",
  ivy: "ivy@acme.test",
};

export const INVITATION = { ivyToAcme: id(0xb001), bobDraft: id(0xb002) };

export const ORG = { acme: id(0x1001), beta: id(0x1002) };

export const TYPE = {
  tech: id(0x2001),
  ops: id(0x2002),
  sales: id(0x2003),
  marketing: id(0x2004),
  betaTech: id(0x2101),
};

export const SPACE = { en: id(0x3001), pp: id(0x3002), be: id(0x3101) };

export const CAPSULE = { en1: id(0x4001), en2: id(0x4002), be1: id(0x4101) };

export const COMP = {
  en1Tech: id(0x5001),
  en1Ops: id(0x5002),
  en1Sales: id(0x5003),
  en2Tech: id(0x5004),
  be1Tech: id(0x5101),
};

export const ITEM = {
  techApi: id(0x6001), // Tech, assigned to Dana
  opsRunbook: id(0x6002), // Operations, assigned to Jon, created by Christina
  opsTraining: id(0x6003), // Operations, unassigned, created by Christina
  be1Item: id(0x6101),
};

export const EVENT = { en1Comment: id(0x7001), be1Comment: id(0x7101) };

export const MENTION = { danaInEn1: id(0x8001) };

export const ATTACHMENT = { en1Figma: id(0x9001), be1Link: id(0x9101) };

export const FILE_PATH = {
  en1: `${CAPSULE.en1}/${id(0xa001)}/launch-plan.pdf`,
  be1: `${CAPSULE.be1}/${id(0xa101)}/beta-plan.pdf`,
};

/** Runs as the database owner, so row-level security doesn't apply. */
export const SEED_SQL = `
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('${P.christina}', 'christina@acme.test', '{"name":"Christina"}', 'authenticated', 'authenticated'),
  ('${P.alex}', 'alex@acme.test', '{"name":"Alex"}', 'authenticated', 'authenticated'),
  ('${P.dana}', 'dana@acme.test', '{"name":"Dana"}', 'authenticated', 'authenticated'),
  ('${P.jon}', 'jon@acme.test', '{"name":"Jon"}', 'authenticated', 'authenticated'),
  ('${P.bob}', 'bob@acme.test', '{"name":"Bob"}', 'authenticated', 'authenticated'),
  ('${P.maya}', 'maya@acme.test', '{"name":"Maya"}', 'authenticated', 'authenticated'),
  ('${P.olga}', 'olga@beta.test', '{"name":"Olga"}', 'authenticated', 'authenticated'),
  ('${P.nina}', 'nina@newco.test', '{}', 'authenticated', 'authenticated'),
  ('${P.sam}', 'sam@newco.test', '{}', 'authenticated', 'authenticated'),
  ('${P.ivy}', 'ivy@acme.test', '{}', 'authenticated', 'authenticated');

insert into public.signup_approvals (email, note) values ('nina@newco.test', 'Founding Builder');

insert into public.orgs (id, name, email_domain, onboarded_at) values
  ('${ORG.acme}', 'Acme Partners', 'acme.test', now()),
  ('${ORG.beta}', 'Beta Corp', 'beta.test', now());

insert into public.org_members (org_id, user_id, role) values
  ('${ORG.acme}', '${P.christina}', 'admin'),
  ('${ORG.acme}', '${P.alex}', 'admin'),
  ('${ORG.acme}', '${P.dana}', 'member'),
  ('${ORG.acme}', '${P.jon}', 'member'),
  ('${ORG.acme}', '${P.bob}', 'member'),
  ('${ORG.acme}', '${P.maya}', 'member'),
  ('${ORG.beta}', '${P.olga}', 'admin');

insert into public.component_types (id, org_id, name, color, position) values
  ('${TYPE.tech}', '${ORG.acme}', 'Tech', 'blue', 0),
  ('${TYPE.ops}', '${ORG.acme}', 'Operations', 'teal', 1),
  ('${TYPE.sales}', '${ORG.acme}', 'Sales', 'green', 2),
  ('${TYPE.marketing}', '${ORG.acme}', 'Marketing', 'orange', 3),
  ('${TYPE.betaTech}', '${ORG.beta}', 'Tech', 'blue', 0);

insert into public.spaces (id, org_id, name, key_prefix, created_by) values
  ('${SPACE.en}', '${ORG.acme}', 'Engineering', 'EN', '${P.christina}'),
  ('${SPACE.pp}', '${ORG.acme}', 'Partner Programs', 'PP', '${P.dana}'),
  ('${SPACE.be}', '${ORG.beta}', 'Beta Engineering', 'BE', '${P.olga}');

insert into public.space_members (org_id, space_id, user_id) values
  ('${ORG.acme}', '${SPACE.en}', '${P.bob}'),
  ('${ORG.acme}', '${SPACE.en}', '${P.jon}');

insert into public.capsules (id, org_id, space_id, name, outcome, owner_id, created_by) values
  ('${CAPSULE.en1}', '${ORG.acme}', '${SPACE.en}', 'Partner leaderboard launch',
   'Launch the partner leaderboard to our sales team.', '${P.christina}', '${P.christina}');
insert into public.capsules (id, org_id, space_id, name, owner_id, created_by) values
  ('${CAPSULE.en2}', '${ORG.acme}', '${SPACE.en}', 'Partner API v2', '${P.dana}', '${P.dana}'),
  ('${CAPSULE.be1}', '${ORG.beta}', '${SPACE.be}', 'Beta secret project', '${P.olga}', '${P.olga}');

insert into public.components (id, org_id, capsule_id, component_type_id, owner_id, status) values
  ('${COMP.en1Tech}', '${ORG.acme}', '${CAPSULE.en1}', '${TYPE.tech}', '${P.dana}', 'in_progress'),
  ('${COMP.en1Ops}', '${ORG.acme}', '${CAPSULE.en1}', '${TYPE.ops}', null, 'not_started'),
  ('${COMP.en1Sales}', '${ORG.acme}', '${CAPSULE.en1}', '${TYPE.sales}', '${P.christina}', 'not_started'),
  ('${COMP.en2Tech}', '${ORG.acme}', '${CAPSULE.en2}', '${TYPE.tech}', '${P.dana}', 'in_progress'),
  ('${COMP.be1Tech}', '${ORG.beta}', '${CAPSULE.be1}', '${TYPE.betaTech}', '${P.olga}', 'in_progress');

insert into public.work_items (id, org_id, capsule_id, component_id, title, assignee_id, created_by) values
  ('${ITEM.techApi}', '${ORG.acme}', '${CAPSULE.en1}', '${COMP.en1Tech}', 'Build the leaderboard API', '${P.dana}', '${P.dana}'),
  ('${ITEM.opsRunbook}', '${ORG.acme}', '${CAPSULE.en1}', '${COMP.en1Ops}', 'Write the support runbook', '${P.jon}', '${P.christina}'),
  ('${ITEM.opsTraining}', '${ORG.acme}', '${CAPSULE.en1}', '${COMP.en1Ops}', 'Train the reps', null, '${P.christina}'),
  ('${ITEM.be1Item}', '${ORG.beta}', '${CAPSULE.be1}', '${COMP.be1Tech}', 'Beta work', '${P.olga}', '${P.olga}');

insert into public.followers (org_id, capsule_id, user_id) values
  ('${ORG.acme}', '${CAPSULE.en1}', '${P.bob}');

insert into public.events (id, org_id, capsule_id, actor_user_id, kind, data) values
  ('${EVENT.en1Comment}', '${ORG.acme}', '${CAPSULE.en1}', '${P.christina}', 'comment', '{"body":"@Dana can you confirm the API date?"}'),
  ('${EVENT.be1Comment}', '${ORG.beta}', '${CAPSULE.be1}', '${P.olga}', 'comment', '{"body":"Beta only"}');

insert into public.mentions (id, org_id, event_id, user_id) values
  ('${MENTION.danaInEn1}', '${ORG.acme}', '${EVENT.en1Comment}', '${P.dana}');

insert into public.attachments (id, org_id, capsule_id, component_id, kind, name, url, link_type, added_by) values
  ('${ATTACHMENT.en1Figma}', '${ORG.acme}', '${CAPSULE.en1}', '${COMP.en1Tech}', 'link', 'Leaderboard designs',
   'https://www.figma.com/file/abc/leaderboard', 'figma', '${P.dana}'),
  ('${ATTACHMENT.be1Link}', '${ORG.beta}', '${CAPSULE.be1}', null, 'link', 'Beta doc',
   'https://notion.so/beta', 'notion', '${P.olga}');

insert into public.invitations (id, org_id, email, invited_by) values
  ('${INVITATION.ivyToAcme}', '${ORG.acme}', 'ivy@acme.test', '${P.christina}'),
  ('${INVITATION.bobDraft}', '${ORG.acme}', 'someone@acme.test', '${P.christina}');

insert into storage.objects (bucket_id, name) values
  ('attachments', '${FILE_PATH.en1}'),
  ('attachments', '${FILE_PATH.be1}');
`;
