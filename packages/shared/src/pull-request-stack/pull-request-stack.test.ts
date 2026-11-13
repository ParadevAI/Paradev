import { describe, expect, test } from "bun:test";
import {
	buildNativeStackLayers,
	carriesMergedCommits,
	createPullRequestStack,
	createStackFetchers,
	IncompleteStackError,
	MERGED_BY_HEAD_QUERY,
	mapStackLayer,
	type NativeStackNode,
	OPEN_BY_BASE_QUERY,
	OPEN_BY_HEAD_QUERY,
	readPullRequestStack,
	runStackRootQuery,
	type StackChainFetchers,
	type StackGithubClient,
	type StackPullRequestNode,
	type StackRootPullRequest,
	type StackRootQueryResult,
	stackMergeTargets,
	walkInferredChain,
	walkMergedBelow,
} from "./pull-request-stack";

function node(
	overrides: Partial<StackPullRequestNode> & { number: number },
): StackPullRequestNode {
	return {
		title: `PR ${overrides.number}`,
		url: `https://github.com/o/r/pull/${overrides.number}`,
		state: "OPEN",
		isDraft: false,
		isCrossRepository: false,
		headRefName: `branch-${overrides.number}`,
		headRefOid: `oid-${overrides.number}`,
		baseRefName: "main",
		mergeable: "MERGEABLE",
		mergeStateStatus: "CLEAN",
		reviewDecision: null,
		updatedAt: "2026-09-01T00:00:00Z",
		mergeQueueEntry: null,
		...overrides,
	};
}

/** `number` moved onto `to` after the pull request on `from` merged. */
function retargeted(
	overrides: Partial<StackPullRequestNode> & { number: number },
	from: string,
	to = "main",
): StackPullRequestNode {
	return node({
		baseRefName: to,
		timelineItems: {
			nodes: [{ previousRefName: from, currentRefName: to }],
		},
		...overrides,
	});
}

function nativeStack(
	entries: Array<{ position: number; pullRequest: StackPullRequestNode }>,
	overrides: Partial<NativeStackNode> = {},
): NativeStackNode {
	return {
		number: 9,
		baseRefName: "main",
		size: entries.length,
		entries: { totalCount: entries.length, nodes: entries },
		...overrides,
	};
}

function root(pr: StackRootPullRequest | null): StackRootQueryResult {
	return {
		repository: { defaultBranchRef: { name: "main" }, pullRequest: pr },
	};
}

/** Chain lookups backed by lists, counting calls like the real thing costs. */
function memoryFetchers(
	open: StackPullRequestNode[],
	merged: StackPullRequestNode[] = [],
): StackChainFetchers & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		async findOpenByHead(headRefName) {
			calls.push(`head:${headRefName}`);
			return open.find((pr) => pr.headRefName === headRefName) ?? null;
		},
		async findOpenByBase(baseRefName) {
			calls.push(`base:${baseRefName}`);
			return open.filter((pr) => pr.baseRefName === baseRefName);
		},
		async findMergedByHead(headRefName) {
			calls.push(`merged:${headRefName}`);
			return merged.find((pr) => pr.headRefName === headRefName) ?? null;
		},
	};
}

/** GitHub as the stack read sees it: one root pull request and lists by branch. */
function github(
	current: StackRootPullRequest,
	options: {
		open?: StackPullRequestNode[];
		merged?: StackPullRequestNode[];
		behindBy?: (basehead: string) => number;
	} = {},
): StackGithubClient & { requests: string[] } {
	const requests: string[] = [];
	return {
		requests,
		graphql: async <T>(query: string, variables: Record<string, unknown>) => {
			if (query.includes("defaultBranchRef")) return root(current) as T;
			const nodes = query.includes("states: [MERGED]")
				? (options.merged ?? []).filter(
						(pr) => pr.headRefName === variables.head,
					)
				: "head" in variables
					? (options.open ?? []).filter(
							(pr) => pr.headRefName === variables.head,
						)
					: (options.open ?? []).filter(
							(pr) => pr.baseRefName === variables.base,
						);
			return { repository: { pullRequests: { nodes } } } as T;
		},
		request: async (route, parameters) => {
			const basehead = String(parameters?.basehead ?? "");
			requests.push(`${route} ${basehead}`.trim());
			return { data: { behind_by: options.behindBy?.(basehead) ?? 0 } };
		},
	};
}

