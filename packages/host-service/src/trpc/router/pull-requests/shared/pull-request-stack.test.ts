import { describe, expect, test } from "bun:test";
import {
	assemblePullRequestStack,
	buildNativeStackLayers,
	createStackFetchers,
	findMergedLayerBelow,
	IncompleteStackError,
	type MergedPullRequestNode,
	mapStackLayer,
	type NativeStackNode,
	OPEN_BY_BASE_QUERY,
	OPEN_BY_HEAD_QUERY,
	resolveStackShape,
	runStackRootQuery,
	type StackChainFetchers,
	type StackPullRequestNode,
	type StackRootPullRequest,
	type StackRootQueryResult,
	stackMergeTargets,
	walkInferredChain,
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
		baseRefName: "main",
		mergeable: "MERGEABLE",
		mergeStateStatus: "CLEAN",
		updatedAt: "2026-09-01T00:00:00Z",
		mergeQueueEntry: null,
		...overrides,
	};
}

function merged(
	overrides: Partial<MergedPullRequestNode> & { number: number },
): MergedPullRequestNode {
	return {
		title: `Merged ${overrides.number}`,
		url: `https://github.com/o/r/pull/${overrides.number}`,
		headRefName: `merged-${overrides.number}`,
		headRefOid: `oid-${overrides.number}`,
		baseRefName: "main",
		mergedAt: "2026-09-01T00:00:00Z",
		...overrides,
	};
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

function root(
	pr: StackRootPullRequest | null,
	defaultBranch = "main",
): StackRootQueryResult {
	return {
		repository: {
			defaultBranchRef: { name: defaultBranch },
			pullRequest: pr,
		},
	};
}

/** Chain lookups backed by a list, counting calls like the real thing costs. */
function memoryFetchers(open: StackPullRequestNode[]): StackChainFetchers & {
	calls: string[];
} {
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
	};
}

describe("mapStackLayer", () => {
	test("keeps what the stack verdict reads in app vocabulary", () => {
		expect(
			mapStackLayer(
				node({
					number: 7,
					state: "OPEN",
					isDraft: true,
					mergeable: "CONFLICTING",
					mergeStateStatus: " DIRTY ",
					mergeQueueEntry: { id: "q" },
				}),
				2,
				true,
			),
		).toMatchObject({
			position: 2,
			number: 7,
			state: "open",
			isDraft: true,
			isQueued: true,
			mergeable: "conflicting",
			mergeStateStatus: "DIRTY",
			isCurrent: true,
			workspaceId: null,
		});
		expect(
			mapStackLayer(
				node({ number: 8, state: "MERGED", mergeable: "UNKNOWN" }),
				1,
				false,
			),
		).toMatchObject({ state: "merged", mergeable: "unknown" });
		expect(
			mapStackLayer(node({ number: 9, state: "CLOSED" }), 1, false).state,
		).toBe("closed");
	});
});

