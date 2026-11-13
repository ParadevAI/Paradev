import type { Octokit } from "@octokit/rest";
import type { ExecGh } from "../../../../trpc/router/workspace-creation/utils/exec-gh";
import { parseMergedAt } from "../github-query";

// A merge queue (Graphite) runs CI on its own branch, pushes the squashed commit
// to the base branch, then closes the PR. The commit date is when the queue
// rebased, so it comes before the close by up to one CI run.
const LOOKBACK_MS = 3 * 60 * 60_000;
const LOOKAHEAD_MS = 10 * 60_000;

const COMMITS_JQ =
	'if type == "array" then [.[] | {message: .commit.message, date: .commit.committer.date}] else . end';

export interface ClosedPullRequest {
	number: number;
	baseRefName: string;
	closedAt: number;
}

interface RepositoryRef {
	owner: string;
	name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * The time a PR's squashed commit landed on its base branch, found by the
 * `(#<number>)` suffix that squash merges put on the subject line.
 */
export function findLandedMergeTime(
	commits: unknown,
	prNumber: number,
): number | null {
	if (!Array.isArray(commits)) return null;
	const suffix = `(#${prNumber})`;
	for (const commit of commits) {
		if (!isRecord(commit) || typeof commit.message !== "string") continue;
		const subject = commit.message.split("\n", 1)[0]?.trim() ?? "";
		if (!subject.endsWith(suffix)) continue;
		return parseMergedAt(typeof commit.date === "string" ? commit.date : null);
	}
	return null;
}

function window(pr: ClosedPullRequest) {
	return {
		since: new Date(pr.closedAt - LOOKBACK_MS).toISOString(),
		until: new Date(pr.closedAt + LOOKAHEAD_MS).toISOString(),
	};
}

export async function fetchLandedMergeTimeFromGh(
	execGh: ExecGh,
	repository: RepositoryRef,
	pr: ClosedPullRequest,
): Promise<number | null> {
	const { since, until } = window(pr);
	const raw = await execGh([
		"api",
		"--method",
		"GET",
		`repos/${repository.owner}/${repository.name}/commits`,
		"-f",
		`sha=${pr.baseRefName}`,
		"-f",
		`since=${since}`,
		"-f",
		`until=${until}`,
		"-f",
		"per_page=100",
		"--jq",
		COMMITS_JQ,
	]);
	return findLandedMergeTime(raw, pr.number);
}

export async function fetchLandedMergeTime(
	octokit: Octokit,
	repository: RepositoryRef,
	pr: ClosedPullRequest,
): Promise<number | null> {
	const { since, until } = window(pr);
	const response = await octokit.rest.repos.listCommits({
		owner: repository.owner,
		repo: repository.name,
		sha: pr.baseRefName,
		since,
		until,
		per_page: 100,
	});
	return findLandedMergeTime(
		response.data.map((item) => ({
			message: item.commit.message,
			date: item.commit.committer?.date ?? null,
		})),
		pr.number,
	);
}

const CLOSED_PULL_REQUEST_JQ = "{merged_at, closed_at, base_ref: .base.ref}";

function toClosedPullRequest(
	raw: unknown,
	number: number,
): ClosedPullRequest | null {
	if (!isRecord(raw) || raw.merged_at) return null;
	const closedAt = parseMergedAt(
		typeof raw.closed_at === "string" ? raw.closed_at : null,
	);
	const baseRefName = typeof raw.base_ref === "string" ? raw.base_ref : null;
	if (closedAt == null || !baseRefName) return null;
	return { number, baseRefName, closedAt };
}

/** Reads the close time and base branch of a closed, unmerged PR; null otherwise. */
export async function fetchClosedPullRequestFromGh(
	execGh: ExecGh,
	repository: RepositoryRef,
	number: number,
): Promise<ClosedPullRequest | null> {
	const raw = await execGh([
		"api",
		"--method",
		"GET",
		`repos/${repository.owner}/${repository.name}/pulls/${number}`,
		"--jq",
		CLOSED_PULL_REQUEST_JQ,
	]);
	return toClosedPullRequest(raw, number);
}

export async function fetchClosedPullRequest(
	octokit: Octokit,
	repository: RepositoryRef,
	number: number,
): Promise<ClosedPullRequest | null> {
	const { data } = await octokit.rest.pulls.get({
		owner: repository.owner,
		repo: repository.name,
		pull_number: number,
	});
	return toClosedPullRequest(
		{
			merged_at: data.merged_at,
			closed_at: data.closed_at,
			base_ref: data.base.ref,
		},
		number,
	);
}
