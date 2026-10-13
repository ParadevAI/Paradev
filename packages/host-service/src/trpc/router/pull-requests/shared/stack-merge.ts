import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { actionRejectionError } from "../../github/github";
import type { RepoIdentity } from "./linked-workspaces";

export type StackMergeOutcome = "merged" | "enqueued";
export type MergeMethod = "merge" | "squash" | "rebase";

const asyncMergeResultSchema = z.object({
	status: z.enum(["pending", "merged", "enqueued", "failed"]),
	details: z
		.object({
			message: z.string().nullish(),
			uuid: z.string().nullish(),
		})
		.nullish(),
});

type AsyncMergeResult = z.infer<typeof asyncMergeResultSchema>;

export type GithubRequest = (
	route: string,
	params: Record<string, unknown>,
) => Promise<{ data: unknown }>;

export interface AsyncMergeOptions {
	request: GithubRequest;
	repo: RepoIdentity;
	prNumber: number;
	mergeMethod: MergeMethod;
	sleep?: (ms: number) => Promise<void>;
	pollIntervalMs?: number;
	pollLimit?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_LIMIT = 120;

function errorStatus(error: unknown): number | null {
	return typeof error === "object" && error !== null && "status" in error
		? Number((error as { status: unknown }).status)
		: null;
}

/**
 * GitHub answers a duplicate in-flight request with 409 and the existing
 * request's id, and a closed or draft PR with 400 and a `failed` result:
 * both bodies say more than the status does.
 */
function resultFromError(error: unknown): AsyncMergeResult | null {
	const body = (error as { response?: { data?: unknown } })?.response?.data;
	const parsed = asyncMergeResultSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
}

function parseResult(data: unknown): AsyncMergeResult {
	const parsed = asyncMergeResultSchema.safeParse(data);
	if (!parsed.success) {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "GitHub returned an invalid stack merge response.",
		});
	}
	return parsed.data;
}

/**
 * Merges the PR and every open layer below it in one step through GitHub's
 * asynchronous stacked-merge API, then polls until GitHub settles. Returns
 * null when the repository does not offer that API (HTTP 404), so the caller
 * can fall back to an ordinary merge.
 */
export async function requestAsyncStackMerge({
	request,
	repo,
	prNumber,
	mergeMethod,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
	pollLimit = DEFAULT_POLL_LIMIT,
}: AsyncMergeOptions): Promise<StackMergeOutcome | null> {
	const route = "/repos/{owner}/{repo}/pulls/{pull_number}/merge-async";
	const target = { owner: repo.owner, repo: repo.name, pull_number: prNumber };
	let result: AsyncMergeResult;
	try {
		const response = await request(`PUT ${route}`, {
			...target,
			merge_method: mergeMethod,
			merge_action: "default",
		});
		result = parseResult(response.data);
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		if (errorStatus(error) === 404) return null;
		const body = resultFromError(error);
		if (!body) throw actionRejectionError(error, "GitHub refused the merge.");
		result = body;
	}

	for (let poll = 0; ; poll++) {
		switch (result.status) {
			case "merged":
			case "enqueued":
				return result.status;
			case "failed":
				throw new TRPCError({
					code: "CONFLICT",
					message:
						result.details?.message?.trim() ||
						"GitHub could not merge the stack.",
				});
			case "pending": {
				const uuid = result.details?.uuid?.trim();
				if (!uuid) {
					throw new TRPCError({
						code: "BAD_GATEWAY",
						message: "GitHub returned a pending stack merge without an id.",
					});
				}
				if (poll >= pollLimit) {
					throw new TRPCError({
						code: "TIMEOUT",
						message:
							"GitHub is still merging the stack. Check the pull request on GitHub.",
					});
				}
				await sleep(pollIntervalMs);
				try {
					const response = await request(`GET ${route}/{uuid}`, {
						...target,
						uuid,
					});
					result = parseResult(response.data);
				} catch (error) {
					if (error instanceof TRPCError) throw error;
					throw actionRejectionError(
						error,
						"GitHub could not report the stack merge.",
					);
				}
			}
		}
	}
}
