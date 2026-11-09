import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import type {
	AsyncMergeRequest,
	PullRequestMergeProgress,
} from "@superset/shared/pull-request-async-merge";
import type { PullRequestDetailRead } from "@superset/shared/pull-request-detail";
import type { PullRequestDiff } from "@superset/shared/pull-request-diff";
import type {
	PullRequestMergeMethod,
	PullRequestThreads,
} from "@superset/shared/pull-request-github";
import type { PullRequestStack } from "@superset/shared/pull-request-stack";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import { toPullRequestDetail } from "../toPullRequestDetail";

export type { AsyncMergeRequest, PullRequestMergeMethod, PullRequestThreads };

/** A pull request by its own identity; no project or host is involved. */
export interface PullRequestTarget {
	organizationId: string | null;
	repoFullName: string | null;
	prNumber: number;
}

export interface PullRequestGateways {
	/** GitHub with the login on this machine, run in the main process. */
	local: () => typeof electronTrpcClient.viewerGithub;
	/** GitHub with the person's Superset connection, run by the API. */
	cloud: () => typeof cloudTrpcClient.integration.github;
}

const gateways: PullRequestGateways = {
	local: () => electronTrpcClient.viewerGithub,
	cloud: () => cloudTrpcClient.integration.github,
};

export function canActOnPullRequest(target: PullRequestTarget): boolean {
	return Boolean(target.repoFullName);
}

export function pullRequestDiffQueryKey(target: PullRequestTarget | null) {
	return [
		"pull-request-diff",
		target?.repoFullName?.toLowerCase() ?? null,
		target?.prNumber ?? null,
	] as const;
}

export function pullRequestStackQueryKey(target: PullRequestTarget | null) {
	return [
		"pull-request-stack",
		target?.repoFullName?.toLowerCase() ?? null,
		target?.prNumber ?? null,
	] as const;
}

export function pullRequestThreadsQueryKey(target: PullRequestTarget | null) {
	return [
		"pull-request-threads",
		target?.repoFullName?.toLowerCase() ?? null,
		target?.prNumber ?? null,
	] as const;
}

/** The procedures both sources serve, each with its own identifying input. */
interface GithubProcedures<I> {
	getPullRequestDetail: {
		query: (
			input: I & { activity?: boolean },
		) => Promise<PullRequestDetailRead>;
	};
	getPullRequestThreads: { query: (input: I) => Promise<PullRequestThreads> };
	getPullRequestDiff: { query: (input: I) => Promise<PullRequestDiff> };
	addPullRequestComment: {
		mutate: (input: I & { body: string }) => Promise<unknown>;
	};
	replyToPullRequestThread: {
		mutate: (
			input: I & { commentId: number; body: string },
		) => Promise<unknown>;
	};
	setPullRequestThreadResolution: {
		mutate: (
			input: I & { threadId: string; resolved: boolean },
		) => Promise<unknown>;
	};
	mergePullRequest: {
		mutate: (
			input: I & {
				mergeMethod: PullRequestMergeMethod;
				commitMessage?: string;
			},
		) => Promise<unknown>;
	};
	setPullRequestState: {
		mutate: (input: I & { state: "open" | "closed" }) => Promise<unknown>;
	};
	setPullRequestDraft: {
		mutate: (input: I & { draft: boolean }) => Promise<unknown>;
	};
	getPullRequestStack: {
		query: (input: I) => Promise<PullRequestStack | null>;
	};
	requestPullRequestMerge: {
		mutate: (input: I & AsyncMergeRequest) => Promise<PullRequestMergeProgress>;
	};
	getPullRequestMergeResult: {
		query: (input: I & { uuid: string }) => Promise<PullRequestMergeProgress>;
	};
	createPullRequestStack: {
		mutate: (
			input: I & { pullRequests: number[] },
		) => Promise<{ stackNumber: number | null }>;
	};
	enqueuePullRequest: {
		mutate: (input: I & { sha?: string }) => Promise<unknown>;
	};
	dequeuePullRequest: { mutate: (input: I) => Promise<unknown> };
}

function bind<I>(github: GithubProcedures<I>, input: I) {
	return {
		detail: () =>
			github.getPullRequestDetail.query({ ...input, activity: true }),
		threads: () => github.getPullRequestThreads.query(input),
		diff: () => github.getPullRequestDiff.query(input),
		comment: (body: string) =>
			github.addPullRequestComment.mutate({ ...input, body }),
		reply: (reply: { commentId: number; body: string }) =>
			github.replyToPullRequestThread.mutate({ ...input, ...reply }),
		resolveThread: (thread: { threadId: string; resolved: boolean }) =>
			github.setPullRequestThreadResolution.mutate({ ...input, ...thread }),
		merge: (merge: {
			mergeMethod: PullRequestMergeMethod;
			commitMessage?: string;
		}) => github.mergePullRequest.mutate({ ...input, ...merge }),
		setState: (state: "open" | "closed") =>
			github.setPullRequestState.mutate({ ...input, state }),
		setDraft: (draft: boolean) =>
			github.setPullRequestDraft.mutate({ ...input, draft }),
		stack: () => github.getPullRequestStack.query(input),
		requestMerge: (request: AsyncMergeRequest) =>
			github.requestPullRequestMerge.mutate({ ...input, ...request }),
		mergeResult: (uuid: string) =>
			github.getPullRequestMergeResult.query({ ...input, uuid }),
		createStack: (pullRequests: number[]) =>
			github.createPullRequestStack.mutate({ ...input, pullRequests }),
		enqueue: (sha?: string) =>
			github.enqueuePullRequest.mutate({ ...input, ...(sha ? { sha } : {}) }),
		dequeue: () => github.dequeuePullRequest.mutate(input),
	};
}

