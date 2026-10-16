import { z } from "zod";
import { type CardField, CardUnavailable, defineCard } from "../types";
import { githubFor, repoFacts } from "./githubClient";
import { checkRuns, loadPull, type PullRefs, pullRefs } from "./githubPull";

const reviewsSchema = z.array(
	z.object({
		state: z.string(),
		user: z.object({ login: z.string() }).nullable(),
	}),
);

interface PullData {
	number: number;
	name: string;
	repo: string;
	login: string;
	merged: boolean;
	open: boolean;
	draft: boolean;
	blocked: boolean;
	canPush: boolean;
	isAdmin: boolean;
	head: string;
	base: string;
	sha: string;
}

const path = (refs: PullRefs) => `/repos/${refs.owner}/${refs.repo}`;

/**
 * The purest structural block on the machine: branch protection refuses the
 * agent's token, and the work is done. Everything shown here is GitHub's
 * answer to the reader's own token, fetched when the page opens.
 */
export const githubPullRequest = defineCard<PullRefs, PullData>({
	type: "github.pull_request",
	label: "GitHub pull request",
	ask: "Merge pull request",
	brand: "github",
	refs: z.object(pullRefs),
	async resolve({ refs, ctx }) {
		const github = await githubFor(ctx);
		const repo = `${refs.owner}/${refs.repo}`;
		const [pull, facts] = await Promise.all([
			loadPull(github, refs),
			repoFacts(github, refs.owner, refs.repo),
		]);
		const [runs, reviews, viewer] = await Promise.all([
			checkRuns(github, repo, pull.view.sha).catch(() => []),
			github
				.find(
					`${path(refs)}/pulls/${refs.number}/reviews?per_page=100`,
					reviewsSchema,
				)
				.catch(() => null),
			github.find("/user", z.object({ login: z.string() })).catch(() => null),
		]);
		const green = runs.filter(
			(run) => run.conclusion === "success" || run.conclusion === "skipped",
		).length;
		const red = runs.filter(
			(run) =>
				run.conclusion === "failure" ||
				run.conclusion === "timed_out" ||
				run.conclusion === "cancelled",
		).length;
		const pending = runs.filter((run) => run.status !== "completed").length;
		const approvals = new Set(
			(reviews ?? [])
				.filter((review) => review.state === "APPROVED" && review.user)
				.map((review) => review.user?.login),
		).size;
		const { view, raw } = pull;
		const data: PullData = {
			number: view.number,
			name: pull.name,
			repo,
			login: viewer?.login ?? "you",
			merged: view.state === "merged",
			open: view.state === "open",
			draft: view.draft,
			blocked: raw.mergeable_state === "blocked",
			canPush: facts.canPush,
			isAdmin: facts.isAdmin,
			head: view.head,
			base: view.base,
			sha: view.sha,
		};
		const checksText =
			runs.length === 0
				? "No checks"
				: red > 0
					? `${red} of ${runs.length} failing`
					: pending > 0
						? `${pending} of ${runs.length} still running`
						: `${green} of ${runs.length} green`;
		const fields: CardField[] = [
			{ label: "Pull request", value: view.url, href: view.url },
			{ label: "Branch", value: `${view.head} → ${view.base}`, mono: true },
			{ label: "Checks", value: checksText },
			{
				label: "Reviews",
				value:
					approvals === 0
						? "No approvals yet"
						: approvals === 1
							? "1 approval"
							: `${approvals} approvals`,
			},
			{
				label: "Changes",
				value: `+${raw.additions ?? 0} −${raw.deletions ?? 0} in ${raw.changed_files ?? 0} ${raw.changed_files === 1 ? "file" : "files"}`,
			},
			...(view.author ? [{ label: "Author", value: view.author.login }] : []),
		];
		return {
			title: view.title,
			subtitle: pull.name,
			status: data.merged
				? { tone: "done" as const, text: "Merged" }
				: !data.open
					? { tone: "bad" as const, text: "Closed" }
					: data.draft
						? { tone: "neutral" as const, text: "Draft" }
						: red > 0
							? { tone: "bad" as const, text: "Checks failing" }
							: data.blocked
								? { tone: "warn" as const, text: "Protected branch" }
								: raw.mergeable === false
									? { tone: "warn" as const, text: "Conflicts" }
									: { tone: "good" as const, text: "Ready" },
			fields,
			data,
		};
	},
	actions: {
		merge: {
			label: (data) => `Merge #${data.number}`,
			style: "primary",
			role: "primary",
			available: (data) => {
				if (data.merged) return "Already merged";
				if (!data.open) return "This pull request is closed";
				if (data.draft) return "Still a draft";
				if (!data.canPush)
					return `Your GitHub account cannot push to ${data.repo}`;
				if (data.blocked && !data.isAdmin)
					return `Merging ${data.base} needs admin on ${data.repo}`;
				return true;
			},
			confirm: (data) =>
				`Squash-merge ${data.head} at ${data.sha.slice(0, 7)} into ${data.base} as ${data.login}.`,
			async run({ refs, data, ctx }) {
				const github = await githubFor(ctx);
				const merged = z
					.object({ sha: z.string(), merged: z.boolean() })
					.safeParse(
						await github.write(
							"PUT",
							`${path(refs)}/pulls/${refs.number}/merge`,
							{ merge_method: "squash", sha: data.sha },
						),
					);
				const sha = merged.success ? merged.data.sha : null;
				return {
					outcome: { merged: merged.success ? merged.data.merged : true, sha },
					notice: {
						tone: "good",
						text: sha ? `Merged as ${sha.slice(0, 7)}` : "Merged",
					},
				};
			},
		},
		comment: {
			label: () => "Comment",
			style: "secondary",
			role: "other",
			input: "Your comment, posted under your GitHub account",
			terminal: false,
			available: (data) => (data.open ? true : "This pull request is closed"),
			async run({ refs, ctx, input }) {
				if (!input?.trim())
					throw new CardUnavailable("error", "A comment needs text");
				const github = await githubFor(ctx);
				const posted = z
					.object({ html_url: z.string() })
					.safeParse(
						await github.write(
							"POST",
							`${path(refs)}/issues/${refs.number}/comments`,
							{ body: input },
						),
					);
				return {
					outcome: {
						commented: true,
						url: posted.success ? posted.data.html_url : null,
					},
				};
			},
		},
		close: {
			label: () => "Close without merging",
			style: "danger",
			role: "other",
			available: (data) => (data.open ? true : "Already closed"),
			confirm: (data) => `Close #${data.number} without merging ${data.head}.`,
			async run({ refs, ctx }) {
				const github = await githubFor(ctx);
				await github.write("PATCH", `${path(refs)}/pulls/${refs.number}`, {
					state: "closed",
				});
				return { outcome: { closed: true } };
			},
		},
	},
});
