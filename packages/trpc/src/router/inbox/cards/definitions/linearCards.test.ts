import { beforeEach, describe, expect, mock, test } from "bun:test";
import { asShown } from "../testing";
import type { CardContext, ResolvedCard } from "../types";

const U = (n: number) =>
	`00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const ME = U(1);
const AVERY = U(2);
const BOT = U(3);
const STATE = {
	triage: U(10),
	backlog: U(11),
	todo: U(12),
	done: U(13),
	canceled: U(14),
	duplicate: U(15),
};
const LABEL = { bug: U(20), feature: U(21), agent: U(22), group: U(23) };
const CYCLE = U(30);
const PROJECT = U(40);

type Issue = Record<string, unknown> & { id: string; identifier: string };
let issues: Record<string, Issue> = {};
let comments: Record<string, unknown>[] = [];
let priorityRequired = false;
let calls: { op: string; variables: Record<string, unknown> }[] = [];
let commentFails: "before" | "after" | null = null;
let posts = new Map<
	string,
	{
		issue: { id: string };
		parent: { id: string } | null;
		user: { isMe: boolean };
	}
>();
let updateFails = false;

const person = (id: string, name: string, app = false) => ({
	id,
	name,
	displayName: name.split(" ")[0]?.toLowerCase() ?? name,
	avatarUrl: null,
	app,
	active: true,
});

function issue(n: number, over: Record<string, unknown> = {}): Issue {
	return {
		id: U(100 + n),
		identifier: `AGT-${n}`,
		title: `Issue ${n}`,
		description: "Body",
		url: `https://linear.app/x/issue/AGT-${n}`,
		createdAt: "2099-01-01T00:00:00.000Z",
		updatedAt: "2099-01-02T00:00:00.000Z",
		snoozedUntilAt: null,
		trashed: false,
		priority: 0,
		estimate: null,
		team: { id: U(50), key: "AGT", name: "Agent Test" },
		state: { id: STATE.triage, name: "Triage", type: "triage", color: "#f00" },
		assignee: null,
		creator: person(AVERY, "Avery Chen"),
		labels: { nodes: [] },
		cycle: null,
		project: null,
		...over,
	};
}

const team = () => ({
	id: U(50),
	key: "AGT",
	name: "Agent Test",
	issueEstimationType: "fibonacci",
	issueEstimationAllowZero: false,
	issueEstimationExtended: false,
	requirePriorityToLeaveTriage: priorityRequired,
	defaultIssueState: { id: STATE.backlog },
	states: {
		nodes: [
			{
				id: STATE.done,
				name: "Done",
				type: "completed",
				color: "#0f0",
				position: 4,
			},
			{
				id: STATE.triage,
				name: "Triage",
				type: "triage",
				color: "#f00",
				position: 0,
			},
			{
				id: STATE.todo,
				name: "Todo",
				type: "unstarted",
				color: "#ccc",
				position: 2,
			},
			{
				id: STATE.backlog,
				name: "Backlog",
				type: "backlog",
				color: "#999",
				position: 1,
			},
			{
				id: STATE.canceled,
				name: "Canceled",
				type: "canceled",
				color: "#666",
				position: 5,
			},
			{
				id: STATE.duplicate,
				name: "Duplicate",
				type: "duplicate",
				color: "#666",
				position: 6,
			},
		],
	},
	labels: {
		nodes: [
			{
				id: LABEL.feature,
				name: "Feature",
				color: "#b8f",
				isGroup: false,
				parent: { name: "Type" },
			},
			{
				id: LABEL.bug,
				name: "Bug",
				color: "#e55",
				isGroup: false,
				parent: { name: "Type" },
			},
			{
				id: LABEL.agent,
				name: "Agent",
				color: "#5ae",
				isGroup: false,
				parent: null,
			},
			{
				id: LABEL.group,
				name: "Type",
				color: "#fff",
				isGroup: true,
				parent: null,
			},
		],
	},
	members: {
		nodes: [
			person(BOT, "Devin", true),
			person(ME, "Satya Patel"),
			person(AVERY, "Avery Chen"),
		],
	},
	cycles: {
		nodes: [
			{
				id: CYCLE,
				number: 1,
				name: null,
				startsAt: "2099-01-05T00:00:00.000Z",
				endsAt: "2099-01-19T00:00:00.000Z",
			},
		],
	},
	projects: {
		nodes: [{ id: PROJECT, name: "Agent Test project", color: "#abc" }],
	},
});

