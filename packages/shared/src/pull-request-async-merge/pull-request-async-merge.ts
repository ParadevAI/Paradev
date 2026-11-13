export type AsyncMergeMethod = "merge" | "squash" | "rebase";

/** `default` uses the base branch's merge queue when it has one. */
export type AsyncMergeAction = "default" | "direct_merge" | "merge_queue";

export type PullRequestMergeProgress =
	| { status: "pending"; uuid: string }
	| { status: "merged" }
	/** In the merge queue: accepted, not merged yet. */
	| { status: "enqueued" }
	/** The repository has no asynchronous merge API. */
	| { status: "unavailable" };

export interface AsyncMergeRequest {
	/** Omitted for a merge queue, which merges with its own method. */
	mergeMethod?: AsyncMergeMethod;
	mergeAction?: AsyncMergeAction;
	/** GitHub cancels the merge when the head moved past this commit. */
	sha?: string;
}

interface AsyncMergeClient {
	request: (
		route: string,
		parameters?: Record<string, unknown>,
	) => Promise<{ data: unknown }>;
}

interface AsyncMergePullRequest {
	owner: string;
	repo: string;
	number: number;
}

/** GitHub took the request and then could not merge. */
export class PullRequestMergeRejectedError extends Error {
	readonly status = 409;

	constructor(message: string) {
		super(message);
		this.name = "PullRequestMergeRejectedError";
	}
}

const MERGE_ASYNC_ROUTE =
	"/repos/{owner}/{repo}/pulls/{pull_number}/merge-async";

interface AsyncMergeResult {
	status: string;
	uuid: string | null;
	message: string | null;
}

function parseResult(data: unknown): AsyncMergeResult | null {
	if (!data || typeof data !== "object") return null;
	const { status, details } = data as { status?: unknown; details?: unknown };
	if (typeof status !== "string") return null;
	const { uuid, message } = (details ?? {}) as {
		uuid?: unknown;
		message?: unknown;
	};
	return {
		status,
		uuid: typeof uuid === "string" && uuid.trim() ? uuid.trim() : null,
		message:
			typeof message === "string" && message.trim() ? message.trim() : null,
	};
}

function toProgress(result: AsyncMergeResult | null): PullRequestMergeProgress {
	switch (result?.status) {
		case "merged":
			return { status: "merged" };
		case "enqueued":
			return { status: "enqueued" };
		case "pending":
			if (!result.uuid) {
				throw new Error("GitHub returned a pending merge without an id.");
			}
			return { status: "pending", uuid: result.uuid };
		case "failed":
			throw new PullRequestMergeRejectedError(
				result.message ?? "GitHub could not merge the pull request.",
			);
		default:
			throw new Error("GitHub returned an invalid merge response.");
	}
}

function errorStatus(error: unknown): number | null {
	return typeof error === "object" && error !== null && "status" in error
		? Number((error as { status: unknown }).status)
		: null;
}

function target(pr: AsyncMergePullRequest) {
	return { owner: pr.owner, repo: pr.repo, pull_number: pr.number };
}

/**
 * GitHub answers a duplicate in-flight request with 409 and the existing
 * request's id, and a closed or draft pull request with 400 and `failed`.
 */
export async function requestPullRequestMerge(
	client: AsyncMergeClient,
	pr: AsyncMergePullRequest,
	request: AsyncMergeRequest = {},
): Promise<PullRequestMergeProgress> {
	let result: AsyncMergeResult | null;
	try {
		const { data } = await client.request(`PUT ${MERGE_ASYNC_ROUTE}`, {
			...target(pr),
			merge_action: request.mergeAction ?? "default",
			...(request.mergeMethod ? { merge_method: request.mergeMethod } : {}),
			...(request.sha ? { sha: request.sha } : {}),
		});
		result = parseResult(data);
	} catch (error) {
		if (errorStatus(error) === 404) return { status: "unavailable" };
		result = parseResult(
			(error as { response?: { data?: unknown } })?.response?.data,
		);
		if (!result) throw error;
	}
	return toProgress(result);
}

/** GitHub keeps a result for 24 hours after its last update. */
export async function readPullRequestMergeResult(
	client: AsyncMergeClient,
	pr: AsyncMergePullRequest,
	uuid: string,
): Promise<PullRequestMergeProgress> {
	const { data } = await client.request(`GET ${MERGE_ASYNC_ROUTE}/{uuid}`, {
		...target(pr),
		uuid,
	});
	return toProgress(parseResult(data));
}