const ref = (number: number) => ({ owner: "o", repo: "r", number });

describe("mapStackLayer", () => {
	test("keeps what the stack verdict reads in app vocabulary", () => {
		expect(
			mapStackLayer(
				node({
					number: 7,
					isDraft: true,
					mergeable: "CONFLICTING",
					mergeStateStatus: " DIRTY ",
					reviewDecision: "CHANGES_REQUESTED",
					mergeQueueEntry: { position: 2, state: "AWAITING_CHECKS" },
				}),
				2,
				true,
			),
		).toMatchObject({
			position: 2,
			number: 7,
			state: "open",
			isDraft: true,
			mergeable: "conflicting",
			mergeStateStatus: "DIRTY",
			reviewDecision: "changes_requested",
			queue: { position: 2, state: "AWAITING_CHECKS" },
			isCurrent: true,
		});
		expect(
			mapStackLayer(node({ number: 8, state: "MERGED" }), 1, false).state,
		).toBe("merged");
		expect(
			mapStackLayer(node({ number: 9, state: "CLOSED" }), 1, false).state,
		).toBe("closed");
	});
});

describe("buildNativeStackLayers", () => {
	test("orders entries by position, marks the current pull request, and sees the merge queue", () => {
		const pr: StackRootPullRequest = {
			...node({ number: 2, baseRefName: "branch-1" }),
			stack: nativeStack([
				{
					position: 3,
					pullRequest: node({ number: 3, baseRefName: "branch-2" }),
				},
				{
					position: 1,
					pullRequest: node({ number: 1, isMergeQueueEnabled: true }),
				},
				{
					position: 2,
					pullRequest: node({ number: 2, baseRefName: "branch-1" }),
				},
			]),
			stackEntry: { position: 2 },
		};
		const native = buildNativeStackLayers(pr);
		expect(native?.layers.map((layer) => layer.number)).toEqual([1, 2, 3]);
		expect(native?.layers.map((layer) => layer.isCurrent)).toEqual([
			false,
			true,
			false,
		]);
		expect(native?.stack.number).toBe(9);
		expect(native?.usesMergeQueue).toBe(true);
	});

	test("returns null for a pull request outside any stack", () => {
		expect(buildNativeStackLayers(node({ number: 1 }))).toBeNull();
	});

	test("throws when GitHub lists only part of the stack", () => {
		const entries = [
			{ position: 1, pullRequest: node({ number: 1 }) },
			{ position: 2, pullRequest: node({ number: 2 }) },
		];
		const missingEntry: StackRootPullRequest = {
			...node({ number: 2 }),
			stack: nativeStack(entries, {
				size: 3,
				entries: { totalCount: 3, nodes: entries },
			}),
			stackEntry: { position: 2 },
		};
		const wrongPosition: StackRootPullRequest = {
			...node({ number: 2 }),
			stack: nativeStack(entries),
			stackEntry: { position: 1 },
		};
		const noEntry: StackRootPullRequest = {
			...node({ number: 2 }),
			stack: nativeStack(entries),
			stackEntry: null,
		};
		for (const pr of [missingEntry, wrongPosition, noEntry]) {
			expect(() => buildNativeStackLayers(pr)).toThrow(IncompleteStackError);
		}
	});
});

