import type {
	CardAction,
	LinearBulkView,
	LinearCommentView,
	LinearCycleView,
	LinearEditView,
	LinearFieldsView,
	LinearIssueView,
	LinearLabelView,
	LinearOptionsView,
	LinearPersonView,
	LinearProjectView,
	LinearStateView,
	LinearThreadView,
	LinearTriageView,
} from "../types";

/** A made-up Linear team "Agent Test" (AGT). Issues and comments are from the last days of September 2026; its cycles are in October 2037. */

const id = (group: number, n: number) =>
	`${String(group).padStart(8, "0")}-0000-4000-a000-${String(n).padStart(12, "0")}`;

function person(
	n: number,
	name: string,
	handle: string,
	app = false,
): LinearPersonView {
	return { id: id(1, n), name, handle, avatar: null, app };
}

export const riya = person(1, "Riya Kapoor", "riya");
export const marcus = person(2, "Marcus Oyelaran", "marcus");
export const lena = person(3, "Lena Fischer", "lena.fischer");
export const triageBot = person(4, "Triage Bot", "triagebot", true);
export const members: LinearPersonView[] = [lena, marcus, riya, triageBot];

export const account = { workspace: "Lumen Labs", viewer: riya };
export const team = { id: id(9, 1), key: "AGT", name: "Agent Test" };

function state(
	n: number,
	name: string,
	type: LinearStateView["type"],
	color: string,
): LinearStateView {
	return { id: id(2, n), name, type, color };
}

export const triage = state(0, "Triage", "triage", "#fc7840");
export const backlog = state(1, "Backlog", "backlog", "#bec2c8");
export const todo = state(2, "Todo", "unstarted", "#e2e2e2");
export const inProgress = state(3, "In Progress", "started", "#f2c94c");
export const inReview = state(4, "In Review", "started", "#0f783c");
export const done = state(5, "Done", "completed", "#5e6ad2");
export const canceled = state(6, "Canceled", "canceled", "#95a2b3");
export const states: LinearStateView[] = [
	backlog,
	todo,
	inProgress,
	inReview,
	done,
	canceled,
];

function label(
	n: number,
	name: string,
	color: string,
	group: string | null = null,
): LinearLabelView {
	return { id: id(3, n), name, color, group };
}

export const bug = label(1, "Bug", "#eb5757");
export const feature = label(2, "Feature", "#bb87fc");
export const improvement = label(3, "Improvement", "#4ea7fc");
export const desktop = label(4, "Desktop", "#26b5ce", "Platform");
export const mobile = label(5, "Mobile", "#f2c94c", "Platform");
export const labels: LinearLabelView[] = [
	bug,
	desktop,
	feature,
	improvement,
	mobile,
];

export const cycle1: LinearCycleView = {
	id: id(4, 1),
	number: 1,
	name: null,
	startsAt: "2037-10-05T07:00:00.000Z",
	endsAt: "2037-10-19T07:00:00.000Z",
};
export const cycle2: LinearCycleView = {
	id: id(4, 2),
	number: 2,
	name: null,
	startsAt: "2037-10-19T07:00:00.000Z",
	endsAt: "2037-11-02T07:00:00.000Z",
};

export const agentProject: LinearProjectView = {
	id: id(5, 1),
	name: "Agent Test project",
	color: "#4cb782",
	inTeam: true,
};
export const leaderboard: LinearProjectView = {
	id: id(5, 2),
	name: "Leaderboard",
	color: "#f2994a",
	inTeam: false,
};

export const options: LinearOptionsView = {
	states,
	members,
	labels,
	cycles: [cycle1, cycle2],
	projects: [agentProject, leaderboard],
	estimates: [
		{ value: 1, label: "1 Point" },
		{ value: 2, label: "2 Points" },
		{ value: 3, label: "3 Points" },
		{ value: 5, label: "5 Points" },
		{ value: 8, label: "8 Points" },
	],
};

const NO_FIELDS: Omit<LinearFieldsView, "state"> = {
	priority: 0,
	assignee: null,
	labels: [],
	cycle: null,
	project: null,
	estimate: null,
};

export function issue(
	n: number,
	title: string,
	at: LinearStateView,
	fields: Partial<LinearFieldsView> = {},
	description = "",
): LinearIssueView {
	return {
		id: id(6, n),
		identifier: `AGT-${n}`,
		title,
		description,
		url: `https://linear.app/lumen-labs/issue/AGT-${n}`,
		team,
		state: at,
		creator: marcus,
		createdAt: `2026-09-${(n % 3) + 28}T16:0${n % 10}:00.000Z`,
		fields: { ...NO_FIELDS, state: at.id, ...fields },
		version: `2026-09-30T17:${String(n).padStart(2, "0")}:00.000Z`,
	};
}

export const flickerIssue = issue(
	1,
	"Sidebar flickers on workspace switch",
	todo,
	{ assignee: lena.id, labels: [bug.id, desktop.id] },
);

export const triageIssue = issue(
	2,
	"Sidebar flashes white when I change workspace",
	triage,
	{},
	"When I switch workspace the left bar flashes white for a moment. macOS 26, desktop 1.33.0.\n\n**Steps**\n\n1. Open two workspaces\n2. Press `⌘2`\n\n- [ ] Happens in light theme\n- [x] Happens in dark theme",
);

