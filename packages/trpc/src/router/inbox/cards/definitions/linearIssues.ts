import { createHash } from "node:crypto";
import { z } from "zod";
import {
	type CardContext,
	CardUnavailable,
	type LinearFieldsView,
	type LinearIssueView,
	type LinearOptionsView,
	type LinearPersonView,
	type LinearStateType,
	type LinearStateView,
} from "../types";
import type { LinearQuery } from "./linearClient";

/** An identifier like AGT-12, or the issue's id. */
export const ISSUE_REF = /^([A-Za-z][A-Za-z0-9]{0,9}-\d{1,7}|[0-9a-f-]{36})$/;
export const LINEAR_ID = /^[0-9a-f-]{36}$/;
export const COMMENT_MAX = 8000;
export const DRAFT_MAX = 8000;

const PERSON = "id name displayName avatarUrl app";
const LABEL = "id name color isGroup parent { name }";
const CYCLE = "id number name startsAt endsAt";
const ISSUE_FIELDS = `id identifier title description url createdAt updatedAt snoozedUntilAt trashed priority estimate
	team { id key name }
	state { id name type color }
	assignee { ${PERSON} }
	creator { ${PERSON} }
	labels { nodes { ${LABEL} } }
	cycle { ${CYCLE} }
	project { id name color }`;

interface RawPerson {
	id: string;
	name: string;
	displayName: string;
	avatarUrl: string | null;
	app: boolean;
	active?: boolean;
	isAssignable?: boolean;
}

interface RawLabel {
	id: string;
	name: string;
	color: string;
	isGroup: boolean;
	parent: { name: string } | null;
}

interface RawCycle {
	id: string;
	number: number;
	name: string | null;
	startsAt: string;
	endsAt: string;
}

export interface RawIssue {
	id: string;
	identifier: string;
	title: string;
	description: string | null;
	url: string;
	createdAt: string;
	updatedAt: string;
	snoozedUntilAt: string | null;
	trashed: boolean | null;
	priority: number;
	estimate: number | null;
	team: { id: string; key: string; name: string };
	state: { id: string; name: string; type: LinearStateType; color: string };
	assignee: RawPerson | null;
	creator: RawPerson | null;
	labels: { nodes: RawLabel[] };
	cycle: RawCycle | null;
	project: { id: string; name: string; color: string } | null;
}

interface RawTeam {
	id: string;
	key: string;
	name: string;
	issueEstimationType: string;
	issueEstimationAllowZero: boolean;
	issueEstimationExtended: boolean;
	requirePriorityToLeaveTriage: boolean;
	defaultIssueState: { id: string } | null;
	states: { nodes: (LinearStateView & { position: number })[] };
	labels: { nodes: RawLabel[] };
	members: { nodes: RawPerson[] };
	cycles: { nodes: RawCycle[] };
	projects: { nodes: { id: string; name: string; color: string }[] };
}

export function toPerson(person: RawPerson): LinearPersonView {
	return {
		id: person.id,
		name: person.name || person.displayName,
		handle: person.displayName,
		avatar: person.avatarUrl,
		app: person.app,
	};
}

/** `brief` leaves the description out, for a card that lists issues without showing their text. */
export function toIssueView(issue: RawIssue, brief = false): LinearIssueView {
	return {
		id: issue.id,
		identifier: issue.identifier,
		title: issue.title,
		description: brief ? "" : (issue.description ?? ""),
		url: issue.url,
		team: issue.team,
		state: issue.state,
		creator: issue.creator ? toPerson(issue.creator) : null,
		createdAt: issue.createdAt,
		fields: {
			state: issue.state.id,
			priority: issue.priority,
			assignee: issue.assignee?.id ?? null,
			labels: issue.labels.nodes.map((label) => label.id),
			cycle: issue.cycle?.id ?? null,
			project: issue.project?.id ?? null,
			estimate: issue.estimate,
		},
		version: issue.updatedAt,
	};
}

