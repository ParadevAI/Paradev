import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type GithubIssueView,
	type GithubLabelView,
	type GithubPersonView,
	withInput,
} from "../types";
import {
	type Github,
	githubFor,
	personSchema,
	repoFacts,
	repoRefs,
	toPerson,
} from "./githubClient";

interface Refs {
	owner: string;
	repo: string;
	number: number;
	labels?: string;
	assignees?: string;
	duplicate_of?: number;
}

const LABEL_PAGES = 3;
const ASSIGNEE_PAGES = 2;
const ASSIGNEES_MAX = 10;
const BODY_MAX = 4000;
const TITLE_SHOWN = 80;

const labelSchema = z.object({
	name: z.string(),
	color: z.string().optional(),
	description: z.string().nullable().optional(),
});

const issueSchema = z.object({
	id: z.number(),
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	html_url: z.string(),
	state: z.enum(["open", "closed"]),
	user: personSchema.nullable(),
	created_at: z.string(),
	comments: z.number(),
	labels: z.array(z.union([z.string(), labelSchema])),
	assignees: z.array(personSchema).nullable().optional(),
	pull_request: z.unknown().optional(),
});

const applyInput = z.object({
	labels: z.array(z.string().min(1).max(100)).max(100),
	assignees: z.array(z.string().min(1).max(100)).max(ASSIGNEES_MAX),
});

interface Data {
	name: string;
	open: boolean;
	canTriage: boolean;
	repo: string;
	current: Chosen;
	labels: Set<string>;
	assignees: Set<string>;
	duplicate:
		| (NonNullable<GithubIssueView["duplicate"]> & { id: number })
		| null;
}

const toLabel = (
	label: z.infer<typeof labelSchema> | string,
): GithubLabelView =>
	typeof label === "string"
		? { name: label, color: "", description: null }
		: {
				name: label.name,
				color: label.color ?? "",
				description: label.description ?? null,
			};

async function pages<T>(
	github: Github,
	path: string,
	schema: z.ZodType<T[]>,
	max: number,
): Promise<T[]> {
	const all: T[] = [];
	for (let page = 1; page <= max; page++) {
		const read = await github.get(`${path}?per_page=100&page=${page}`, schema);
		all.push(...read);
		if (read.length < 100) break;
	}
	return all;
}

const listed = (names: string | undefined) =>
	(names ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);

/** The names the agent proposed that the repository has, spelled as the repository spells them. */
const known = (proposed: string[], options: string[]) =>
	proposed.flatMap((name) => {
		const found = options.find(
			(option) => option.toLowerCase() === name.toLowerCase(),
		);
		return found ? [found] : [];
	});

const shortened = (title: string) =>
	title.length > TITLE_SHOWN
		? `${title.slice(0, TITLE_SHOWN - 1).trimEnd()}…`
		: title;

interface Chosen {
	labels: string[];
	assignees: string[];
}

const PLAN = {
	addLabels: "add labels {names}",
	removeLabels: "remove labels {names}",
	assign: "assign {names}",
	unassign: "unassign {names}",
};

const clause = (template: string, names: string[]) =>
	names.length ? [template.replace("{names}", () => names.join(", "))] : [];

const without = (names: string[], others: string[]) =>
	names.filter((name) => !others.includes(name));

/** GitHub replaces both sets, so the confirm names what that changes from the state the card read. A state that moved on GitHub gives another sentence, and the action is refused. Null when nothing changes. */
export function triageSentence(
	name: string,
	current: Chosen,
	next: Chosen,
): string | null {
	const clauses = [
		...clause(PLAN.addLabels, without(next.labels, current.labels)),
		...clause(PLAN.removeLabels, without(current.labels, next.labels)),
		...clause(PLAN.assign, without(next.assignees, current.assignees)),
		...clause(PLAN.unassign, without(current.assignees, next.assignees)),
	];
	return clauses.length ? `On ${name}: ${clauses.join("; ")}?` : null;
}