describe("walkInferredChain", () => {
	const bottom = node({ number: 10, headRefName: "a", baseRefName: "main" });
	const middle = node({ number: 11, headRefName: "b", baseRefName: "a" });
	const top = node({ number: 12, headRefName: "c", baseRefName: "b" });

	test("walks down to the trunk and up to the last open pull request", async () => {
		const fetchers = memoryFetchers([top, bottom, middle]);
		const chain = await walkInferredChain(middle, fetchers, {
			defaultBranch: "main",
		});
		expect(chain.map((pr) => pr.number)).toEqual([10, 11, 12]);
		expect(fetchers.calls).toEqual(["head:a", "base:b", "base:c"]);
	});

	test("follows the most recently updated fork above", async () => {
		const stale = node({
			number: 13,
			headRefName: "d",
			baseRefName: "b",
			updatedAt: "2026-08-01T00:00:00Z",
		});
		const fresh = node({
			number: 14,
			headRefName: "e",
			baseRefName: "b",
			updatedAt: "2026-09-02T00:00:00Z",
		});
		const chain = await walkInferredChain(
			middle,
			memoryFetchers([stale, fresh, bottom]),
			{ defaultBranch: "main" },
		);
		expect(chain.map((pr) => pr.number)).toEqual([10, 11, 14]);
	});

	test("stops on a base-branch loop instead of spinning", async () => {
		const a = node({ number: 20, headRefName: "x", baseRefName: "y" });
		const b = node({ number: 21, headRefName: "y", baseRefName: "x" });
		const chain = await walkInferredChain(a, memoryFetchers([a, b]));
		expect(chain.map((pr) => pr.number)).toEqual([21, 20]);
	});
});

describe("walkMergedBelow", () => {
	test("follows each retarget back to the layer that merged beneath it", async () => {
		const first = node({ number: 1, headRefName: "a", state: "MERGED" });
		const second = retargeted(
			{ number: 2, headRefName: "b", state: "MERGED" },
			"a",
		);
		const third = retargeted({ number: 3, headRefName: "c" }, "b");
		const fetchers = memoryFetchers([], [first, second]);
		const merged = await walkMergedBelow(third, fetchers);
		expect(merged.map((pr) => pr.number)).toEqual([1, 2]);
		expect(fetchers.calls).toEqual(["merged:b", "merged:a"]);
	});

	test("ignores a retarget away from a branch whose pull request never merged", async () => {
		const moved = retargeted({ number: 3 }, "someone-elses-branch");
		expect(await walkMergedBelow(moved, memoryFetchers([]))).toEqual([]);
	});

	test("ignores an older retarget that is not how it reached its present base", async () => {
		const pr = node({
			number: 3,
			baseRefName: "main",
			timelineItems: {
				nodes: [{ previousRefName: "main", currentRefName: "release" }],
			},
		});
		const fetchers = memoryFetchers([]);
		expect(await walkMergedBelow(pr, fetchers)).toEqual([]);
		expect(fetchers.calls).toEqual([]);
	});
});

describe("createStackFetchers", () => {
	test("targets the lookups by branch and drops fork pull requests", async () => {
		const seen: Array<Record<string, unknown>> = [];
		const fetchers = createStackFetchers(
			async <T>(query: string, variables: Record<string, unknown>) => {
				seen.push(variables);
				const nodes =
					query === OPEN_BY_HEAD_QUERY
						? [
								node({ number: 1, headRefName: "a", isCrossRepository: true }),
								node({ number: 2, headRefName: "a" }),
							]
						: query === OPEN_BY_BASE_QUERY
							? [
									node({ number: 3, updatedAt: "2026-08-01T00:00:00Z" }),
									null,
									node({ number: 4, updatedAt: "2026-09-01T00:00:00Z" }),
									node({ number: 5, isCrossRepository: true }),
								]
							: query === MERGED_BY_HEAD_QUERY
								? [
										node({ number: 6, updatedAt: "2026-07-01T00:00:00Z" }),
										node({ number: 7, updatedAt: "2026-09-01T00:00:00Z" }),
									]
								: [];
				return { repository: { pullRequests: { nodes } } } as T;
			},
			{ owner: "o", name: "r" },
		);

		expect((await fetchers.findOpenByHead("a"))?.number).toBe(2);
		expect((await fetchers.findOpenByBase("b")).map((pr) => pr.number)).toEqual(
			[4, 3],
		);
		expect((await fetchers.findMergedByHead("c"))?.number).toBe(7);
		expect(seen).toEqual([
			{ owner: "o", name: "r", head: "a" },
			{ owner: "o", name: "r", base: "b" },
			{ owner: "o", name: "r", head: "c" },
		]);
	});

	test("never asks GitHub for check rollups", () => {
		for (const query of [
			OPEN_BY_HEAD_QUERY,
			OPEN_BY_BASE_QUERY,
			MERGED_BY_HEAD_QUERY,
		]) {
			expect(query).not.toContain("statusCheckRollup");
		}
	});
});