const gql = async (
	document: string,
	variables: Record<string, unknown> = {},
) => {
	if (document.includes("issueUpdate(")) {
		if (updateFails) throw new Error("socket hang up");
		calls.push({ op: "issueUpdate", variables });
		return { issueUpdate: { success: true } };
	}
	if (document.includes("issueBatchUpdate(")) {
		calls.push({ op: "issueBatchUpdate", variables });
		return { issueBatchUpdate: { success: true } };
	}
	if (document.includes("commentCreate(")) {
		const input = variables.input as {
			id: string;
			issueId: string;
			parentId?: string;
		};
		const store = () =>
			posts.set(input.id, {
				issue: { id: input.issueId },
				parent: input.parentId ? { id: input.parentId } : null,
				user: { isMe: true },
			});
		if (commentFails === "before") throw new Error("socket hang up");
		if (commentFails === "after") {
			commentFails = null;
			store();
			throw new Error("socket hang up");
		}
		if (posts.has(input.id)) throw new Error("already exists");
		store();
		calls.push({ op: "commentCreate", variables });
		return { commentCreate: { success: true } };
	}
	if (document.includes("issueRelationCreate(")) {
		calls.push({ op: "issueRelationCreate", variables });
		return { issueRelationCreate: { success: true } };
	}
	if (document.includes("reactionCreate(")) {
		calls.push({ op: "reactionCreate", variables });
		return { reactionCreate: { success: true } };
	}
	if (document.includes("reactionDelete(")) {
		calls.push({ op: "reactionDelete", variables });
		return { reactionDelete: { success: true } };
	}
	if (document.includes("children(first")) {
		const root = comments.find((comment) => comment.id === variables.id);
		return {
			comment: {
				...root,
				children: {
					nodes: comments.filter(
						(comment) =>
							(comment.parent as { id: string } | null)?.id === variables.id,
					),
				},
			},
		};
	}
	if (document.includes("comment(id: $id) { issue")) {
		const posted = posts.get(String(variables.id));
		return { comment: posted ?? null };
	}
	if (document.includes("comment(id: $id) { id parent")) {
		const found = comments.find((comment) => comment.id === variables.id);
		return {
			comment: found ? { ...found, issue: { id: issues.a1?.id } } : null,
		};
	}
	if (document.includes("comments(first: 1")) {
		const roots = comments
			.filter((comment) => !comment.parent)
			.sort(
				(a, b) =>
					Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)),
			);
		return { issue: { comments: { nodes: roots.slice(0, 1) } } };
	}
	if (document.includes("issues(filter:")) {
		const filter = variables.filter as {
			or: {
				id?: { in: string[] };
				and?: [{ team: { key: { eq: string } } }, { number: { eq: number } }];
			}[];
		};
		return {
			issues: {
				nodes: Object.values(issues).filter((item) =>
					filter.or.some(
						(part) =>
							part.id?.in.includes(item.id) ||
							(part.and &&
								item.identifier ===
									`${part.and[0].team.key.eq}-${part.and[1].number.eq}`),
					),
				),
			},
		};
	}
	if (document.includes("team(id:"))
		return {
			team: team(),
			viewer: person(ME, "Satya Patel"),
			organization: { name: "Superset" },
		};
	if (document.includes("issue(id:")) {
		const found = Object.values(issues).find(
			(item) => item.id === variables.id || item.identifier === variables.id,
		);
		return { issue: found ?? null };
	}
	throw new Error(`unexpected document: ${document.slice(0, 60)}`);
};

const actual = await import("./linearClient");
mock.module("./linearClient", () => ({ ...actual, linearFor: () => gql }));

const SEEN = "2099-01-02T00:00:00.000Z";
const { linearTriage } = await import("./linearTriage");
const { writeId } = await import("./linearIssues");
const { linearEdit } = await import("./linearEdit");
const { linearThread } = await import("./linearThread");
const linearBulk = asShown((await import("./linearBulk")).linearBulk);

