import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { type GithubRequest, requestAsyncStackMerge } from "./stack-merge";

const repo = { owner: "o", name: "r" };

function scripted(responses: Array<() => unknown>): {
	request: GithubRequest;
	routes: string[];
} {
	const routes: string[] = [];
	const request: GithubRequest = async (route, params) => {
		routes.push(params.uuid ? `${route} ${params.uuid}` : route);
		const next = responses.shift();
		if (!next) throw new Error(`unexpected request ${route}`);
		return { data: next() };
	};
	return { request, routes };
}

function httpError(status: number, data?: unknown): Error {
	return Object.assign(new Error(`HTTP ${status}`), {
		status,
		response: { data },
	});
}

const noWait = async () => {};

describe("requestAsyncStackMerge", () => {
	test("polls a pending merge by its id until GitHub settles", async () => {
		const sleeps: number[] = [];
		const { request, routes } = scripted([
			() => ({ status: "pending", details: { uuid: "u-1" } }),
			() => ({ status: "pending", details: { uuid: "u-1" } }),
			() => ({ status: "enqueued", details: {} }),
		]);
		const outcome = await requestAsyncStackMerge({
			request,
			repo,
			prNumber: 7,
			mergeMethod: "squash",
			sleep: async (ms) => {
				sleeps.push(ms);
			},
			pollIntervalMs: 5,
		});
		expect(outcome).toBe("enqueued");
		expect(routes).toEqual([
			"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async",
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid} u-1",
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid} u-1",
		]);
		expect(sleeps).toEqual([5, 5]);
	});

	test("reports a repository without the API as unavailable", async () => {
		const { request } = scripted([
			() => {
				throw httpError(404);
			},
		]);
		expect(
			await requestAsyncStackMerge({
				request,
				repo,
				prNumber: 7,
				mergeMethod: "merge",
				sleep: noWait,
			}),
		).toBeNull();
	});

	test("follows the existing request when GitHub answers a duplicate with 409", async () => {
		const { request } = scripted([
			() => {
				throw httpError(409, { status: "pending", details: { uuid: "u-2" } });
			},
			() => ({ status: "merged", details: {} }),
		]);
		expect(
			await requestAsyncStackMerge({
				request,
				repo,
				prNumber: 7,
				mergeMethod: "merge",
				sleep: noWait,
			}),
		).toBe("merged");
	});

	test("surfaces GitHub's reason when the merge fails", async () => {
		const { request } = scripted([
			() => {
				throw httpError(400, {
					status: "failed",
					details: { message: "#4190 is a draft" },
				});
			},
		]);
		const error = await requestAsyncStackMerge({
			request,
			repo,
			prNumber: 7,
			mergeMethod: "merge",
			sleep: noWait,
		}).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(TRPCError);
		expect((error as TRPCError).code).toBe("CONFLICT");
		expect((error as TRPCError).message).toBe("#4190 is a draft");
	});

	test("gives up after the poll limit", async () => {
		const pending = () => ({ status: "pending", details: { uuid: "u-3" } });
		const { request } = scripted([pending, pending, pending]);
		const error = await requestAsyncStackMerge({
			request,
			repo,
			prNumber: 7,
			mergeMethod: "merge",
			sleep: noWait,
			pollLimit: 2,
		}).catch((caught: unknown) => caught);
		expect((error as TRPCError).code).toBe("TIMEOUT");
	});
});