describe("carriesMergedCommits", () => {
	const refs = { mergedHead: "m", branchHead: "h", trunk: "main" };
	const client = (behindBy: Record<string, number>) => ({
		request: async (_route: string, parameters?: Record<string, unknown>) => ({
			data: { behind_by: behindBy[String(parameters?.basehead)] },
		}),
	});

	test("is true when the branch has the merged commit and the trunk does not", async () => {
		expect(
			await carriesMergedCommits(
				client({ "m...h": 0, "m...main": 4 }),
				{ owner: "o", repo: "r" },
				refs,
			),
		).toBe(true);
	});

	test("is false after a merge commit, whose commits the trunk still reaches", async () => {
		expect(
			await carriesMergedCommits(
				client({ "m...h": 0, "m...main": 0 }),
				{ owner: "o", repo: "r" },
				refs,
			),
		).toBe(false);
	});

	test("is false once the branch no longer has the merged commit", async () => {
		expect(
			await carriesMergedCommits(
				client({ "m...h": 3, "m...main": 4 }),
				{ owner: "o", repo: "r" },
				refs,
			),
		).toBe(false);
	});
});

describe("readPullRequestStack", () => {
	test("prefers GitHub's own stack and asks nothing else", async () => {
		const lower = node({ number: 1, state: "MERGED" });
		const upper = node({ number: 2, isMergeQueueEnabled: true });
		const client = github(
			{
				...upper,
				stack: nativeStack([
					{ position: 1, pullRequest: lower },
					{ position: 2, pullRequest: upper },
				]),
				stackEntry: { position: 2 },
			},
			{ open: [node({ number: 3, baseRefName: "branch-2" })] },
		);
		const stack = await readPullRequestStack(client, ref(2));
		expect(stack).toMatchObject({
			source: "github",
			stackNumber: 9,
			baseRefName: "main",
			currentPosition: 2,
			usesMergeQueue: true,
			restack: null,
		});
		expect(stack?.layers.map((layer) => layer.number)).toEqual([1, 2]);
		expect(client.requests).toEqual([]);
	});

	test("infers a chain of base branches", async () => {
		const bottom = node({ number: 10, headRefName: "a" });
		const top = node({ number: 11, headRefName: "b", baseRefName: "a" });
		const stack = await readPullRequestStack(
			github(top, { open: [bottom, top] }),
			ref(11),
		);
		expect(stack).toMatchObject({
			source: "inferred",
			stackNumber: null,
			baseRefName: "main",
			currentPosition: 2,
			usesMergeQueue: false,
			restack: null,
		});
		expect(
			stack?.layers.map((layer) => [layer.position, layer.number]),
		).toEqual([
			[1, 10],
			[2, 11],
		]);
	});

	test("is null for a pull request that stands alone", async () => {
		const alone = node({ number: 1 });
		expect(
			await readPullRequestStack(github(alone, { open: [alone] }), ref(1)),
		).toBeNull();
	});

	test("keeps a layer that merged beneath it and asks for a restack while the branch carries its commits", async () => {
		const landed = node({
			number: 1,
			headRefName: "a",
			headRefOid: "landed",
			state: "MERGED",
		});
		const current = retargeted(
			{ number: 2, headRefName: "b", headRefOid: "tip" },
			"a",
		);
		const client = github(current, {
			open: [current],
			merged: [landed],
			behindBy: (basehead) => (basehead === "landed...main" ? 3 : 0),
		});
		const stack = await readPullRequestStack(client, ref(2));
		expect(
			stack?.layers.map((layer) => [layer.position, layer.number, layer.state]),
		).toEqual([
			[1, 1, "merged"],
			[2, 2, "open"],
		]);
		expect(stack?.currentPosition).toBe(2);
		expect(stack?.restack).toEqual({
			number: 1,
			headRefName: "a",
			headRefOid: "landed",
		});
		expect(client.requests).toEqual([
			"GET /repos/{owner}/{repo}/compare/{basehead} landed...tip",
			"GET /repos/{owner}/{repo}/compare/{basehead} landed...main",
		]);
	});

	test("shows a merged pull request's stack history without probing for a restack", async () => {
		const first = node({ number: 1, headRefName: "a", state: "MERGED" });
		const second = retargeted(
			{ number: 2, headRefName: "b", state: "MERGED" },
			"a",
		);
		const client = github(second, { merged: [first] });
		const stack = await readPullRequestStack(client, ref(2));
		expect(stack?.layers.map((layer) => layer.state)).toEqual([
			"merged",
			"merged",
		]);
		expect(stack?.restack).toBeNull();
		expect(client.requests).toEqual([]);
	});
});