const ctx: CardContext = {
	readerId: "reader",
	organizationId: "org",
	card: {
		id: "card1",
		agentSessionId: "s",
		workspaceId: null,
		hostId: null,
		waiting: false,
		fromSuperset: false,
	},
};
type View<K extends string> = Extract<
	NonNullable<ResolvedCard["view"]>,
	{ kind: K }
>;

beforeEach(() => {
	issues = {
		a1: issue(1, {
			state: { id: STATE.todo, name: "Todo", type: "unstarted", color: "#ccc" },
		}),
		a2: issue(2),
		a3: issue(3),
	};
	comments = [];
	priorityRequired = false;
	calls = [];
	commentFails = null;
	posts = new Map();
	updateFails = false;
});

describe("linear.triage", () => {
	const refs = {
		issue: "AGT-2",
		duplicate_of: "AGT-1",
		priority: "high",
		labels: "bug, Agent, Nope",
		assignee: "me",
		state: "todo",
		cycle: 1,
		project: "agent test project",
		estimate: 3,
		comment: "Looks real.",
	};

	test("the pickers offer the team's statuses in Linear's order, without triage and duplicate", async () => {
		const card = await linearTriage.resolve(refs, ctx);
		const view = card.view as View<"linear.triage">;
		expect(view.options.states.map((state) => state.name)).toEqual([
			"Backlog",
			"Todo",
			"Done",
			"Canceled",
		]);
		expect(
			view.options.members.map(
				(member) => `${member.name}${member.app ? " (app)" : ""}`,
			),
		).toEqual(["Avery Chen", "Satya Patel", "Devin (app)"]);
		expect(
			view.options.labels.map((label) => `${label.name}:${label.group}`),
		).toEqual(["Agent:null", "Bug:Type", "Feature:Type"]);
		expect(view.options.estimates.map((estimate) => estimate.label)).toEqual([
			"1 Point",
			"2 Points",
			"3 Points",
			"5 Points",
			"8 Points",
		]);
	});

	test("what the agent names becomes ids; a name the team lacks is dropped", async () => {
		const card = await linearTriage.resolve(refs, ctx);
		const view = card.view as View<"linear.triage">;
		expect(view.suggested).toEqual({
			state: STATE.todo,
			priority: 2,
			assignee: ME,
			labels: [LABEL.bug, LABEL.agent],
			cycle: CYCLE,
			project: PROJECT,
			estimate: 3,
		});
		expect(view.duplicateOf?.identifier).toBe("AGT-1");
		expect(view.comment).toBe("Looks real.");
		expect(card.actions.map((action) => action.id)).toEqual([
			"accept",
			"decline",
			"duplicate",
			"snooze",
		]);
	});

	test("accept posts the comment, then sets the chosen properties", async () => {
		const { result } = await linearTriage.act(refs, "accept", ctx, {
			version: SEEN,
			state: STATE.todo,
			priority: 2,
			assignee: ME,
			labels: [LABEL.bug],
			cycle: CYCLE,
			project: PROJECT,
			estimate: 3,
			comment: "Looks real.",
		});
		expect(calls.map((call) => call.op)).toEqual([
			"commentCreate",
			"issueUpdate",
		]);
		expect(calls[1]?.variables).toEqual({
			id: issues.a2?.id,
			input: {
				stateId: STATE.todo,
				priority: 2,
				assigneeId: ME,
				labelIds: [LABEL.bug],
				cycleId: CYCLE,
				projectId: PROJECT,
				estimate: 3,
			},
		});
		expect((calls[0]?.variables.input as { body: string }).body).toBe(
			"Looks real.",
		);
		expect(result.notice?.text).toBe("Issue accepted");
	});

	test("an issue edited since the reader looked is not accepted over", async () => {
		await expect(
			linearTriage.act(refs, "accept", ctx, {
				version: "2099-01-01T00:00:00.000Z",
			}),
		).rejects.toThrow("changed in Linear");
		expect(calls).toEqual([]);
	});

	test("a comment that fails leaves the issue in triage, so the reader can try again", async () => {
		commentFails = "before";
		await expect(
			linearTriage.act(refs, "accept", ctx, {
				version: SEEN,
				comment: "Looks real.",
			}),
		).rejects.toThrow("socket hang up");
		await expect(
			linearTriage.act(refs, "decline", ctx, { comment: "No." }),
		).rejects.toThrow("socket hang up");
		await expect(
			linearTriage.act(refs, "duplicate", ctx, {
				of: issues.a1?.id,
				comment: "Dup.",
			}),
		).rejects.toThrow("socket hang up");
		expect(calls).toEqual([]);
	});

	test("accept with no status goes to the team's default; no comment posts none", async () => {
		await linearTriage.act(refs, "accept", ctx, { version: SEEN });
		expect(calls).toEqual([
			{
				op: "issueUpdate",
				variables: { id: issues.a2?.id, input: { stateId: STATE.backlog } },
			},
		]);
	});

	test("a team that needs a priority refuses an accept without one", async () => {
		priorityRequired = true;
		await expect(
			linearTriage.act(refs, "accept", ctx, { version: SEEN }),
		).rejects.toThrow("needs a priority");
		expect(calls).toEqual([]);
	});

	test("an id the pickers do not offer is refused", async () => {
		const accept = (input: Record<string, unknown>) =>
			linearTriage.act(refs, "accept", ctx, { version: SEEN, ...input });
		await expect(accept({ state: STATE.triage })).rejects.toThrow(
			"status is not one this team has",
		);
		await expect(accept({ assignee: U(999) })).rejects.toThrow("assignee");
		await expect(
			accept({ labels: [LABEL.bug, LABEL.feature] }),
		).rejects.toThrow("one label of a group");
		expect(calls).toEqual([]);
	});

	test("decline posts the reason, then moves it to the canceled status", async () => {
		await linearTriage.act(refs, "decline", ctx, {
			comment: "Cannot reproduce.",
		});
		expect(calls[0]?.op).toBe("commentCreate");
		expect(calls[1]?.variables).toEqual({
			id: issues.a2?.id,
			input: { stateId: STATE.canceled },
		});
	});

	test("duplicate links the original with an id a retry repeats; Linear moves the status itself", async () => {
		const first = await linearTriage.act(refs, "duplicate", ctx, {
			of: issues.a1?.id,
		});
		await linearTriage.act(refs, "duplicate", ctx, { of: issues.a1?.id });
		const inputs = calls.map(
			(call) => call.variables.input as Record<string, string>,
		);
		expect(calls.map((call) => call.op)).toEqual([
			"issueRelationCreate",
			"issueRelationCreate",
		]);
		expect(inputs[0]).toMatchObject({
			issueId: issues.a2?.id,
			relatedIssueId: issues.a1?.id,
			type: "duplicate",
		});
		expect(inputs[0]?.id).toBe(inputs[1]?.id as string);
		expect(first.result.notice?.text).toBe("Marked as a duplicate of AGT-1");
		await expect(
			linearTriage.act(refs, "duplicate", ctx, { of: issues.a2?.id }),
		).rejects.toThrow("duplicate of itself");
	});

	test("snooze takes a future time within a year", async () => {
		await linearTriage
			.act(refs, "snooze", ctx, { until: "2099-01-01T09:00:00-08:00" })
			.catch((error) =>
				expect(String(error.message)).toContain("a year at most"),
			);
		const soon = new Date(Date.now() + 3_600_000).toISOString();
		await linearTriage.act(refs, "snooze", ctx, { until: soon });
		expect(calls).toEqual([
			{
				op: "issueUpdate",
				variables: { id: issues.a2?.id, input: { snoozedUntilAt: soon } },
			},
		]);
		await expect(
			linearTriage.act(refs, "snooze", ctx, { until: "2001-01-01T00:00:00Z" }),
		).rejects.toThrow("has passed");
	});

	test("an issue that left triage offers nothing to do", async () => {
		const card = await linearTriage.resolve({ issue: "AGT-1" }, ctx);
		expect(
			card.actions.every(
				(action) => action.disabled === "AGT-1 is no longer in triage",
			),
		).toBe(true);
	});

	test("an issue the account cannot see is gone", async () => {
		const card = await linearTriage.resolve({ issue: "AGT-99" }, ctx);
		expect(card.state).toBe("gone");
	});

	test("a comment that reached Linear before the connection dropped is not posted twice", async () => {
		commentFails = "after";
		await linearTriage.act(refs, "decline", ctx, {
			comment: "Cannot reproduce.",
		});
		await linearTriage.act(refs, "decline", ctx, {
			comment: "Cannot reproduce.",
		});
		expect(calls.map((call) => call.op)).toEqual([
			"issueUpdate",
			"issueUpdate",
		]);
		expect(posts.size).toBe(1);
	});

	test("a comment under the same id on another issue, or by someone else, does not count as posted", async () => {
		commentFails = "before";
		const id = writeId(ctx, [issues.a2?.id ?? "", "", "Cannot reproduce."]);
		posts.set(id, {
			issue: { id: "elsewhere" },
			parent: null,
			user: { isMe: true },
		});
		await expect(
			linearTriage.act(refs, "decline", ctx, { comment: "Cannot reproduce." }),
		).rejects.toThrow("socket hang up");
		posts.set(id, {
			issue: { id: issues.a2?.id ?? "" },
			parent: null,
			user: { isMe: false },
		});
		await expect(
			linearTriage.act(refs, "decline", ctx, { comment: "Cannot reproduce." }),
		).rejects.toThrow("socket hang up");
		expect(calls).toEqual([]);
	});

	test("a status change that fails after the comment posted is retried without a second comment", async () => {
		updateFails = true;
		await expect(
			linearTriage.act(refs, "accept", ctx, {
				version: SEEN,
				comment: "Looks real.",
			}),
		).rejects.toThrow("socket hang up");
		updateFails = false;
		await linearTriage.act(refs, "accept", ctx, {
			version: SEEN,
			comment: "Looks real.",
		});
		expect(calls.map((call) => call.op)).toEqual([
			"commentCreate",
			"issueUpdate",
		]);
		expect(posts.size).toBe(1);
	});

	test("a label the issue holds that the team no longer lists stays in the picker", async () => {
		const retired = {
			id: U(29),
			name: "Retired",
			color: "#000",
			isGroup: false,
			parent: null,
		};
		issues.a2 = issue(2, {
			labels: { nodes: [retired] },
			assignee: person(U(4), "Gone Person"),
			cycle: {
				id: U(31),
				number: 0,
				name: null,
				startsAt: "2098-12-01T00:00:00.000Z",
				endsAt: "2098-12-15T00:00:00.000Z",
			},
		});
		const view = (await linearTriage.resolve({ issue: "AGT-2" }, ctx))
			.view as View<"linear.triage">;
		expect(view.options.labels.map((label) => label.name)).toContain("Retired");
		expect(view.options.members.map((member) => member.name)).toContain(
			"Gone Person",
		);
		expect(view.options.cycles.map((cycle) => cycle.number)).toEqual([0, 1]);
		expect(view.defaultState).toBe(STATE.backlog);
	});

	test("an agent cannot suggest an app as the assignee", async () => {
		const view = (
			await linearTriage.resolve({ issue: "AGT-2", assignee: "Devin" }, ctx)
		).view as View<"linear.triage">;
		expect(view.suggested).toEqual({});
	});
});

