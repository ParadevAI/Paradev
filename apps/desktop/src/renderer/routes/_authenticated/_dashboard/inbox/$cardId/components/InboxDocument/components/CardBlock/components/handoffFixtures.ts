import type {
	CardAction,
	HandoffBugReportView,
	HandoffFollowUpsView,
	LinearDraftView,
	RoutedItemView,
	SentryIssueView,
	SentryPersonView,
} from "../types";
import {
	account,
	bug,
	desktop,
	marcus,
	options,
	team,
	todo,
} from "./linearFixtures";
import {
	avery,
	blake,
	casey,
	compose,
	riley,
	testAgents,
} from "./slackApprovalFixtures";

/** Made-up people, words and ids, in the shapes the handoff cards resolve to. */

const CHANNEL = { id: "C0BUGS00001", name: "#bugs" };
const THREAD_URL =
	"https://lumenlabs.slack.com/archives/C0BUGS00001/p1790000000000100";

const ago = (minutes: number) =>
	new Date(Date.now() - minutes * 60_000).toISOString();

const at = (minutesAgo: number) =>
	((Date.now() - minutesAgo * 60_000) / 1000).toFixed(6);

const message = (
	ts: string,
	user: HandoffBugReportView["thread"]["messages"][number]["user"],
	text: string,
): HandoffBugReportView["thread"]["messages"][number] => ({
	ts,
	user,
	text,
	edited: false,
	broadcast: false,
	deleted: false,
	reactions: [],
	files: [],
	attachments: [],
	blocks: [],
	permalink: `https://lumenlabs.slack.com/archives/${CHANNEL.id}/p${ts.replace(".", "")}`,
});

export const bugDraft: LinearDraftView = {
	account,
	team,
	title: "Login loops back to the sign-in page on Safari",
	description: [
		"After signing in on Safari 18 the app returns to the sign-in page.",
		"",
		"**Steps**",
		"1. Open the app in Safari",
		"2. Sign in with Google",
		"",
		`Reported by Avery Chen in Slack: ${THREAD_URL}`,
	].join("\n"),
	fields: { state: todo.id, priority: 2, labels: [bug.id] },
	options,
};

export const ROOT_TS = at(95);

export const bugThread: HandoffBugReportView["thread"] = {
	kind: "slack.thread",
	channel: CHANNEL,
	permalink: THREAD_URL,
	readerConnected: true,
	names: compose.names,
	channels: compose.channels,
	groups: compose.groups,
	emoji: compose.emoji,
	members: [avery, blake, casey, riley],
	draft: null,
	messages: [
		message(
			ROOT_TS,
			avery,
			"Login loops back to the sign-in page on Safari. Chrome is fine. Started after this morning's release.",
		),
		message(at(90), blake, "Same here on Safari 18.2, private window too."),
		message(at(80), casey, "Cookies look blocked for the auth domain."),
	],
};

export const BUG_REPLY = "Thanks <@U0AVERY4C1N>, filed and tracking it here:";

export const bugReportActions: CardAction[] = [
	{ id: "file", label: "File issue", style: "primary", role: "primary" },
	{ id: "dismiss", label: "Do not file", style: "secondary", role: "dismiss" },
];

export const bugReportView: HandoffBugReportView = {
	kind: "handoff.bug_report",
	thread: bugThread,
	issue: bugDraft,
	reply: BUG_REPLY,
	canReply: true,
	replyUnavailable: null,
	filed: null,
	replied: null,
	plan: {
		file: `file "{title}" in ${team.name}`,
		reply: `reply in ${CHANNEL.name} with the link`,
	},
};

export const FILED = {
	text: `Filed AGT-12 in ${team.name}`,
	url: "https://linear.app/lumen-labs/issue/AGT-12",
};
export const REPLIED = { text: `Replied in ${CHANNEL.name}`, url: THREAD_URL };

/** An earlier run filed the issue and the reply failed. */
export const bugFiledView: HandoffBugReportView = {
	...bugReportView,
	filed: FILED,
};
export const bugFiledActions: CardAction[] = [
	{
		id: "file",
		label: "Reply with the link",
		style: "primary",
		role: "primary",
	},
	{ id: "dismiss", label: "Done", style: "secondary", role: "dismiss" },
];