describe("stackMergeTargets", () => {
	test("is the current layer and every unmerged layer below it", () => {
		const layers = [
			mapStackLayer(node({ number: 1, state: "MERGED" }), 1, false),
			mapStackLayer(node({ number: 2 }), 2, false),
			mapStackLayer(node({ number: 3 }), 3, true),
			mapStackLayer(node({ number: 4 }), 4, false),
		];
		expect(
			stackMergeTargets({ layers, currentPosition: 3 }).map(
				(layer) => layer.number,
			),
		).toEqual([2, 3]);
	});
});

describe("createPullRequestStack", () => {
	test("posts the chain bottom to top and returns the stack's number", async () => {
		const calls: unknown[] = [];
		const result = await createPullRequestStack(
			{
				request: async (route, parameters) => {
					calls.push([route, parameters]);
					return { data: { number: 42 } };
				},
			},
			{ owner: "o", repo: "r" },
			[101, 102],
		);
		expect(result).toEqual({ stackNumber: 42 });
		expect(calls).toEqual([
			[
				"POST /repos/{owner}/{repo}/stacks",
				{ owner: "o", repo: "r", pull_requests: [101, 102] },
			],
		]);
	});
});

describe("runStackRootQuery", () => {
	const variables = { owner: "o", name: "r", number: 1 };

	test("keeps partial data when only the stack field errored", async () => {
		const partial = root(node({ number: 1 }));
		const data = await runStackRootQuery(async () => {
			throw Object.assign(new Error("Request failed"), { data: partial });
		}, variables);
		expect(data).toBe(partial);
	});

	test("retries without the native fields on an unknown-field schema", async () => {
		const queries: string[] = [];
		const data = await runStackRootQuery(async <T>(query: string) => {
			queries.push(query);
			if (query.includes("stackEntry")) {
				throw new Error("Field 'stack' doesn't exist on type 'PullRequest'");
			}
			return root(node({ number: 1 })) as T;
		}, variables);
		expect(queries).toHaveLength(2);
		expect(queries[1]).not.toContain("stackEntry");
		expect(data?.repository?.pullRequest?.number).toBe(1);
	});

	test("rethrows anything else", async () => {
		await expect(
			runStackRootQuery(async () => {
				throw new Error("rate limited");
			}, variables),
		).rejects.toThrow("rate limited");
	});
});