/**
 * Who acts on GitHub, picked once: the login on this machine when there is
 * one, the person's Superset connection otherwise. Never the workspace's
 * host, and no second try under another identity after GitHub refuses.
 */
async function githubFor(target: PullRequestTarget, deps: PullRequestGateways) {
	const { repoFullName, prNumber: number } = target;
	if (!repoFullName)
		throw new Error("The pull request's repository is unknown");
	const local = deps.local();
	if ((await local.status.query()).available) {
		return bind(local, { repoFullName, number });
	}
	if (!target.organizationId) throw new Error("No organization is active");
	return bind(deps.cloud(), {
		organizationId: target.organizationId,
		repoFullName,
		number,
	});
}

export async function readPullRequestDetail(
	target: PullRequestTarget,
	deps: PullRequestGateways = gateways,
): Promise<PullRequestDetail> {
	const read = await (await githubFor(target, deps)).detail();
	return toPullRequestDetail(read, target.repoFullName ?? "");
}

export async function readPullRequestThreads(
	target: PullRequestTarget,
	deps: PullRequestGateways = gateways,
): Promise<PullRequestThreads> {
	return (await githubFor(target, deps)).threads();
}

export async function readPullRequestDiff(
	target: PullRequestTarget,
	deps: PullRequestGateways = gateways,
): Promise<PullRequestDiff> {
	return (await githubFor(target, deps)).diff();
}

export async function addPullRequestComment(
	target: PullRequestTarget,
	body: string,
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).comment(body);
}

export async function replyToPullRequestThread(
	target: PullRequestTarget,
	reply: { commentId: number; body: string },
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).reply(reply);
}

export async function setPullRequestThreadResolution(
	target: PullRequestTarget,
	thread: { threadId: string; resolved: boolean },
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).resolveThread(thread);
}

export async function mergePullRequest(
	target: PullRequestTarget,
	merge: { mergeMethod: PullRequestMergeMethod; commitMessage?: string },
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).merge(merge);
}

export async function setPullRequestState(
	target: PullRequestTarget,
	state: "open" | "closed",
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).setState(state);
}

export async function setPullRequestDraft(
	target: PullRequestTarget,
	draft: boolean,
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).setDraft(draft);
}

/** An API that predates the read has no stacks to show. */
export async function readPullRequestStack(
	target: PullRequestTarget,
	deps: PullRequestGateways = gateways,
): Promise<PullRequestStack | null> {
	try {
		return await (await githubFor(target, deps)).stack();
	} catch (error) {
		if (isMissingProcedureError(error)) return null;
		throw error;
	}
}

/**
 * `pending`: GitHub is still merging after every poll. `unavailable`: the
 * repository has no background merge, or the API predates it.
 */
export type BackgroundMergeOutcome =
	| "merged"
	| "enqueued"
	| "pending"
	| "unavailable";

const MERGE_POLL_INTERVAL_MS = 1_500;
const MERGE_POLL_LIMIT = 120;

export async function mergeInBackground(
	target: PullRequestTarget,
	request: AsyncMergeRequest,
	deps: PullRequestGateways = gateways,
	polling: {
		sleep?: (ms: number) => Promise<void>;
		intervalMs?: number;
		limit?: number;
	} = {},
): Promise<BackgroundMergeOutcome> {
	const sleep =
		polling.sleep ??
		((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const github = await githubFor(target, deps);
	let progress: PullRequestMergeProgress;
	try {
		progress = await github.requestMerge(request);
	} catch (error) {
		if (isMissingProcedureError(error)) return "unavailable";
		throw error;
	}
	for (
		let poll = 0;
		progress.status === "pending" && poll < (polling.limit ?? MERGE_POLL_LIMIT);
		poll++
	) {
		await sleep(polling.intervalMs ?? MERGE_POLL_INTERVAL_MS);
		progress = await github.mergeResult(progress.uuid);
	}
	return progress.status;
}

/** `pullRequests`: the chain's numbers, bottom to top. */
export async function createPullRequestStack(
	target: PullRequestTarget,
	pullRequests: number[],
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).createStack(pullRequests);
}

/** `sha`: the head the person looked at. */
export async function enqueuePullRequest(
	target: PullRequestTarget,
	sha?: string,
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).enqueue(sha);
}

/** Leaving the queue also takes every stacked pull request above this one out. */
export async function dequeuePullRequest(
	target: PullRequestTarget,
	deps: PullRequestGateways = gateways,
): Promise<void> {
	await (await githubFor(target, deps)).dequeue();
}

/** The person has no GitHub login here and no Superset connection; connecting fixes it. */
export function needsGithubConnection(error: unknown): boolean {
	const data = (error as { data?: { code?: unknown } } | null | undefined)
		?.data;
	return data?.code === "PRECONDITION_FAILED";
}