describe("linear.edit", () => {
	const refs = {
		issue: "AGT-1",
		title: "A clearer title",
		description: "Body",
		priority: "none",
		state: "Done",
		labels: "Bug",
	};

	test("only what differs from the issue is proposed", async () => {
		const card = await linearEdit.resolve(refs, ctx);
		const view = card.view as View<"linear.edit">;
		expect(view.proposed).toEqual({
			title: "A clearer title",
			description: null,
			fields: { state: STATE.done, labels: [LABEL.bug] },
		});
	});

	test("apply writes the reader's values when the issue is as they saw it", async () => {
		await linearEdit.act(refs, "apply", ctx, {
			version: "2099-01-02T00:00:00.000Z",
			title: "Edited title",
			description: "New body",
			state: STATE.done,
			assignee: null,
		});
		expect(calls).toEqual([
			{
				op: "issueUpdate",
				variables: {
					id: issues.a1?.id,
					input: {
						stateId: STATE.done,
						assigneeId: null,
						title: "Edited title",
						description: "New body",
					},
				},
			},
		]);
	});

	test("apply refuses an issue edited since, and an empty change", async () => {
		await expect(
			linearEdit.act(refs, "apply", ctx, {
				version: "2099-01-01T00:00:00.000Z",
				title: "x",
			}),
		).rejects.toThrow("changed in Linear");
		await expect(
			linearEdit.act(refs, "apply", ctx, {
				version: "2099-01-02T00:00:00.000Z",
			}),
		).rejects.toThrow("nothing to change");
		expect(calls).toEqual([]);
	});

	test("keep as is changes nothing", async () => {
		const { result } = await linearEdit.act(refs, "dismiss", ctx, undefined);
		expect(result.outcome).toEqual({ applied: [] });
		expect(calls).toEqual([]);
	});
});

