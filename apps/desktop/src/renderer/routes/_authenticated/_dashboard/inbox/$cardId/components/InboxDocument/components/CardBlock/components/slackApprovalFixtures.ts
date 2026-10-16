import type {
	CardAction,
	SlackCanvasView,
	SlackChannelView,
	SlackComposeContextView,
	SlackConversationView,
	SlackPersonView,
	SlackPostView,
	SlackReminderView,
	SlackRequestView,
	SlackStatusView,
} from "../types";
import { addDays, dayOf, zonedInstant } from "../utils/zoneTime";
import { customEmoji } from "./SlackThreadBlock/fixtures";

/** Shaped after cards resolved against a real Slack workspace; the people and the words are made up. */

export const ZONE = "America/Los_Angeles";
const WORKSPACE = "Superset";
const MORNING = 9 * 60;
const AFTERNOON = 16 * 60;

/** A wall-clock minute some days from today in the reader's zone, so no fixture is ever in the past. */
export const later = (days: number, minute: number) =>
	new Date(
		zonedInstant(addDays(dayOf(Date.now(), ZONE), days), minute, ZONE),
	).toISOString();

const person = {
	realName: null,
	avatar: null,
	isBot: false,
	title: null,
	timezone: null,
	presence: null,
	inChannel: true,
	isReader: false,
	role: null,
	team: null,
};

export const riley: SlackPersonView = {
	...person,
	id: "U0RILEY7M2Q",
	name: "Riley Morgan",
	title: "Head of product",
	timezone: "America/Los_Angeles",
	presence: "active",
	isReader: true,
	role: "admin",
};
export const avery: SlackPersonView = {
	...person,
	id: "U0AVERY4C1N",
	name: "Avery Chen",
	title: "Staff engineer",
	timezone: "America/New_York",
	presence: "active",
};
export const blake: SlackPersonView = {
	...person,
	id: "U0BLAKE8R3V",
	name: "Blake",
	realName: "Blake Rivera",
	title: "Engineering manager",
	timezone: "America/Los_Angeles",
	presence: "away",
};
export const casey: SlackPersonView = {
	...person,
	id: "U0CASEY2N6G",
	name: "Casey Nguyen",
	title: "Product designer",
	timezone: "Europe/London",
	presence: "away",
};
export const sam: SlackPersonView = {
	...person,
	id: "U0SAMOR5T9G",
	name: "Sam Ortega",
	title: "Contract writer",
	timezone: "America/Chicago",
	presence: "away",
	inChannel: false,
};
export const quinn: SlackPersonView = {
	...person,
	id: "U0QUINN3B8K",
	name: "Quinn Baker (Northwind)",
	realName: "Quinn Baker",
	title: "Partner manager",
	timezone: "America/Denver",
	presence: "away",
	inChannel: false,
	team: { id: "T0NORTHWND1", name: "Northwind", icon: null },
};
export const app: SlackPersonView = {
	...person,
	id: "U0APPBOT1A1",
	name: "Superset",
	isBot: true,
};
const directory = [avery, blake, casey, riley, sam, quinn];
const members: SlackPersonView[] = [...directory, app];

export const compose: SlackComposeContextView = {
	members,
	names: Object.fromEntries(members.map((person) => [person.id, person.name])),
	channels: {
		C0TESTAGNT1: "test-agents",
		C0BUGS00001: "bugs",
		C0GENERAL01: "general",
	},
	groups: { S0ENG: "eng" },
	emoji: customEmoji,
};

export const testAgents: SlackConversationView = {
	id: "C0TESTAGNT1",
	kind: "channel",
	name: "test-agents",
	members: 4,
	external: false,
};
export const leadership: SlackConversationView = {
	id: "C0AGENTS001",
	kind: "private",
	name: "leadership",
	members: 3,
	external: false,
};
export const partners: SlackConversationView = {
	id: "C0PARTNERS1",
	kind: "channel",
	name: "partners-northwind",
	members: 12,
	external: true,
};
const listed = (channel: SlackConversationView) => ({
	...channel,
	members: null,
});
const destinations: SlackConversationView[] = [
	{
		id: "C0BUGS00001",
		kind: "channel",
		name: "bugs",
		members: null,
		external: false,
	},
	{
		id: "C0GENERAL01",
		kind: "channel",
		name: "general",
		members: null,
		external: false,
	},
	listed(leadership),
	listed(partners),
	listed(testAgents),
];

const action = (
	id: string,
	label: string,
	role: CardAction["role"],
	style: CardAction["style"] = "secondary",
): CardAction => ({ id, label, style, role });

/** The server's answer for an action the reader may see and not take. */
export const off = (
	actions: CardAction[],
	id: string,
	reason: string,
): CardAction[] =>
	actions.map((each) =>
		each.id === id ? { ...each, disabled: reason } : each,
	);

export const postActions = [
	action("send", "Send", "primary", "primary"),
	action("retarget", "Change where it goes", "other"),
	action("dismiss", "Do not send", "dismiss"),
];