export const bugDoneView: HandoffBugReportView = {
	...bugFiledView,
	replied: REPLIED,
};

export const bugNoSlackView: HandoffBugReportView = {
	...bugReportView,
	thread: { ...bugThread, readerConnected: false },
	canReply: false,
	replyUnavailable: "Connect your Slack account to reply as you",
};

export const bugNotInChannelView: HandoffBugReportView = {
	...bugReportView,
	canReply: false,
	replyUnavailable: `You are not in ${CHANNEL.name} in Slack`,
};

export const followUpDraft: LinearDraftView = {
	account,
	team,
	title: "Add a retry to the export job",
	description: 'From the meeting "Weekly product sync".',
	fields: { priority: 3, assignee: marcus.id, labels: [desktop.id] },
	options,
};

const GMAIL_TO = "dana.whitfield@northwind.example";

export const gmailItem: RoutedItemView = {
	id: "pricing",
	text: "Send Dana the updated pricing sheet",
	owner: "Riley",
	destination: {
		kind: "gmail",
		to: [GMAIL_TO],
		subject: "Updated pricing sheet",
		body: "Hi Dana,\n\nThe updated pricing sheet is attached to the shared folder.\n\nRiley",
		from: "riley@lumenlabs.example",
	},
	unavailable: null,
	done: null,
	plan: "make a Gmail draft to {to}",
};

export const linearItem: RoutedItemView = {
	id: "retry",
	text: "Add a retry to the export job",
	owner: "Marcus",
	destination: { kind: "linear", draft: followUpDraft },
	unavailable: null,
	done: null,
	plan: `file "{title}" in ${team.name}`,
};

export const slackItem: RoutedItemView = {
	id: "notes",
	text: "Share the launch date with the team",
	owner: null,
	destination: {
		kind: "slack",
		target: testAgents,
		recipients: [],
		text: "The launch moves to *October 14*.",
	},
	unavailable: null,
	done: null,
	plan: `send a Slack message to ${testAgents.name}`,
};

export const routedItems: RoutedItemView[] = [gmailItem, linearItem, slackItem];

export const GMAIL_DONE = {
	text: `Made a Gmail draft to ${GMAIL_TO}`,
	url: "https://mail.google.com/mail/u/0/#drafts?compose=r1790000000000001",
};

/** Two of three routed: the Slack message did not go out. */
export const partlyRoutedItems: RoutedItemView[] = [
	{ ...gmailItem, done: GMAIL_DONE },
	{ ...linearItem, done: FILED },
	slackItem,
];

export const allRoutedItems: RoutedItemView[] = [
	{ ...gmailItem, done: GMAIL_DONE },
	{ ...linearItem, done: FILED },
	{ ...slackItem, done: { text: "Sent to #test-agents", url: null } },
];

export const GMAIL_NOT_CONNECTED = "Connect Gmail to make this draft";

export const unavailableItems: RoutedItemView[] = [
	{
		...gmailItem,
		destination:
			gmailItem.destination?.kind === "gmail"
				? { ...gmailItem.destination, from: null }
				: null,
		unavailable: GMAIL_NOT_CONNECTED,
	},
	linearItem,
	{
		...slackItem,
		destination: null,
		unavailable: "That conversation is gone",
		plan: "",
	},
];

export const followUpsActions: CardAction[] = [
	{
		id: "route",
		label: "Route checked items",
		style: "primary",
		role: "primary",
	},
	{
		id: "dismiss",
		label: "Route nothing",
		style: "secondary",
		role: "dismiss",
	},
];
export const partlyRoutedActions: CardAction[] = [
	{
		id: "route",
		label: "Route checked items",
		style: "primary",
		role: "primary",
	},
	{ id: "dismiss", label: "Done", style: "secondary", role: "dismiss" },
];

export const followUpsView: HandoffFollowUpsView = {
	kind: "handoff.follow_ups",
	source: "granola",
	meeting: {
		title: "Weekly product sync",
		url: "https://notes.lumenlabs.example/weekly-product-sync",
		heldAt: "2037-09-30T17:00:00.000Z",
	},
	items: routedItems,
	compose,
};