export const LONG_DESCRIPTION = [
	"## What happens",
	"The terminal loses its scrollback after the laptop sleeps for more than an hour.",
	"## Steps",
	"1. Start a long build in a workspace terminal",
	"2. Close the lid for an hour",
	"3. Open it again",
	"## Expected",
	"The scrollback is still there, as it is after a short sleep.",
	"## Notes",
	"* Seen on macOS 26 only",
	"* The daemon log shows `pty restore: 0 bytes`",
	'```ts\nawait attach({ restore: "lazy" })\n```',
	"> We saw the same thing in [the September canary](https://example.com/canary).",
	"More detail follows in the linked thread. The restore buffer is dropped when the socket is half-open, and the second dial is refused.",
	"cc @marcus",
].join("\n\n");

export const triageActions: CardAction[] = [
	{ id: "accept", label: "Accept", style: "primary", role: "primary" },
	{ id: "decline", label: "Decline", style: "secondary", role: "dismiss" },
	{
		id: "duplicate",
		label: "Mark as duplicate",
		style: "secondary",
		role: "other",
	},
	{ id: "snooze", label: "Snooze", style: "secondary", role: "other" },
];

export const triageView: LinearTriageView = {
	kind: "linear.triage",
	account,
	issue: triageIssue,
	options,
	suggested: {},
	duplicateOf: null,
	comment: "",
	snoozedUntil: null,
	priorityRequired: false,
	defaultState: backlog.id,
};

export const suggestedTriageView: LinearTriageView = {
	...triageView,
	suggested: { priority: 2, assignee: lena.id, labels: [bug.id, desktop.id] },
	duplicateOf: flickerIssue,
	comment:
		"Looks like the same flicker as AGT-1. @lena.fischer can you confirm?",
};

export const editIssue = issue(
	3,
	"Add a keyboard shortcut to archive a workspace",
	backlog,
	{ labels: [feature.id] },
	"Archiving needs the context menu.\n\nIt should have a shortcut.\n\n- Works from the sidebar",
);

export const editActions: CardAction[] = [
	{ id: "apply", label: "Apply changes", style: "primary", role: "primary" },
	{ id: "dismiss", label: "Keep as is", style: "secondary", role: "dismiss" },
];

export const editView: LinearEditView = {
	kind: "linear.edit",
	account,
	issue: editIssue,
	options,
	proposed: {
		title: "Add ⌘⇧A to archive the workspace in focus",
		description:
			"Archiving needs the context menu.\n\nIt should have a shortcut: `⌘⇧A`.\n\n- Works from the sidebar\n- Works from the workspace itself",
		fields: { priority: 3, assignee: riya.id, state: todo.id },
	},
};

function comment(
	n: number,
	author: LinearPersonView,
	minute: number,
	body: string,
	reactions: LinearCommentView["reactions"] = [],
): LinearCommentView {
	return {
		id: id(7, n),
		body,
		author,
		createdAt: `2026-09-30T16:${String(minute).padStart(2, "0")}:00.000Z`,
		edited: false,
		reactions,
	};
}

export const threadIssue = issue(
	6,
	"Cloud workspace takes 40 s to open on mobile",
	inProgress,
	{ priority: 2, assignee: riya.id },
);

export const rootComment = comment(
	1,
	marcus,
	10,
	'Most of the attach time is the terminal restore. Can we show the shell first and restore **after**?\n\n```ts\nawait attach({ restore: "lazy" })\n```',
	[
		{
			emoji: "+1",
			count: 2,
			mine: id(8, 1),
			names: ["Riya Kapoor", "Lena Fischer"],
		},
	],
);

export const replyComment = comment(
	2,
	lena,
	14,
	"Tried it: first paint drops to ~14 s. Restore still blocks input for a second though. @riya what do you think?",
	[{ emoji: "eyes", count: 1, mine: null, names: ["Marcus Oyelaran"] }],
);

export const threadActions: CardAction[] = [
	{ id: "reply", label: "Reply", style: "primary", role: "primary" },
	{ id: "react", label: "React", style: "secondary", role: "other" },
];

export const threadView: LinearThreadView = {
	kind: "linear.thread",
	account,
	issue: threadIssue,
	mentionable: [lena, marcus, riya],
	root: rootComment,
	replies: [replyComment],
	draft: "",
	version: replyComment.id,
};

export const bulkIssues: LinearIssueView[] = [
	issue(7, "Terminal scrollback lost after sleep", inReview, {
		assignee: marcus.id,
	}),
	issue(8, "Pane focus ring is one pixel off", inProgress, {
		assignee: lena.id,
	}),
	issue(9, "Archive shortcut is missing on Linux", todo),
	issue(10, "Diff pane keeps a stale rename", inReview, { assignee: riya.id }),
	issue(11, "Tooltip clips at the window edge", backlog),
];

export const bulkActions: CardAction[] = [
	{
		id: "apply",
		label: "Apply to issues",
		style: "primary",
		role: "primary",
		confirm: "Change the selected issues in Agent Test? This card holds 5.",
	},
	{ id: "dismiss", label: "Keep as is", style: "secondary", role: "dismiss" },
];

export const bulkView: LinearBulkView = {
	kind: "linear.bulk",
	account,
	team,
	issues: bulkIssues,
	options,
	proposed: { state: done.id },
	comment: "Shipped in 1.33.0.",
};

export const disabledActions = (actions: CardAction[], reason: string) =>
	actions.map((action) => ({ ...action, disabled: reason }));
