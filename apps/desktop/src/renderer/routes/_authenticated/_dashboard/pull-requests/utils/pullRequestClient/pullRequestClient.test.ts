import { beforeEach, describe, expect, mock, test } from "bun:test";
import { cloudPullRequestRead } from "../toPullRequestDetail/fixtures";
import {
	mergeInBackground,
	mergePullRequest,
	type PullRequestGateways,
	type PullRequestTarget,
	readPullRequestDetail,
	setPullRequestThreadResolution,
} from "./pullRequestClient";

function gateway() {
	return {
		status: { query: mock(async () => ({ available: false })) },
		getPullRequestDetail: { query: mock(async () => cloudPullRequestRead()) },
		getPullRequestThreads: {
			query: mock(async () => ({ reviewThreads: [], fetchFailed: false })),
		},
		getPullRequestDiff: { query: mock(async () => ({ patch: "" })) },
		addPullRequestComment: { mutate: mock(async () => ({})) },
		replyToPullRequestThread: { mutate: mock(async () => ({})) },
		setPullRequestThreadResolution: { mutate: mock(async () => ({})) },
		mergePullRequest: { mutate: mock(async () => ({})) },
		setPullRequestState: { mutate: mock(async () => ({})) },
		setPullRequestDraft: { mutate: mock(async () => ({})) },
		getPullRequestStack: { query: mock(async () => null) },
		requestPullRequestMerge: {
			mutate: mock(
				async (): Promise<{ status: string; uuid?: string }> => ({
					status: "merged",
				}),
			),
		},
		getPullRequestMergeResult: {
			query: mock(
				async (): Promise<{ status: string; uuid?: string }> => ({
					status: "merged",
				}),
			),
		},
		createPullRequestStack: { mutate: mock(async () => ({ stackNumber: 1 })) },
		enqueuePullRequest: { mutate: mock(async () => ({})) },
		dequeuePullRequest: { mutate: mock(async () => ({})) },
	};
}

let local = gateway();
let cloud = gateway();
const deps = {
	local: () => local,
	cloud: () => cloud,
} as unknown as PullRequestGateways;
const target: PullRequestTarget = {
	organizationId: "org",
	repoFullName: "owner/repo",
	prNumber: 12,
};

beforeEach(() => {
	local = gateway();
	cloud = gateway();
});

describe("who acts on GitHub", () => {
	test("the login on this machine, when there is one", async () => {
		local.status.query.mockResolvedValue({ available: true });
		await mergePullRequest(target, { mergeMethod: "squash" }, deps);
		expect(local.mergePullRequest.mutate).toHaveBeenCalledWith({
			repoFullName: "owner/repo",
			number: 12,
			mergeMethod: "squash",
		});
		expect(cloud.mergePullRequest.mutate).not.toHaveBeenCalled();
	});

	test("the Superset connection otherwise, by organization", async () => {
		expect((await readPullRequestDetail(target, deps)).title).toBe(
			"cloud title",
		);
		expect(cloud.getPullRequestDetail.query).toHaveBeenCalledWith({
			organizationId: "org",
			repoFullName: "owner/repo",
			number: 12,
			activity: true,
		});
		expect(local.getPullRequestDetail.query).not.toHaveBeenCalled();
	});

	test("a refusal is final: nothing retries it under another identity", async () => {
		local.status.query.mockResolvedValue({ available: true });
		const refused = Object.assign(new Error("Not allowed"), {
			data: { code: "FORBIDDEN" },
		});
		local.setPullRequestThreadResolution.mutate.mockRejectedValueOnce(refused);
		await expect(
			setPullRequestThreadResolution(
				target,
				{ threadId: "T1", resolved: true },
				deps,
			),
		).rejects.toBe(refused);
		expect(cloud.setPullRequestThreadResolution.mutate).not.toHaveBeenCalled();
	});

	test("a pull request with no known repository cannot be acted on", async () => {
		await expect(
			readPullRequestDetail({ ...target, repoFullName: null }, deps),
		).rejects.toThrow("repository is unknown");
	});
});

describe("mergeInBackground", () => {
	test("polls one result id on the same gateway until GitHub settles", async () => {
		local.status.query.mockResolvedValue({ available: true });
		local.requestPullRequestMerge.mutate.mockResolvedValue({
			status: "pending",
			uuid: "u-1",
		});
		local.getPullRequestMergeResult.query
			.mockResolvedValueOnce({ status: "pending", uuid: "u-1" })
			.mockResolvedValueOnce({ status: "enqueued" });
		const waits: number[] = [];

		const outcome = await mergeInBackground(
			target,
			{ mergeAction: "merge_queue" },
			deps,
			{
				sleep: async (ms) => {
					waits.push(ms);
				},
				intervalMs: 5,
			},
		);

		expect(outcome).toBe("enqueued");
		expect(local.requestPullRequestMerge.mutate).toHaveBeenCalledWith({
			repoFullName: "owner/repo",
			number: 12,
			mergeAction: "merge_queue",
		});
		expect(local.getPullRequestMergeResult.query).toHaveBeenCalledTimes(2);
		expect(waits).toEqual([5, 5]);
		expect(cloud.requestPullRequestMerge.mutate).not.toHaveBeenCalled();
	});

	test("stops asking after the poll limit and says the merge is still pending", async () => {
		cloud.requestPullRequestMerge.mutate.mockResolvedValue({
			status: "pending",
			uuid: "u-2",
		});
		cloud.getPullRequestMergeResult.query.mockResolvedValue({
			status: "pending",
			uuid: "u-2",
		});
		expect(
			await mergeInBackground(target, {}, deps, {
				sleep: async () => {},
				limit: 2,
			}),
		).toBe("pending");
		expect(cloud.getPullRequestMergeResult.query).toHaveBeenCalledTimes(2);
	});

	test("a result read that keeps failing after GitHub accepted reads as pending, not failed", async () => {
		cloud.requestPullRequestMerge.mutate.mockResolvedValue({
			status: "pending",
			uuid: "u-3",
		});
		cloud.getPullRequestMergeResult.query.mockRejectedValue(new Error("502"));
		expect(
			await mergeInBackground(target, {}, deps, { sleep: async () => {} }),
		).toBe("pending");
		expect(cloud.getPullRequestMergeResult.query).toHaveBeenCalledTimes(3);
	});

	test("an API that predates the background merge reads as unavailable", async () => {
		cloud.requestPullRequestMerge.mutate.mockRejectedValue(
			new Error(
				'No procedure found on path "integration.github.requestPullRequestMerge"',
			),
		);
		expect(await mergeInBackground(target, {}, deps)).toBe("unavailable");
	});
});
