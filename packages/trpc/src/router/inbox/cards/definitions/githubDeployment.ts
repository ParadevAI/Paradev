import { z } from "zod";
import {
	type CardContext,
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type GithubDeploymentView,
	type GithubEnvironmentView,
	withInput,
} from "../types";
import { githubFor, personSchema, repoRefs, toPerson } from "./githubClient";

interface Refs {
	owner: string;
	repo: string;
	run: number;
}

const COMMENT_MAX = 500;

const runSchema = z.object({
	id: z.number(),
	name: z.string().nullable().optional(),
	run_number: z.number().optional(),
	display_title: z.string().optional(),
	html_url: z.string(),
	head_branch: z.string().nullable(),
	head_sha: z.string(),
	event: z.string(),
	status: z.string().nullable(),
	actor: personSchema.nullable().optional(),
});

const pendingSchema = z.array(
	z.object({
		environment: z.object({
			id: z.number(),
			name: z.string(),
			html_url: z.string().optional(),
		}),
		wait_timer: z.number(),
		current_user_can_approve: z.boolean(),
		reviewers: z.array(
			z.object({
				type: z.string(),
				reviewer: z.object({
					login: z.string().optional(),
					name: z.string().nullable().optional(),
					slug: z.string().optional(),
					avatar_url: z.string().optional(),
				}),
			}),
		),
	}),
);

const reviewInput = z.object({
	/** The ids of the environments the reader left checked. */
	environments: z.array(z.number().int()).min(1).max(20),
	comment: z.string().trim().max(COMMENT_MAX).default(""),
});

interface Data {
	repo: string;
	environments: GithubEnvironmentView[];
	plan: GithubDeploymentView["plan"];
}

function chosen(data: Data, raw: unknown) {
	const input = reviewInput.safeParse(raw);
	if (!input.success) return null;
	const picked = [...new Set(input.data.environments)].map((id) =>
		data.environments.find((each) => each.id === id && each.canApprove),
	);
	if (picked.some((each) => !each))
		throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
	return picked.flatMap((each) => (each ? [each] : []));
}

const fill = (clause: string, environments: GithubEnvironmentView[]) =>
	clause.replace("{environments}", () =>
		environments.map((each) => each.name).join(", "),
	);

function review(state: "approved" | "rejected") {
	const key = state === "approved" ? "approve" : "reject";
	return {
		available: (data: Data) => {
			if (data.environments.length === 0)
				return "Nothing on this run is waiting for approval";
			if (!data.environments.some((each) => each.canApprove))
				return `You are not a reviewer for ${data.environments.map((each) => each.name).join(", ")}`;
			return true as const;
		},
		confirmFor: (data: Data, raw: unknown) => {
			const picked = chosen(data, raw);
			return picked ? fill(data.plan[key], picked) : "";
		},
		run: withInput(
			reviewInput,
			async ({
				refs,
				data,
				ctx,
				input,
			}: {
				refs: Refs;
				data: Data;
				ctx: CardContext;
				input: z.infer<typeof reviewInput>;
			}) => {
				const picked = chosen(data, input) ?? [];
				const github = await githubFor(ctx);
				await github.write(
					"POST",
					`/repos/${refs.owner}/${refs.repo}/actions/runs/${refs.run}/pending_deployments`,
					{
						environment_ids: picked.map((each) => each.id),
						state,
						comment: input.comment,
					},
				);
				const names = picked.map((each) => each.name);
				return {
					outcome: { state, environments: names, comment: input.comment },
					notice: {
						tone:
							state === "approved" ? ("good" as const) : ("neutral" as const),
						text: `${state === "approved" ? "Approved" : "Rejected"} the deployment to ${names.join(", ")}`,
					},
				};
			},
		),
	};
}

export const githubDeployment = defineCard<Refs, Data>({
	type: "github.deployment",
	label: "Deployment waiting for approval",
	ask: "Review deployment",
	brand: "github",
	refs: z.object({ ...repoRefs, run: z.number().int().positive() }),
	async resolve({ refs, ctx }) {
		const github = await githubFor(ctx);
		const repo = `${refs.owner}/${refs.repo}`;
		const path = `/repos/${repo}/actions/runs/${refs.run}`;
		const run = await github.find(path, runSchema);
		if (!run)
			throw new CardUnavailable(
				"no_access",
				`Not accessible with your GitHub account (${repo}, run ${refs.run})`,
			);
		const pending = await github.get(
			`${path}/pending_deployments`,
			pendingSchema,
		);
		const environments = pending.map(
			(each): GithubEnvironmentView => ({
				id: each.environment.id,
				name: each.environment.name,
				url: each.environment.html_url ?? null,
				waitTimer: each.wait_timer,
				canApprove: each.current_user_can_approve,
				reviewers: each.reviewers.map(({ type, reviewer }) => ({
					kind: type === "Team" ? "team" : "user",
					name: reviewer.login ?? reviewer.name ?? reviewer.slug ?? "",
					avatarUrl: reviewer.avatar_url ?? null,
				})),
			}),
		);
		const title = run.display_title ?? run.name ?? "Workflow run";
		const workflow = `${run.name ?? "Workflow"}${run.run_number ? ` #${run.run_number}` : ""}`;
		const what = `${workflow} (${run.head_branch ?? "no branch"} at ${run.head_sha.slice(0, 7)}) on ${repo}`;
		const plan = {
			approve: `Approve the deployment to {environments} of ${what}?`,
			reject: `Reject the deployment to {environments} of ${what}?`,
		};
		const view: GithubDeploymentView = {
			kind: "github.deployment",
			repo,
			run: {
				id: run.id,
				name: workflow,
				title,
				url: run.html_url,
				branch: run.head_branch,
				sha: run.head_sha,
				event: run.event,
				actor: run.actor ? toPerson(run.actor) : null,
				status: run.status ?? "",
			},
			environments,
			plan,
		};
		const fields: CardField[] = [
			{ label: "Run", value: `${workflow}: ${title}`, href: run.html_url },
			{ label: "Repository", value: repo },
			...(run.head_branch
				? [{ label: "Branch", value: run.head_branch, mono: true }]
				: []),
			{
				label: "Waiting on",
				value: environments.map((each) => each.name).join(", ") || "Nothing",
			},
		];
		return {
			title,
			subtitle: `${repo} · ${view.run.name}`,
			status:
				environments.length > 0
					? { tone: "warn", text: "Waiting for approval" }
					: { tone: "neutral", text: "Nothing waiting" },
			fields,
			view,
			data: { repo, environments, plan },
		};
	},
	actions: {
		approve: {
			label: () => "Approve and deploy",
			style: "primary",
			role: "primary",
			...review("approved"),
		},
		reject: {
			label: () => "Reject",
			style: "danger",
			role: "other",
			...review("rejected"),
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { state: null } };
			},
		},
	},
});