describe("linear.thread", () => {
	const comment = (n: number, over: Record<string, unknown> = {}) => ({
		id: U(200 + n),
		body: `Comment ${n}`,
		createdAt: `2099-01-0${n}T00:00:00.000Z`,
		editedAt: null,
		parent: null,
		user: person(AVERY, "Avery Chen"),
		botActor: null,
		reactions: [],
		...over,
	});
	beforeEach(() => {
		comments = [
			comment(3, { parent: { id: U(201) }, user: person(ME, "Satya Patel") }),
			comment(1, {
				reactions: [
					{ id: "r1", emoji: "+1", user: { id: ME, name: "Satya Patel" } },
					{ id: "r2", emoji: "+1", user: { id: AVERY, name: "Avery Chen" } },
					{ id: "r3", emoji: "eyes", user: { id: AVERY, name: "Avery Chen" } },
				],
			}),
			comment(2, {
				parent: { id: U(201) },
				editedAt: "2099-01-03T00:00:00.000Z",
			}),
			comment(4),
		];
	});
	const refs = { issue: "AGT-1", comment: U(203), reply: "On it." };

	test("a reply names its thread: the root, then replies oldest first", async () => {
		const card = await linearThread.resolve(refs, ctx);
		const view = card.view as View<"linear.thread">;
		expect(view.root.body).toBe("Comment 1");
		expect(
			view.replies.map(
				(reply) => `${reply.body}${reply.edited ? " (edited)" : ""}`,
			),
		).toEqual(["Comment 2 (edited)", "Comment 3"]);
		expect(view.root.reactions).toEqual([
			{
				emoji: "+1",
				count: 2,
				mine: "r1",
				names: ["Satya Patel", "Avery Chen"],
			},
			{ emoji: "eyes", count: 1, mine: null, names: ["Avery Chen"] },
		]);
		expect(view.mentionable.map((member) => member.handle)).toEqual([
			"avery",
			"satya",
		]);
		expect(view.draft).toBe("On it.");
	});

	test("with no comment named, the newest thread", async () => {
		const card = await linearThread.resolve({ issue: "AGT-1" }, ctx);
		expect((card.view as View<"linear.thread">).root.body).toBe("Comment 4");
	});

	test("reply posts under the thread's root", async () => {
		const { result } = await linearThread.act(refs, "reply", ctx, {
			body: " On it. ",
			root: U(201),
			seen: U(203),
		});
		const input = calls[0]?.variables.input as Record<string, unknown>;
		expect({
			issueId: input.issueId,
			parentId: input.parentId,
			body: input.body,
		}).toEqual({
			issueId: issues.a1?.id,
			parentId: U(201),
			body: "On it.",
		});
		expect(result.terminal).toBe(true);
	});

	test("a reply to a thread that grew, or that is no longer the one shown, is refused", async () => {
		await expect(
			linearThread.act(refs, "reply", ctx, {
				body: "On it.",
				root: U(201),
				seen: U(202),
			}),
		).rejects.toThrow("thread changed in Linear");
		await expect(
			linearThread.act({ issue: "AGT-1" }, "reply", ctx, {
				body: "On it.",
				root: U(201),
				seen: U(203),
			}),
		).rejects.toThrow("thread changed in Linear");
		expect(calls).toEqual([]);
	});

	test("react adds a reaction, takes the reader's own back, and leaves the card open", async () => {
		const added = await linearThread.act(refs, "react", ctx, {
			comment: U(201),
			emoji: "rocket",
			on: true,
		});
		const removed = await linearThread.act(refs, "react", ctx, {
			comment: U(201),
			emoji: "+1",
			on: false,
		});
		expect(calls).toEqual([
			{
				op: "reactionCreate",
				variables: { input: { commentId: U(201), emoji: "rocket" } },
			},
			{ op: "reactionDelete", variables: { id: "r1" } },
		]);
		expect(added.result.terminal).toBe(false);
		expect(removed.result.outcome).toEqual({ reacted: false, emoji: "+1" });
		await expect(
			linearThread.act(refs, "react", ctx, {
				comment: U(204),
				emoji: "+1",
				on: true,
			}),
		).rejects.toThrow("not in this thread");
	});

	test("a reaction the reader already has is not added twice, and one they lack is not taken back", async () => {
		await linearThread.act(refs, "react", ctx, {
			comment: U(201),
			emoji: "+1",
			on: true,
		});
		await linearThread.act(refs, "react", ctx, {
			comment: U(201),
			emoji: "eyes",
			on: false,
		});
		expect(calls).toEqual([]);
	});

	test("an issue with no comments says so", async () => {
		comments = [];
		expect(
			(await linearThread.resolve({ issue: "AGT-1" }, ctx)).notice?.text,
		).toBe("This issue has no comments yet");
	});
});