export const postView: SlackPostView = {
	kind: "slack.message",
	workspace: WORKSPACE,
	reader: riley,
	target: testAgents,
	recipients: [],
	destinations,
	compose,
	draft: "The *1.33* release note is ready, please skim it :shipit:",
	postAt: null,
	stale: false,
	timezone: ZONE,
	notifies: 3,
	groupSizes: { S0ENG: 5 },
};

export const broadcastPostView: SlackPostView = {
	...postView,
	draft: "The *1.33* release note is ready. <!channel> please skim it.",
};

export const groupMentionPostView: SlackPostView = {
	...postView,
	draft: "<!subteam^S0ENG> the release build is green.",
};

export const scheduledPostView: SlackPostView = {
	...postView,
	postAt: later(1, MORNING),
};

export const stalePostView: SlackPostView = { ...postView, stale: true };

export const dmPostView: SlackPostView = {
	...postView,
	target: {
		id: blake.id,
		kind: "dm",
		name: blake.name,
		members: 2,
		external: false,
	},
	recipients: [blake],
	draft: "Remember the demo data before the call.",
	notifies: null,
};

export const groupPostView: SlackPostView = {
	...dmPostView,
	target: {
		id: `${blake.id},${casey.id}`,
		kind: "group",
		name: `${blake.name}, ${casey.name}`,
		members: 3,
		external: false,
	},
	recipients: [blake, casey],
};

export const privatePostView: SlackPostView = {
	...postView,
	target: leadership,
	notifies: 2,
};

export const externalPostView: SlackPostView = {
	...postView,
	target: partners,
	notifies: 11,
};

const channelUrl = (channel: SlackConversationView) => ({
	...channel,
	url: `https://superset.slack.com/archives/${channel.id}`,
});

const channelBase = {
	kind: "slack.channel" as const,
	workspace: WORKSPACE,
	proposed: { name: "", private: false },
	emails: [],
	directory,
	appInChannel: true,
};

export const inviteActions = [
	action("invite", "Add to channel", "primary", "primary"),
	action("dismiss", "Leave it", "dismiss"),
];

export const inviteView: SlackChannelView = {
	...channelBase,
	mode: "invite",
	channel: channelUrl(testAgents),
	invitees: [
		{ person: blake, guest: false, alreadyMember: false },
		{ person: sam, guest: true, alreadyMember: false },
		{ person: avery, guest: false, alreadyMember: true },
	],
};

export const invitePrivateView: SlackChannelView = {
	...inviteView,
	channel: channelUrl({ ...leadership, external: true }),
};

export const inviteNobodyView: SlackChannelView = {
	...inviteView,
	invitees: [{ person: avery, guest: false, alreadyMember: true }],
};

export const createActions = [
	action("create", "Create channel", "primary", "primary"),
	action("dismiss", "Leave it", "dismiss"),
];

export const createView: SlackChannelView = {
	...channelBase,
	mode: "create",
	channel: null,
	proposed: { name: "launch-133", private: true },
	invitees: [
		{ person: riley, guest: false, alreadyMember: false },
		{ person: avery, guest: false, alreadyMember: false },
		{ person: blake, guest: false, alreadyMember: false },
	],
};

export const connectActions = [
	action("connect", "Send invitation", "primary", "primary"),
	action("dismiss", "Leave it", "dismiss"),
];

export const connectView: SlackChannelView = {
	...channelBase,
	mode: "connect",
	channel: channelUrl(testAgents),
	invitees: [],
	emails: ["dana@northwind.example"],
};

export const APP_NOT_IN_CHANNEL =
	"Add the Superset app to #test-agents first; it sends the invitation";

export const reminderActions = [
	action("remind", "Set reminder", "primary", "primary"),
	action("dismiss", "No reminder", "dismiss"),
];

export const reminderView: SlackReminderView = {
	kind: "slack.reminder",
	workspace: WORKSPACE,
	reader: riley,
	text: "Send the invoice to Northwind",
	time: later(1, MORNING),
	stale: false,
	timezone: ZONE,
};

export const statusActions = [
	action("set_status", "Set status", "primary", "primary"),
	action("dismiss", "Leave it", "dismiss"),
];

export const clearStatusAction: CardAction = {
	...action("clear_status", "Clear status", "other"),
	confirm: "Clear your Slack status?",
};

export const statusView: SlackStatusView = {
	kind: "slack.status",
	workspace: WORKSPACE,
	reader: riley,
	mode: "status",
	current: { text: "", emoji: "", until: null, pausedUntil: null },
	proposed: {
		text: "Heads down",
		emoji: ":headphones:",
		until: later(1, AFTERNOON),
		pause: true,
		pauseUntil: null,
	},
	stale: false,
	timezone: ZONE,
	emoji: customEmoji,
};

export const statusWithCurrentView: SlackStatusView = {
	...statusView,
	current: {
		text: "In a meeting",
		emoji: ":calendar:",
		until: later(1, MORNING),
		pausedUntil: null,
	},
};

export const statusForeverView: SlackStatusView = {
	...statusView,
	proposed: {
		text: "Shipping",
		emoji: ":shipit:",
		until: null,
		pause: false,
		pauseUntil: null,
	},
};