describe("buildNativeStackLayers", () => {
	test("orders entries by position and marks the current PR", () => {
		const pr: StackRootPullRequest = {
			...node({ number: 2, baseRefName: "branch-1" }),
			stack: nativeStack([
				{
					position: 3,
					pullRequest: node({ number: 3, baseRefName: "branch-2" }),
				},
				{ position: 1, pullRequest: node({ number: 1, state: "MERGED" }) },
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
	});

	test("returns null for a PR outside any stack", () => {
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

	test("walks down to the trunk and up to the last open PR", async () => {
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

describe("createStackFetchers", () => {
	test("targets the lookups by branch and drops fork PRs", async () => {
		const seen: Array<Record<string, unknown>> = [];
		const fetchers = createStackFetchers(
			async (query, variables) => {
				seen.push(variables);
				if (query === OPEN_BY_HEAD_QUERY) {
					return {
						repository: {
							pullRequests: {
								nodes: [
									node({
										number: 1,
										headRefName: "a",
										isCrossRepository: true,
									}),
									node({ number: 2, headRefName: "a" }),
								],
							},
						},
					};
				}
				if (query === OPEN_BY_BASE_QUERY) {
					return {
						repository: {
							pullRequests: {
								nodes: [
									node({ number: 3, updatedAt: "2026-08-01T00:00:00Z" }),
									null,
									node({ number: 4, updatedAt: "2026-09-01T00:00:00Z" }),
									node({ number: 5, isCrossRepository: true }),
								],
							},
						},
					};
				}
				return { repository: { pullRequests: { nodes: [] } } };
			},
			{ owner: "o", name: "r" },
		);

		expect((await fetchers.findOpenByHead("a"))?.number).toBe(2);
		expect((await fetchers.findOpenByBase("b")).map((pr) => pr.number)).toEqual(
			[4, 3],
		);
		expect(await fetchers.findMergedInto("main")).toEqual([]);
		expect(seen).toEqual([
			{ owner: "o", name: "r", head: "a" },
			{ owner: "o", name: "r", base: "b" },
			{ owner: "o", name: "r", base: "main" },
		]);
	});

	test("never asks GitHub for check rollups", () => {
		for (const query of [OPEN_BY_HEAD_QUERY, OPEN_BY_BASE_QUERY]) {
			expect(query).not.toContain("statusCheckRollup");
		}
	});
});

describe("findMergedLayerBelow", () => {
	const current = { number: 50, headRefName: "feature-2" };

	test("finds the newest merged PR whose head is in HEAD but not the trunk", async () => {
		const older = merged({ number: 40, mergedAt: "2026-09-01T00:00:00Z" });
		const newer = merged({ number: 41, mergedAt: "2026-09-03T00:00:00Z" });
		const inHead = new Set(["oid-40", "oid-41"]);
		const found = await findMergedLayerBelow({
			current,
			merged: [older, newer],
			trunkRef: "origin/main",
			isAncestor: async (oid, ref) =>
				ref === "HEAD" ? inHead.has(oid) : false,
		});
		expect(found?.number).toBe(41);
	});

	test("skips a merge-commit merge, whose head the trunk still reaches", async () => {
		const found = await findMergedLayerBelow({
			current,
			merged: [merged({ number: 42 })],
			trunkRef: "origin/main",
			isAncestor: async () => true,
		});
		expect(found).toBeNull();
	});

	test("ignores the current PR and its own branch", async () => {
		const found = await findMergedLayerBelow({
			current,
			merged: [
				merged({ number: 50 }),
				merged({ number: 51, headRefName: "feature-2" }),
			],
			trunkRef: "origin/main",
			isAncestor: async (_oid, ref) => ref === "HEAD",
		});
		expect(found).toBeNull();
	});
});

describe("resolveStackShape", () => {
	test("prefers the native stack and probes below when the layer under merged", async () => {
		const pr: StackRootPullRequest = {
			...node({ number: 2 }),
			stack: nativeStack([
				{ position: 1, pullRequest: node({ number: 1, state: "MERGED" }) },
				{ position: 2, pullRequest: node({ number: 2 }) },
			]),
			stackEntry: { position: 2 },
		};
		const fetchers = memoryFetchers([
			node({ number: 3, baseRefName: "branch-2" }),
		]);
		const shape = await resolveStackShape(root(pr), 2, fetchers);
		expect(shape).toMatchObject({
			source: "github",
			stackNumber: 9,
			baseRefName: "main",
			probeMergedBelow: true,
		});
		expect(shape?.layers.map((layer) => layer.number)).toEqual([1, 2]);
		expect(fetchers.calls).toEqual([]);
	});

	test("infers a chain through the lookups and only probes at the bottom", async () => {
		const bottom = node({ number: 10, headRefName: "a", baseRefName: "main" });
		const top = node({ number: 11, headRefName: "b", baseRefName: "a" });
		const asTop = await resolveStackShape(
			root(top),
			11,
			memoryFetchers([bottom, top]),
		);
		expect(asTop).toMatchObject({
			source: "inferred",
			baseRefName: "main",
			probeMergedBelow: false,
		});
		expect(
			asTop?.layers.map((layer) => [layer.position, layer.number]),
		).toEqual([
			[1, 10],
			[2, 11],
		]);
		const asBottom = await resolveStackShape(
			root(bottom),
			10,
			memoryFetchers([bottom, top]),
		);
		expect(asBottom?.probeMergedBelow).toBe(true);
	});

	test("returns null when the query answered for another PR", async () => {
		const fetchers = memoryFetchers([]);
		expect(
			await resolveStackShape(root(node({ number: 1 })), 2, fetchers),
		).toBeNull();
		expect(
			await resolveStackShape({ repository: null }, 2, fetchers),
		).toBeNull();
	});
});

describe("assemblePullRequestStack", () => {
	test("a lone PR with nothing merged beneath it is not a stack", async () => {
		const shape = await resolveStackShape(
			root(node({ number: 1 })),
			1,
			memoryFetchers([]),
		);
		expect(shape && assemblePullRequestStack(shape, null)).toBeNull();
	});

	test("a lone PR over a squash-merged layer becomes a two-layer stack", async () => {
		const shape = await resolveStackShape(
			root(node({ number: 2 })),
			2,
			memoryFetchers([]),
		);
		const stack =
			shape &&
			assemblePullRequestStack(shape, {
				number: 1,
				title: "Landed",
				url: "https://github.com/o/r/pull/1",
				headRefName: "landed",
				headRefOid: "abc",
				mergedAt: "2026-09-03T00:00:00Z",
			});
		expect(
			stack?.layers.map((layer) => [layer.position, layer.number, layer.state]),
		).toEqual([
			[1, 1, "merged"],
			[2, 2, "open"],
		]);
		expect(stack?.currentPosition).toBe(2);
		expect(stack?.mergedBelow?.number).toBe(1);
	});
});

describe("stackMergeTargets", () => {
	test("is the current layer and every unmerged layer below it", async () => {
		const pr: StackRootPullRequest = {
			...node({ number: 3 }),
			stack: nativeStack([
				{ position: 1, pullRequest: node({ number: 1, state: "MERGED" }) },
				{ position: 2, pullRequest: node({ number: 2 }) },
				{ position: 3, pullRequest: node({ number: 3 }) },
				{ position: 4, pullRequest: node({ number: 4 }) },
			]),
			stackEntry: { position: 3 },
		};
		const shape = await resolveStackShape(root(pr), 3, memoryFetchers([]));
		const stack = shape && assemblePullRequestStack(shape, null);
		expect(
			stack && stackMergeTargets(stack).map((layer) => layer.number),
		).toEqual([2, 3]);
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
		const data = await runStackRootQuery(async (query) => {
			queries.push(query);
			if (query.includes("stackEntry")) {
				throw new Error("Field 'stack' doesn't exist on type 'PullRequest'");
			}
			return root(node({ number: 1 }));
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