export async function loadIssue(
	gql: LinearQuery,
	ref: string,
): Promise<RawIssue> {
	const { issue } = await gql<{ issue: RawIssue | null }>(
		`query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
		{ id: ref },
	).catch((error) => {
		if (error instanceof CardUnavailable && error.state === "gone")
			return { issue: null };
		throw error;
	});
	if (!issue || issue.trashed)
		throw new CardUnavailable(
			"gone",
			"That issue is not one your Linear account can see",
		);
	return issue;
}

export interface LinearAccount {
	workspace: string;
	viewer: LinearPersonView;
}

const STATE_ORDER: LinearStateType[] = [
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
];

const SCALES: Record<string, { base: number[]; extended: number[] }> = {
	fibonacci: { base: [1, 2, 3, 5, 8], extended: [13, 21] },
	exponential: { base: [1, 2, 4, 8, 16], extended: [32, 64] },
	linear: { base: [1, 2, 3, 4, 5], extended: [6, 7] },
	tShirt: { base: [1, 2, 3, 5, 8], extended: [13, 21] },
};

const SHIRT: Record<number, string> = {
	0: "No size",
	1: "XS",
	2: "S",
	3: "M",
	5: "L",
	8: "XL",
	13: "XXL",
	21: "XXXL",
};

export function estimateScale(team: {
	issueEstimationType: string;
	issueEstimationAllowZero: boolean;
	issueEstimationExtended: boolean;
}): LinearOptionsView["estimates"] {
	const scale = SCALES[team.issueEstimationType];
	if (!scale) return [];
	const values = [
		...(team.issueEstimationAllowZero ? [0] : []),
		...scale.base,
		...(team.issueEstimationExtended ? scale.extended : []),
	];
	return values.map((value) => ({
		value,
		label:
			team.issueEstimationType === "tShirt"
				? (SHIRT[value] ?? String(value))
				: value === 1
					? "1 Point"
					: `${value} Points`,
	}));
}

export interface TeamFacts {
	options: LinearOptionsView;
	account: LinearAccount;
	priorityRequired: boolean;
	/** Where an accepted issue goes when the reader picks no status. */
	defaultState: string | null;
}

const toLabel = (label: RawLabel) => ({
	id: label.id,
	name: label.name,
	color: label.color,
	group: label.parent?.name ?? null,
});

/** The team's pickers, plus whatever these issues hold that the team's lists no longer carry, so every current value can be drawn and kept. */
export function toTeamFacts(
	team: RawTeam,
	account: LinearAccount,
	issues: RawIssue[] = [],
): TeamFacts {
	const states = [...team.states.nodes]
		.filter((state) => STATE_ORDER.includes(state.type))
		.sort(
			(a, b) =>
				STATE_ORDER.indexOf(a.type) - STATE_ORDER.indexOf(b.type) ||
				a.position - b.position,
		);
	const byId = <T extends { id: string }>(listed: T[], held: (T | null)[]) => {
		const all = [...listed];
		for (const item of held)
			if (item && !all.some((known) => known.id === item.id)) all.push(item);
		return all;
	};
	const people = byId(
		team.members.nodes.filter(
			(member) => member.active !== false && member.isAssignable !== false,
		),
		issues.map((issue) => issue.assignee),
	).sort(
		(a, b) => Number(a.app) - Number(b.app) || a.name.localeCompare(b.name),
	);
	const inTeam = new Set(team.projects.nodes.map((project) => project.id));
	return {
		options: {
			states: states.map(({ id, name, type, color }) => ({
				id,
				name,
				type,
				color,
			})),
			members: people.map(toPerson),
			labels: byId(
				team.labels.nodes,
				issues.flatMap((issue) => issue.labels.nodes),
			)
				.filter((label) => !label.isGroup)
				.map(toLabel)
				.sort((a, b) => a.name.localeCompare(b.name)),
			cycles: byId(
				team.cycles.nodes,
				issues.map((issue) => issue.cycle),
			).sort((a, b) => a.number - b.number),
			projects: byId(
				team.projects.nodes,
				issues.map((issue) => issue.project),
			).map((project) => ({ ...project, inTeam: inTeam.has(project.id) })),
			estimates: estimateScale(team),
		},
		account,
		priorityRequired: team.requirePriorityToLeaveTriage,
		defaultState: team.defaultIssueState?.id ?? null,
	};
}

export async function loadTeam(
	gql: LinearQuery,
	teamId: string,
	issues: RawIssue[] = [],
): Promise<TeamFacts> {
	const data = await gql<{
		team: RawTeam;
		viewer: RawPerson;
		organization: { name: string };
	}>(
		`query($team: String!) {
			viewer { ${PERSON} }
			organization { name }
			team(id: $team) {
				id key name issueEstimationType issueEstimationAllowZero issueEstimationExtended requirePriorityToLeaveTriage
				defaultIssueState { id }
				states { nodes { id name type color position } }
				labels(first: 250) { nodes { ${LABEL} } }
				members(first: 250) { nodes { ${PERSON} active isAssignable } }
				cycles(first: 50, filter: { isPast: { eq: false } }) { nodes { ${CYCLE} } }
				projects(first: 100, filter: { status: { type: { nin: ["completed", "canceled"] } } }) { nodes { id name color } }
			}
		}`,
		{ team: teamId },
	);
	return toTeamFacts(
		data.team,
		{ workspace: data.organization.name, viewer: toPerson(data.viewer) },
		issues,
	);
}

const PRIORITY_WORDS: Record<string, number> = {
	none: 0,
	"no priority": 0,
	urgent: 1,
	high: 2,
	medium: 3,
	normal: 3,
	low: 4,
};

/** What an agent may write for each property: Linear's id, or the name a person would use. */
export const suggestionRefs = {
	state: z.string().max(80).optional(),
	priority: z
		.union([z.number().int().min(0).max(4), z.string().max(20)])
		.optional(),
	assignee: z.string().max(120).optional(),
	/** Comma-separated. */
	labels: z.string().max(500).optional(),
	cycle: z.union([z.number().int(), z.string().max(40)]).optional(),
	project: z.string().max(120).optional(),
	estimate: z.number().min(0).max(64).optional(),
};

export interface SuggestionRefs {
	state?: string;
	priority?: number | string;
	assignee?: string;
	labels?: string;
	cycle?: number | string;
	project?: string;
	estimate?: number;
}

const same = (a: string, b: string) =>
	a.trim().toLowerCase() === b.trim().toLowerCase();

/** The agent's suggestions as the ids the pickers hold; one that names nothing the team has is dropped. */
export function resolveSuggested(
	refs: SuggestionRefs,
	{ options, account }: TeamFacts,
): Partial<LinearFieldsView> {
	const suggested: Partial<LinearFieldsView> = {};
	const named = <T extends { id: string; name: string }>(
		list: T[],
		value: string,
	) => list.find((item) => item.id === value || same(item.name, value));
	if (refs.state) {
		const state = named(options.states, refs.state);
		if (state) suggested.state = state.id;
	}
	if (refs.priority !== undefined) {
		const priority =
			typeof refs.priority === "number"
				? refs.priority
				: (PRIORITY_WORDS[refs.priority.trim().toLowerCase()] ??
					(/^[0-4]$/.test(refs.priority.trim())
						? Number(refs.priority)
						: undefined));
		if (priority !== undefined) suggested.priority = priority;
	}
	if (refs.assignee) {
		const wanted = refs.assignee;
		const person = options.members.find(
			(member) =>
				!member.app &&
				(same(wanted, "me")
					? member.id === account.viewer.id
					: member.id === wanted ||
						same(member.name, wanted) ||
						same(member.handle, wanted)),
		);
		if (person) suggested.assignee = person.id;
	}
	if (refs.labels) {
		const labels = refs.labels
			.split(",")
			.map((name) => named(options.labels, name.trim())?.id)
			.filter((id): id is string => Boolean(id));
		if (labels.length) suggested.labels = [...new Set(labels)];
	}
	if (refs.cycle !== undefined) {
		const cycle = options.cycles.find(
			(item) =>
				item.id === refs.cycle || String(item.number) === String(refs.cycle),
		);
		if (cycle) suggested.cycle = cycle.id;
	}
	if (refs.project) {
		const project = named(options.projects, refs.project);
		if (project) suggested.project = project.id;
	}
	if (
		refs.estimate !== undefined &&
		options.estimates.some((estimate) => estimate.value === refs.estimate)
	)
		suggested.estimate = refs.estimate;
	return suggested;
}

const id = z.string().regex(LINEAR_ID);

/** The properties a reader sends with an action: ids from the pickers, and only the ones to change. */
export const fieldsInput = z.object({
	state: id.optional(),
	priority: z.number().int().min(0).max(4).optional(),
	assignee: id.nullable().optional(),
	labels: z.array(id).max(40).optional(),
	cycle: id.nullable().optional(),
	project: id.nullable().optional(),
	estimate: z.number().min(0).max(64).nullable().optional(),
});
export type FieldsInput = z.infer<typeof fieldsInput>;

const notOffered = (what: string) =>
	new CardUnavailable(
		"error",
		`That ${what} is not one this team has. Look again and pick another`,
	);

/** Linear's update input for the chosen properties, refusing anything the team's pickers do not offer. */
export function toIssueUpdate(
	input: FieldsInput,
	{ options }: TeamFacts,
	/** `add` keeps each issue's own labels and adds these, for a change to many issues at once. */
	labels: "replace" | "add" = "replace",
): Record<string, unknown> {
	const update: Record<string, unknown> = {};
	if (input.state !== undefined) {
		if (!options.states.some((state) => state.id === input.state))
			throw notOffered("status");
		update.stateId = input.state;
	}
	if (input.priority !== undefined) update.priority = input.priority;
	if (input.assignee !== undefined) {
		if (
			input.assignee !== null &&
			!options.members.some((member) => member.id === input.assignee)
		)
			throw notOffered("assignee");
		update.assigneeId = input.assignee;
	}
	if (input.labels !== undefined) {
		const chosen = input.labels.map((labelId) => {
			const label = options.labels.find((item) => item.id === labelId);
			if (!label) throw notOffered("label");
			return label;
		});
		const groups = chosen.map((label) => label.group).filter(Boolean);
		if (new Set(groups).size !== groups.length)
			throw new CardUnavailable(
				"error",
				"An issue takes one label of a group. Remove one and try again",
			);
		const ids = [...new Set(input.labels)];
		if (labels === "replace") update.labelIds = ids;
		else if (ids.length) update.addedLabelIds = ids;
	}
	if (input.cycle !== undefined) {
		if (
			input.cycle !== null &&
			!options.cycles.some((cycle) => cycle.id === input.cycle)
		)
			throw notOffered("cycle");
		update.cycleId = input.cycle;
	}
	if (input.project !== undefined) {
		if (
			input.project !== null &&
			!options.projects.some((project) => project.id === input.project)
		)
			throw notOffered("project");
		update.projectId = input.project;
	}
	if (input.estimate !== undefined) {
		if (
			input.estimate !== null &&
			!options.estimates.some((estimate) => estimate.value === input.estimate)
		)
			throw notOffered("estimate");
		update.estimate = input.estimate;
	}
	return update;
}

export async function updateIssue(
	gql: LinearQuery,
	issueId: string,
	input: Record<string, unknown>,
): Promise<void> {
	if (Object.keys(input).length === 0) return;
	const { issueUpdate } = await gql<{ issueUpdate: { success: boolean } }>(
		"mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
		{ id: issueId, input },
	);
	if (!issueUpdate.success)
		throw new CardUnavailable("no_access", "Linear refused the change");
}

/** One id per card, target and text, so a write that reaches Linear twice lands once. */
export function writeId(ctx: CardContext, parts: string[]): string {
	const hex = createHash("sha256")
		.update([ctx.card?.id ?? ctx.readerId, ...parts].join("\n"))
		.digest("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function postComment(
	gql: LinearQuery,
	ctx: CardContext,
	comment: { issueId: string; body: string; parentId?: string },
): Promise<string> {
	const made = writeId(ctx, [
		comment.issueId,
		comment.parentId ?? "",
		comment.body,
	]);
	await gql(
		"mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }",
		{ input: { id: made, ...comment } },
	).catch(async (error) => {
		const existing = await gql<{
			comment: {
				issue: { id: string } | null;
				parent: { id: string } | null;
				user: { isMe: boolean } | null;
			} | null;
		}>(
			"query($id: String!) { comment(id: $id) { issue { id } parent { id } user { isMe } } }",
			{ id: made },
		).catch(() => null);
		const found = existing?.comment;
		const posted =
			found?.issue?.id === comment.issueId &&
			(found.parent?.id ?? "") === (comment.parentId ?? "") &&
			found.user?.isMe === true;
		if (!posted) throw error;
	});
	return made;
}

export const commentInput = z.string().trim().max(COMMENT_MAX).optional();

const CHANGED = "The issue changed in Linear. Look again before you go on";

/** `issue.version` from the view the reader acted on; a write is refused when Linear has moved past it. */
export const versionInput = z.string().min(1).max(64);

export function assertUnchanged(issue: RawIssue, seen: string): void {
	if (seen !== issue.updatedAt) throw new CardUnavailable("error", CHANGED);
}

/** The issues of one card in one request; ones the account cannot see are left out. */
export async function loadIssues(
	gql: LinearQuery,
	refs: string[],
): Promise<RawIssue[]> {
	const ids = refs.filter((ref) => LINEAR_ID.test(ref));
	const numbered = refs
		.filter((ref) => !LINEAR_ID.test(ref))
		.map((ref) => {
			const cut = ref.lastIndexOf("-");
			return {
				and: [
					{ team: { key: { eq: ref.slice(0, cut).toUpperCase() } } },
					{ number: { eq: Number(ref.slice(cut + 1)) } },
				],
			};
		});
	const { issues } = await gql<{ issues: { nodes: RawIssue[] } }>(
		`query($filter: IssueFilter!) { issues(filter: $filter, first: 50) { nodes { ${ISSUE_FIELDS} } } }`,
		{
			filter: {
				or: [...(ids.length ? [{ id: { in: ids } }] : []), ...numbered],
			},
		},
	);
	const order = (issue: RawIssue) =>
		refs.findIndex(
			(ref) =>
				ref === issue.id ||
				ref.toLowerCase() === issue.identifier.toLowerCase(),
		);
	return issues.nodes
		.filter((issue) => !issue.trashed && order(issue) >= 0)
		.sort((a, b) => order(a) - order(b));
}

/** Who a comment can mention, and who is reading, without the rest of the team's lists. */
export async function loadPeople(
	gql: LinearQuery,
	teamId: string,
): Promise<{ account: LinearAccount; mentionable: LinearPersonView[] }> {
	const data = await gql<{
		team: { members: { nodes: RawPerson[] } };
		viewer: RawPerson;
		organization: { name: string };
	}>(
		`query($team: String!) {
			viewer { ${PERSON} }
			organization { name }
			team(id: $team) { members(first: 250) { nodes { ${PERSON} active } } }
		}`,
		{ team: teamId },
	);
	return {
		account: {
			workspace: data.organization.name,
			viewer: toPerson(data.viewer),
		},
		mentionable: data.team.members.nodes
			.filter((member) => member.active !== false && !member.app)
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(toPerson),
	};
}