export const pauseActions = [
	action("pause", "Pause notifications", "primary", "primary"),
	action("dismiss", "Leave it", "dismiss"),
];

export const resumeAction: CardAction = {
	...action("resume", "Resume notifications", "other"),
	confirm: "Resume your Slack notifications now?",
};

export const pauseView: SlackStatusView = {
	...statusView,
	mode: "pause",
	proposed: {
		text: "",
		emoji: "",
		until: null,
		pause: true,
		pauseUntil: later(1, AFTERNOON),
	},
};

export const pausedView: SlackStatusView = {
	...pauseView,
	current: { ...pauseView.current, pausedUntil: later(1, MORNING) },
};

export const canvasActions = [
	action("apply", "Apply to canvas", "primary", "primary"),
	action("dismiss", "Leave the canvas", "dismiss"),
];

export const canvasView: SlackCanvasView = {
	kind: "slack.canvas",
	workspace: WORKSPACE,
	canvas: {
		id: "F0C6JFERXMX",
		title: "Launch checklist",
		url: "https://superset.slack.com/docs/T0EXAMPLE01/F0C6JFERXMX",
	},
	change: "replace",
	section: "temp:C:VXX4b4f5b1b0f1e4d0c8d1e7a9cd",
	before: "Owner: Riley",
	lossy: false,
	after: "Owner: Riley (backup: the on-call lead)",
	content:
		"# Launch checklist\n\n- Write the announcement\n- Tell support\n\nOwner: Riley\n\n## Risks\n\n1. Pricing page is not updated\n2. **Support** macro is missing\n- [ ] Draft the email\n- [x] Book the room\n\n> Quote line\n\n```\ncode line\n```\n\nSee [the plan](https://example.com) and `inline`.",
	version: 1791026612,
	editable: true,
};

export const canvasInsertView: SlackCanvasView = {
	...canvasView,
	change: "insert_after",
	after: "Backup: the on-call lead",
};

export const canvasAppendView: SlackCanvasView = {
	...canvasView,
	change: "append",
	section: null,
	before: null,
	after: "## Follow-ups\n\n- Send the recap",
};

export const canvasDeleteView: SlackCanvasView = {
	...canvasView,
	change: "delete",
	after: "",
};

export const READ_ONLY_CANVAS = "You can only read this canvas in Slack";

export const requestActions = [
	action("approve", "Approve", "primary", "primary"),
	action("deny", "Deny", "other", "danger"),
	action("dismiss", "Leave it", "dismiss"),
];

export const OWN_BUTTONS =
	"Only Slack can press this request's own buttons. Open it in Slack";

const REQUEST_TS = ((Date.now() - 45 * 60_000) / 1000).toFixed(6);
const requestLink = `https://superset.slack.com/archives/C0TESTAGNT1/p${REQUEST_TS.replace(".", "")}`;

const requestMessage: SlackRequestView["message"] = {
	ts: REQUEST_TS,
	user: casey,
	text: "Can I get into <#C0AGENTS001|leadership> for the launch review? I need the pricing thread.",
	edited: false,
	broadcast: false,
	deleted: false,
	reactions: [],
	files: [],
	attachments: [],
	blocks: [],
	permalink: requestLink,
};

export const requestView: SlackRequestView = {
	kind: "slack.request",
	workspace: WORKSPACE,
	channel: { id: "C0TESTAGNT1", name: "#test-agents", external: false },
	permalink: requestLink,
	message: requestMessage,
	grant: {
		person: casey,
		guest: false,
		channel: leadership,
		alreadyMember: false,
	},
	ownButtons: false,
	approveReply: "Approved, you are in.",
	denyReply: "Not this time: ask in <#C0GENERAL01|general> for the summary.",
	compose: {
		...compose,
		channels: { ...compose.channels, C0AGENTS001: "leadership" },
	},
};

export const requestGuestView: SlackRequestView = {
	...requestView,
	message: { ...requestMessage, user: quinn },
	grant: {
		person: quinn,
		guest: true,
		channel: { ...leadership, external: true },
		alreadyMember: false,
	},
};

export const requestMemberView: SlackRequestView = {
	...requestView,
	grant: {
		person: casey,
		guest: false,
		channel: leadership,
		alreadyMember: true,
	},
};

export const requestReplyOnlyView: SlackRequestView = {
	...requestView,
	message: {
		...requestMessage,
		text: "Can I take Friday off? The release is out by Thursday.",
	},
	grant: null,
	approveReply: "Approved.",
	denyReply: "Not this time.",
};

export const requestOwnButtonsView: SlackRequestView = {
	...requestReplyOnlyView,
	message: {
		...requestMessage,
		user: app,
		text: `${casey.name} asks for 2 days off`,
		blocks: [
			{
				type: "section",
				text: `*${casey.name}* asks for 2 days off: Oct 8 to Oct 9`,
				fields: [],
				accessory: null,
			},
			{
				type: "actions",
				buttons: [
					{ text: "Approve", url: null, style: "primary" },
					{ text: "Deny", url: null, style: "danger" },
				],
			},
		],
	},
	ownButtons: true,
};
