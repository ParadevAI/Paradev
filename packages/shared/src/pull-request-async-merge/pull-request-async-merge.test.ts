import { describe, expect, test } from "bun:test";
import {
	PullRequestMergeRejectedError,
	readPullRequestMergeResult,
	requestPullRequestMerge,
} from "./pull-request-async-merge";

const pr = { owner: "acme", repo: "widgets", number: 7 };

function scripted(responses: Array<() => unknown>) {
	const calls: Array<[string, Record<string, unknown> | undefined]> = [];
	return {
		calls,
		client: {
			request: async (route: string, parameters?: Record<string, unknown>) => {
				calls.push([route, parameters]);
				const next = responses.shift();
				if (!next) throw new Error(`unexpected request ${route}`);
				return { data: next() };
			},
		},
	};
}

function httpError(status: number, data?: unknown): Error {
	return Object.assign(new Error(`HTTP ${status}`), {
		status,
		response: { data },
	});
}

describe("requestPullRequestMerge", () => {
	test("sends the action and method, and hands back the id to poll", async () => {
		const { client, calls } = scripted([
			() => ({ status: "pending", details: { uuid: "u-1" } }),
		]);
		expect(
			await requestPullRequestMerge(client, pr, {
				mergeMethod: "squash",
				mergeAction: "direct_merge",
				sha: "abc",
			}),
		).toEqual({ status: "pending", uuid: "u-1" });
		expect(calls).toEqual([
			[
				"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async",
				{
					owner: "acme",
					repo: "widgets",
					pull_number: 7,
					merge_action: "direct_merge",
					merge_method: "squash",
					sha: "abc",
				},
			],
		]);
	});

	test("leaves the method out for a merge queue, which merges with its own", async () => {
		const { client, calls } = scripted([
			() => ({ status: "enqueued", details: {} }),
		]);
		expect(
			await requestPullRequestMerge(client, pr, { mergeAction: "merge_queue" }),
		).toEqual({ status: "enqueued" });
		expect(calls[0]?.[1]).toEqual({
			owner: "acme",
			repo: "widgets",
			pull_number: 7,
			merge_action: "merge_queue",
		});
	});

	test("reports a repository without the API as unavailable", async () => {
		const { client } = scripted([
			() => {
				throw httpError(404);
			},
		]);
		expect(await requestPullRequestMerge(client, pr)).toEqual({
			status: "unavailable",
		});
	});

	test("follows the existing request when GitHub answers a duplicate with 409", async () => {
		const { client } = scripted([
			() => {
				throw httpError(409, { status: "pending", details: { uuid: "u-2" } });
			},
		]);
		expect(await requestPullRequestMerge(client, pr)).toEqual({
			status: "pending",
			uuid: "u-2",
		});
	});

	test("surfaces GitHub's reason when the merge fails", async () => {
		const { client } = scripted([
			() => {
				throw httpError(400, {
					status: "failed",
					details: { message: "#4190 is a draft" },
				});
			},
		]);
		const error = await requestPullRequestMerge(client, pr).catch(
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(PullRequestMergeRejectedError);
		expect((error as Error).message).toBe("#4190 is a draft");
	});
});

describe("readPullRequestMergeResult", () => {
	test("reads one result by its id", async () => {
		const { client, calls } = scripted([
			() => ({ status: "merged", details: { sha: "deadbeef" } }),
		]);
		expect(await readPullRequestMergeResult(client, pr, "u-1")).toEqual({
			status: "merged",
		});
		expect(calls[0]).toEqual([
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid}",
			{ owner: "acme", repo: "widgets", pull_number: 7, uuid: "u-1" },
		]);
	});
});
