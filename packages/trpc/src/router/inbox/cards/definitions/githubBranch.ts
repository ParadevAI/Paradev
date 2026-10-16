import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type GithubBranchView,
	withInput,
} from "../types";
import {
	agentPrompt,
	startedAgent,
	startedInput,
	startedNotice,
} from "./agentStarted";
import { githubFor, personSchema, repoFacts } from "./githubClient";
import { loadPull, type PullRefs, pullRefs, writable } from "./githubPull";

const MISSING_SHOWN = 5;
const PROMPT_MAX = 2000;

const compareSchema = z.object({
	ahead_by: z.number(),
	behind_by: z.number(),
});

const commitsSchema = z.array(
	z.object({
		sha: z.string(),
		commit: z.object({
			message: z.string(),
			author: z.object({ name: z.string().optional() }).nullable(),
		}),
		author: personSchema.nullable().optional(),
	}),
);

const updateInput = z.object({
	method: z.enum(["merge", "rebase"]),
	/** `pull.sha` from the view: the head the reader saw. */
	sha: z.string().regex(/^[0-9a-f]{40}$/),
});

const updatedSchema = z.object({
	updatePullRequestBranch: z.object({
		pullRequest: z.object({ headRefOid: z.string() }),
	}),
});

interface Data {
	name: string;
	nodeId: string;
	sha: string;
	state: GithubBranchView["state"];
	head: string;
	base: string;
	writable: true | string;
	plan: GithubBranchView["plan"];
}