export const partlyRoutedView: HandoffFollowUpsView = {
	...followUpsView,
	items: partlyRoutedItems,
};

export const sentryRiley: SentryPersonView = {
	id: "3100201",
	name: "Riley Morgan",
	email: "riley@lumenlabs.example",
};
export const sentryAvery: SentryPersonView = {
	id: "3100202",
	name: "Avery Chen",
	email: "avery@lumenlabs.example",
};
export const sentryBlake: SentryPersonView = {
	id: "3100203",
	name: "Blake Rivera",
	email: null,
};

const FIX_PROMPT = [
	"Fix the Sentry issue DESKTOP-4K2.",
	"",
	"TypeError: Cannot read properties of undefined (reading 'id')",
	"in src/renderer/panes/usePaneTitle.ts, usePaneTitle",
].join("\n");

export const sentryDraft: LinearDraftView = {
	account,
	team,
	title: "DESKTOP-4K2: TypeError: Cannot read properties of undefined",
	description: FIX_PROMPT,
	fields: { priority: 2, labels: [bug.id] },
	options,
};

export const sentryActions: CardAction[] = [
	{
		id: "resolve",
		label: "Resolve",
		style: "primary",
		role: "primary",
		confirm: "Resolve DESKTOP-4K2 in Sentry?",
	},
	{
		id: "ignore",
		label: "Archive",
		style: "secondary",
		role: "other",
		confirm: "Archive DESKTOP-4K2 in Sentry? It comes back if it escalates.",
	},
	{ id: "assign", label: "Assign", style: "secondary", role: "other" },
	{
		id: "file_linear",
		label: "File in Linear",
		style: "secondary",
		role: "other",
	},
	{
		id: "started",
		label: "Start an agent to fix it",
		style: "secondary",
		role: "other",
	},
	{ id: "dismiss", label: "Leave it", style: "secondary", role: "dismiss" },
];

export const sentryView: SentryIssueView = {
	kind: "sentry.issue",
	organization: "lumen-labs",
	issue: {
		id: "6723918452",
		shortId: "DESKTOP-4K2",
		title: "TypeError: Cannot read properties of undefined (reading 'id')",
		culprit: "usePaneTitle(src/renderer/panes/usePaneTitle)",
		level: "error",
		status: "unresolved",
		events: "1284",
		users: 73,
		firstSeen: ago(3 * 24 * 60 + 40),
		lastSeen: ago(19),
		url: "https://lumen-labs.sentry.io/issues/6723918452/",
		project: "desktop",
		assignee: null,
		error: {
			type: "TypeError",
			value: "Cannot read properties of undefined (reading 'id')",
			filename: "src/renderer/panes/usePaneTitle.ts",
			function: "usePaneTitle",
		},
	},
	members: [sentryAvery, sentryBlake, sentryRiley],
	linear: sentryDraft,
	linearUnavailable: null,
	filed: null,
	noted: null,
	plan: {
		file: `file "{title}" in ${team.name}`,
		note: "add a note on DESKTOP-4K2 with the link",
	},
	fix: {
		slug: "DESKTOP-4K2",
		title: "TypeError: Cannot read properties of undefined (reading 'id')",
		prompt: FIX_PROMPT,
	},
};

export const sentryAssignedView: SentryIssueView = {
	...sentryView,
	issue: { ...sentryView.issue, assignee: sentryAvery },
};

export const SENTRY_NOTED = {
	text: "Added a note on DESKTOP-4K2",
	url: "https://lumen-labs.sentry.io/issues/6723918452/",
};
export const ALREADY_FILED = "This is filed in Linear already";

export const sentryFiledView: SentryIssueView = {
	...sentryView,
	filed: FILED,
	noted: SENTRY_NOTED,
};

export const sentryResolvedView: SentryIssueView = {
	...sentryFiledView,
	issue: { ...sentryView.issue, status: "resolved", assignee: sentryAvery },
};

export const sentryNoLinearView: SentryIssueView = {
	...sentryView,
	linear: null,
};
