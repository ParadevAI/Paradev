import { z } from "zod";
import { CardUnavailable, type GithubPullView } from "../types";
import { type Github, personSchema, repoRefs, toPerson } from "./githubClient";

export const pullRefs = {
	...repoRefs,
	number: z.number().int().positive(),
};

export interface PullRefs {
	owner: string;
	repo: string;
	number: number;
}

const pullSchema = z.object({
	node_id: z.string(),
	number: z.number(),
	title: z.string(),
	state: z.enum(["open", "closed"]),
	draft: z.boolean().optional(),
	merged: z.boolean().optional(),
	mergeable: z.boolean().nullable().optional(),
	mergeable_state: z.string().optional(),
	maintainer_can_modify: z.boolean().optional(),
	html_url: z.string(),
	additions: z.number().optional(),
	deletions: z.number().optional(),
	changed_files: z.number().optional(),
	user: personSchema.nullable(),
	head: z.object({
		ref: z.string(),
		sha: z.string(),
		label: z.string(),
		repo: z.object({ full_name: z.string() }).nullable(),
	}),
	base: z.object({
		ref: z.string(),
		sha: z.string(),
		repo: z.object({ full_name: z.string() }),
	}),
});

export interface LoadedPull {
	raw: z.infer<typeof pullSchema>;
	view: GithubPullView;
	name: string;
}

export async function loadPull(
	github: Github,
	refs: PullRefs,
): Promise<LoadedPull> {
	const raw = await github.find(
		`/repos/${refs.owner}/${refs.repo}/pulls/${refs.number}`,
		pullSchema,
	);
	const repo = `${refs.owner}/${refs.repo}`;
	if (!raw)
		throw new CardUnavailable(
			"no_access",
			`Not accessible with your GitHub account (${repo}#${refs.number})`,
		);
	return {
		raw,
		name: `${repo}#${raw.number}`,
		view: {
			repo,
			number: raw.number,
			title: raw.title,
			url: raw.html_url,
			state: raw.merged ? "merged" : raw.state,
			draft: raw.draft ?? false,
			author: raw.user ? toPerson(raw.user) : null,
			head: raw.head.ref,
			base: raw.base.ref,
			sha: raw.head.sha,
		},
	};
}

export function writable(pull: LoadedPull, canPush: boolean): true | string {
	if (pull.view.state === "merged") return "This pull request is merged";
	if (pull.view.state === "closed") return "This pull request is closed";
	if (!canPush) return `Your GitHub account cannot write to ${pull.view.repo}`;
	return true;
}

const CHECK_PAGES = 3;

const checkRunsSchema = z.object({
	total_count: z.number(),
	check_runs: z.array(
		z.object({
			id: z.number(),
			name: z.string(),
			status: z.string(),
			conclusion: z.string().nullable(),
			html_url: z.string().nullable().optional(),
			details_url: z.string().nullable().optional(),
			app: z.object({ slug: z.string().optional() }).nullable().optional(),
		}),
	),
});
export type CheckRun = z.infer<typeof checkRunsSchema>["check_runs"][number];

export async function checkRuns(
	github: Github,
	repo: string,
	sha: string,
): Promise<CheckRun[]> {
	const runs: CheckRun[] = [];
	for (let page = 1; page <= CHECK_PAGES; page++) {
		const read = await github.get(
			`/repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`,
			checkRunsSchema,
		);
		runs.push(...read.check_runs);
		if (runs.length >= read.total_count || read.check_runs.length === 0) break;
	}
	return runs;
}