describe("linear.bulk", () => {
	const refs = {
		issues: "AGT-1, AGT-2,AGT-3, AGT-2, AGT-77",
		change: "close",
		comment: "Done in the cleanup.",
	};

	test("close proposes the team's done status for the issues it can see", async () => {
		const card = await linearBulk.resolve(refs, ctx);
		const view = card.view as View<"linear.bulk">;
		expect(card.title).toBe("Close 3 issues");
		expect(view.issues.map((item) => item.identifier)).toEqual([
			"AGT-1",
			"AGT-2",
			"AGT-3",
		]);
		expect(view.proposed).toEqual({ state: STATE.done });
		expect(card.actions[0]?.confirm).toBe(
			"Apply this to the checked issues in Agent Test?",
		);
	});

	test("apply changes the chosen issues in one request, adds labels to each issue's own, and comments on each", async () => {
		const { result } = await linearBulk.act(refs, "apply", ctx, {
			issues: [issues.a1?.id, issues.a3?.id],
			state: STATE.canceled,
			labels: [LABEL.agent],
			comment: "Done in the cleanup.",
		});
		expect(calls[0]).toEqual({
			op: "issueBatchUpdate",
			variables: {
				ids: [issues.a1?.id, issues.a3?.id],
				input: { stateId: STATE.canceled, addedLabelIds: [LABEL.agent] },
			},
		});
		expect(
			calls
				.slice(1)
				.map((call) => (call.variables.input as { issueId: string }).issueId),
		).toEqual([issues.a1?.id, issues.a3?.id]);
		expect(result.notice?.text).toBe("2 issues changed");
	});

	test("the title says Close only when the proposed status closes", async () => {
		const reopened = await linearBulk.resolve(
			{ issues: "AGT-1,AGT-2", change: "close", state: "Backlog" },
			ctx,
		);
		expect(reopened.title).toBe("Change 2 issues");
	});

	test("an issue that is not on the card, or nothing to change, is refused", async () => {
		await expect(
			linearBulk.act(refs, "apply", ctx, {
				issues: [U(999)],
				state: STATE.done,
			}),
		).rejects.toThrow("not on this card");
		await expect(
			linearBulk.act(refs, "apply", ctx, { issues: [issues.a1?.id] }),
		).rejects.toThrow("nothing to change");
		expect(calls).toEqual([]);
	});

	test("issues of two teams are refused", async () => {
		issues.b1 = issue(9, {
			identifier: "SUP-9",
			team: { id: U(51), key: "SUP", name: "Other" },
		});
		const card = await linearBulk.resolve(
			{ issues: "AGT-1,SUP-9", change: "move" },
			ctx,
		);
		expect(card.notice?.text).toBe("Those issues are in more than one team");
	});
});