export const githubIssue = defineCard<Refs, Data>({
	type: "github.issue",
	label: "Issue triage",
	ask: "Triage issue",
	brand: "github",
	refs: z.object({
		...repoRefs,
		number: z.number().int().positive(),
		/** Comma-separated label names the agent suggests. */
		labels: z.string().max(500).optional(),
		/** Comma-separated logins the agent suggests. */
		assignees: z.string().max(300).optional(),
		duplicate_of: z.number().int().positive().optional(),
	}),
	async resolve({ refs, ctx }) {
		const github = await githubFor(ctx);
		const repo = `${refs.owner}/${refs.repo}`;
		const base = `/repos/${repo}`;
		const [issue, facts, labels, assignees, duplicate] = await Promise.all([
			github.find(`${base}/issues/${refs.number}`, issueSchema),
			repoFacts(github, refs.owner, refs.repo),
			pages(github, `${base}/labels`, z.array(labelSchema), LABEL_PAGES),
			pages(github, `${base}/assignees`, z.array(personSchema), ASSIGNEE_PAGES),
			refs.duplicate_of && refs.duplicate_of !== refs.number
				? github.find(`${base}/issues/${refs.duplicate_of}`, issueSchema)
				: null,
		]);
		const name = `${repo}#${refs.number}`;
		if (!issue)
			throw new CardUnavailable(
				"no_access",
				`Not accessible with your GitHub account (${name})`,
			);
		if (issue.pull_request)
			throw new CardUnavailable(
				"error",
				`${name} is a pull request, not an issue`,
			);
		const current = {
			labels: issue.labels.map(toLabel),
			assignees: (issue.assignees ?? []).map(toPerson),
		};
		const offered = labels.map(toLabel);
		const labelOptions = [
			...offered,
			...current.labels.filter(
				(label) => !offered.some((each) => each.name === label.name),
			),
		];
		const assignable = assignees.map(toPerson);
		const people: GithubPersonView[] = [
			...assignable,
			...current.assignees.filter(
				(person) => !assignable.some((each) => each.login === person.login),
			),
		];
		const other = duplicate?.pull_request ? null : duplicate;
		const view: GithubIssueView = {
			kind: "github.issue",
			repo,
			issue: {
				number: issue.number,
				title: issue.title,
				body: (issue.body ?? "").slice(0, BODY_MAX),
				url: issue.html_url,
				state: issue.state,
				author: issue.user ? toPerson(issue.user) : null,
				createdAt: issue.created_at,
				comments: issue.comments,
				labels: current.labels,
				assignees: current.assignees,
			},
			options: { labels: labelOptions, assignees: people },
			suggested: {
				labels: known(
					listed(refs.labels),
					labelOptions.map((label) => label.name),
				),
				assignees: known(
					listed(refs.assignees),
					people.map((person) => person.login),
				).slice(0, ASSIGNEES_MAX),
			},
			duplicate: other
				? {
						number: other.number,
						title: other.title,
						url: other.html_url,
						state: other.state,
					}
				: null,
			plan: { lead: `On ${name}: `, ...PLAN },
		};
		const fields: CardField[] = [
			{ label: "Issue", value: name, href: issue.html_url },
			{ label: "Opened by", value: issue.user?.login ?? "" },
			{
				label: "Labels",
				value:
					view.issue.labels.map((label) => label.name).join(", ") || "None",
			},
			{
				label: "Assignees",
				value:
					view.issue.assignees.map((person) => person.login).join(", ") ||
					"No one",
			},
			...(view.duplicate
				? [
						{
							label: "Duplicate of",
							value: `#${view.duplicate.number} ${view.duplicate.title}`,
							href: view.duplicate.url,
						},
					]
				: []),
		];
		return {
			title: issue.title,
			subtitle: name,
			status:
				issue.state === "closed"
					? { tone: "done", text: "Closed" }
					: { tone: "neutral", text: "Open" },
			fields,
			body: view.issue.body.slice(0, 500) || undefined,
			view,
			data: {
				name,
				open: issue.state === "open",
				canTriage: facts.canTriage,
				repo,
				current: {
					labels: current.labels.map((label) => label.name),
					assignees: current.assignees.map((person) => person.login),
				},
				labels: new Set(labelOptions.map((label) => label.name)),
				assignees: new Set(people.map((person) => person.login)),
				duplicate:
					other && view.duplicate ? { ...view.duplicate, id: other.id } : null,
			},
		};
	},
	actions: {
		apply: {
			label: () => "Apply",
			style: "primary",
			role: "primary",
			available: (data) =>
				data.canTriage
					? true
					: `Your GitHub account cannot triage issues on ${data.repo}`,
			confirmFor: (data, raw) => {
				const input = applyInput.safeParse(raw);
				return input.success
					? (triageSentence(data.name, data.current, input.data) ?? "")
					: "";
			},
			run: withInput(applyInput, async ({ refs, data, ctx, input }) => {
				if (!triageSentence(data.name, data.current, input))
					throw new CardUnavailable("error", "Nothing to change");
				const stray =
					input.labels.find((label) => !data.labels.has(label)) ??
					input.assignees.find((login) => !data.assignees.has(login));
				if (stray)
					throw new CardUnavailable(
						"error",
						`${stray} is not a label or an assignable person on ${data.repo}`,
					);
				const github = await githubFor(ctx);
				await github.write(
					"PATCH",
					`/repos/${refs.owner}/${refs.repo}/issues/${refs.number}`,
					{ labels: input.labels, assignees: input.assignees },
				);
				return {
					outcome: { labels: input.labels, assignees: input.assignees },
					notice: { tone: "good", text: `Updated ${data.name}` },
				};
			}),
		},
		close_duplicate: {
			label: () => "Close as duplicate",
			style: "secondary",
			role: "other",
			applies: (data) => data.duplicate !== null,
			available: (data) => {
				if (!data.canTriage)
					return `Your GitHub account cannot triage issues on ${data.repo}`;
				return data.open ? true : "Already closed";
			},
			confirm: (data) =>
				`Close ${data.name} as a duplicate of #${data.duplicate?.number} "${shortened(data.duplicate?.title ?? "")}"?`,
			run: withInput(
				z.object({
					/** `duplicate.number` from the view: the issue the reader saw. */
					duplicate: z.number().int().positive(),
				}),
				async ({ refs, data, ctx, input }) => {
					const { duplicate } = data;
					if (!duplicate || input.duplicate !== duplicate.number)
						throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
					const github = await githubFor(ctx);
					await github.write(
						"PATCH",
						`/repos/${refs.owner}/${refs.repo}/issues/${refs.number}`,
						{
							state: "closed",
							state_reason: "duplicate",
							duplicate_issue_id: duplicate.id,
						},
					);
					return {
						outcome: { closed: "duplicate", of: duplicate.number },
						notice: {
							tone: "good",
							text: `Closed ${data.name} as a duplicate of #${duplicate.number}`,
						},
					};
				},
			),
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { triaged: false } };
			},
		},
	},
});