export const githubBranch = defineCard<PullRefs, Data>({
	type: "github.branch",
	tier: "update",
	label: "Branch out of date",
	ask: "Update branch",
	brand: "github",
	refs: z.object(pullRefs),
	async resolve({ refs, ctx }) {
		const github = await githubFor(ctx);
		const repo = `${refs.owner}/${refs.repo}`;
		const [pull, facts] = await Promise.all([
			loadPull(github, refs),
			repoFacts(github, refs.owner, refs.repo),
		]);
		const { raw } = pull;
		const baseRef = encodeURIComponent(raw.base.ref);
		// Page 2 of one commit: the counts, without the first page's file patches.
		const compared = await github.find(
			`/repos/${repo}/compare/${raw.head.sha}...${baseRef}?per_page=1&page=2`,
			compareSchema,
		);
		if (!compared)
			throw new CardUnavailable(
				"error",
				`GitHub could not compare ${raw.head.ref} with ${raw.base.ref}`,
			);
		const behindBy = compared.ahead_by;
		const missing =
			behindBy > 0
				? await github.get(
						`/repos/${repo}/commits?sha=${baseRef}&per_page=${Math.min(behindBy, MISSING_SHOWN)}`,
						commitsSchema,
					)
				: [];
		const state: Data["state"] =
			pull.view.state !== "open"
				? "current"
				: raw.mergeable === false || raw.mergeable_state === "dirty"
					? "conflicts"
					: raw.mergeable == null
						? "computing"
						: behindBy > 0
							? "behind"
							: "current";
		const sameRepo = raw.head.repo?.full_name === raw.base.repo.full_name;
		const { head, base } = pull.view;
		const plan = {
			merge: `Merge ${base} into ${head} on ${pull.name}?`,
			rebase: `Rebase ${head} onto ${base} and force-push it on ${pull.name}?`,
		};
		const task =
			state === "conflicts"
				? `Rebase ${head} onto ${base} and resolve the conflicts`
				: `Rebase ${head} onto ${base}`;
		const view: GithubBranchView = {
			kind: "github.branch",
			pull: pull.view,
			state,
			behindBy,
			aheadBy: compared.behind_by,
			missing: missing.map((each) => ({
				sha: each.sha,
				message: each.commit.message.split("\n")[0]?.slice(0, 200) ?? "",
				author: each.author?.login ?? each.commit.author?.name ?? null,
			})),
			plan,
			fix: {
				slug: `${refs.repo}-${refs.number}-rebase`,
				title: `${task} (${pull.name})`,
				prompt: agentPrompt(
					[
						`${task} for ${pull.name} (${pull.view.url}).`,
						"Keep the pull request's own changes, run the tests, and push to the same branch.",
					],
					[`Title: ${pull.view.title}`],
					PROMPT_MAX,
				),
			},
		};
		const fields: CardField[] = [
			{ label: "Pull request", value: pull.name, href: pull.view.url },
			{ label: "Branch", value: `${head} → ${base}`, mono: true },
			{ label: "Behind", value: `${behindBy} commits` },
			{ label: "Ahead", value: `${view.aheadBy} commits` },
		];
		return {
			title: pull.view.title,
			subtitle: pull.name,
			status:
				pull.view.state === "merged"
					? { tone: "done", text: "Merged" }
					: pull.view.state === "closed"
						? { tone: "neutral", text: "Closed" }
						: state === "conflicts"
							? { tone: "bad", text: "Conflicts" }
							: state === "behind"
								? { tone: "warn", text: "Out of date" }
								: state === "computing"
									? { tone: "neutral", text: "Checking" }
									: { tone: "good", text: "Up to date" },
			fields,
			view,
			data: {
				name: pull.name,
				nodeId: raw.node_id,
				sha: raw.head.sha,
				state,
				head,
				base,
				// A fork's branch belongs to its owner; GitHub decides at the write.
				writable: writable(pull, sameRepo ? facts.canPush : true),
				plan,
			},
		};
	},
	actions: {
		update: {
			label: () => "Update branch",
			style: "primary",
			role: "primary",
			available: (data) => {
				if (data.writable !== true) return data.writable;
				if (data.state === "conflicts")
					return `${data.head} conflicts with ${data.base}. Resolve it with an agent or on your machine`;
				if (data.state === "computing")
					return "GitHub is still checking this branch. Try again in a moment";
				if (data.state === "current")
					return `Already up to date with ${data.base}`;
				return true;
			},
			confirmFor: (data, raw) => {
				const input = updateInput.safeParse(raw);
				return input.success ? data.plan[input.data.method] : "";
			},
			run: withInput(updateInput, async ({ data, ctx, input }) => {
				if (input.sha !== data.sha)
					throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
				const github = await githubFor(ctx);
				const answer = updatedSchema.safeParse(
					await github.graphql(
						"mutation($id: ID!, $sha: GitObjectID!, $method: PullRequestBranchUpdateMethod!) { updatePullRequestBranch(input: { pullRequestId: $id, expectedHeadOid: $sha, updateMethod: $method }) { pullRequest { headRefOid } } }",
						{
							id: data.nodeId,
							sha: data.sha,
							method: input.method === "rebase" ? "REBASE" : "MERGE",
						},
					),
				);
				const head = answer.success
					? answer.data.updatePullRequestBranch.pullRequest.headRefOid
					: null;
				return {
					outcome: {
						updated: input.method,
						sha: head && head !== data.sha ? head : null,
					},
					notice: {
						tone: "good",
						text:
							input.method === "rebase"
								? `Asked GitHub to rebase ${data.head} onto ${data.base}`
								: `Asked GitHub to merge ${data.base} into ${data.head}`,
					},
				};
			}),
		},
		started: {
			label: (data) =>
				data.state === "conflicts"
					? "Resolve with an agent"
					: "Rebase with an agent",
			style: "secondary",
			role: "other",
			applies: (data) => data.state === "behind" || data.state === "conflicts",
			run: withInput(startedInput, async ({ data, ctx, input }) => {
				const started = await startedAgent(ctx, input.workspace);
				return {
					outcome: { started },
					notice: { tone: "good", text: startedNotice(started, data.name) },
				};
			}),
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { updated: null } };
			},
		},
	},
});
