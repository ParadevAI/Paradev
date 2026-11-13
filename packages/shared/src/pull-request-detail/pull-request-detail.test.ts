import { describe, expect, test } from "bun:test";
import {
	type PullRequestAppGatedFields,
	type PullRequestAppGatedQuery,
	type PullRequestDetailQuery,
	PullRequestReadError,
	readPullRequestDetail,
} from "./pull-request-detail";

const input = { owner: "acme", repo: "widgets", pullNumber: 7 };

type PullRequestFixture = NonNullable<
	NonNullable<PullRequestDetailQuery["repository"]>["pullRequest"]
> &
	PullRequestAppGatedFields;

const isAppGatedRead = (query: string) => query.includes("adminMerge:");

function appGatedRead(
	pr: PullRequestAppGatedFields = pullRequest().repository.pullRequest,
): PullRequestAppGatedQuery {
	return {
		repository: {
			adminMerge: { viewerCanMergeAsAdmin: pr.viewerCanMergeAsAdmin },
			queueEntry: { mergeQueueEntry: pr.mergeQueueEntry },
			queueEnabled: { isMergeQueueEnabled: pr.isMergeQueueEnabled },
			protection: { baseRef: pr.baseRef },
		},
	};
}

function pullRequest(overrides: Partial<PullRequestFixture> = {}): {
	repository: Omit<
		NonNullable<PullRequestDetailQuery["repository"]>,
		"pullRequest"
	> & { pullRequest: PullRequestFixture };
} {
	return {
		repository: {
			squashMergeAllowed: true,
			mergeCommitAllowed: false,
			rebaseMergeAllowed: true,
			viewerDefaultMergeMethod: "REBASE",
			pullRequest: {
				id: "PR_1",
				number: 7,
				title: "Widgets",
				body: "",
				url: "https://github.com/acme/widgets/pull/7",
				baseRefName: "main",
				state: "OPEN",
				isDraft: false,
				merged: false,
				mergedAt: null,
				additions: 3,
				deletions: 1,
				changedFiles: 2,
				mergeable: "MERGEABLE",
				mergeStateStatus: "BEHIND",
				reviewDecision: "REVIEW_REQUIRED",
				viewerCanUpdate: true,
				viewerCanMergeAsAdmin: false,
				mergedBy: null,
				mergeQueueEntry: null,
				isMergeQueueEnabled: true,
				baseRef: {
					branchProtectionRule: {
						requiredApprovingReviewCount: 2,
						requiresConversationResolution: true,
					},
				},
				latestOpinionatedReviews: {
					nodes: [
						{ state: "APPROVED", author: { login: "maya", avatarUrl: "m" } },
						{
							state: "CHANGES_REQUESTED",
							author: { login: "lee", avatarUrl: null },
						},
					],
				},
				reviewThreads: {
					pageInfo: { hasNextPage: true, endCursor: "c1" },
					nodes: [{ isResolved: false, isOutdated: false }],
				},
				statusCheckRollup: {
					contexts: {
						pageInfo: { hasNextPage: false, endCursor: null },
						nodes: [
							{
								__typename: "CheckRun",
								name: "CI / Typecheck",
								status: "COMPLETED",
								conclusion: "FAILURE",
								isRequired: true,
							},
							{
								__typename: "StatusContext",
								context: "lint",
								state: "PENDING",
							},
						],
					},
				},
				...overrides,
			},
		},
	};
}

describe("readPullRequestDetail", () => {
	test("drains every page before grading, and a review outranks a request", async () => {
		const queries: string[] = [];
		const detail = await readPullRequestDetail(
			{
				graphql: async <T>(
					query: string,
					variables: Record<string, unknown>,
				) => {
					if (isAppGatedRead(query)) return appGatedRead() as T;
					queries.push(String(variables.cursor ?? "first"));
					if (variables.cursor === "c1") {
						return {
							repository: {
								pullRequest: {
									reviewThreads: {
										pageInfo: { hasNextPage: false, endCursor: null },
										nodes: [{ isResolved: false, isOutdated: true }, null],
									},
								},
							},
						} as T;
					}
					return pullRequest() as T;
				},
				requestedReviewers: async () => ({
					users: [{ login: "maya", avatar_url: "m" }, { login: "sam" }],
					teams: [{ name: "platform" }],
				}),
			},
			input,
		);
		expect(queries).toEqual(["first", "c1"]);
		expect(detail.reviewers).toEqual([
			{ login: "maya", avatarUrl: "m", isTeam: false, state: "APPROVED" },
			{ login: "sam", avatarUrl: null, isTeam: false, state: "REQUESTED" },
			{ login: "platform", avatarUrl: null, isTeam: true, state: "REQUESTED" },
			{
				login: "lee",
				avatarUrl: null,
				isTeam: false,
				state: "CHANGES_REQUESTED",
			},
		]);
		expect(detail.mergeability).toMatchObject({
			approvals: 1,
			requiredApprovals: 2,
			unresolvedThreads: 1,
			requiresThreadResolution: true,
			allowedMergeMethods: ["squash", "rebase"],
			defaultMergeMethod: "rebase",
			queueEnabled: true,
		});
		expect(
			detail.checks.map((check) => [check.name, check.conclusion]),
		).toEqual([
			["CI / Typecheck", "FAILURE"],
			["lint", null],
		]);
		expect(detail.capabilities).toEqual({
			update: true,
			merge: true,
			markReady: false,
			updateBranch: true,
			reopen: false,
			dequeue: false,
		});
	});

	test("a page without a cursor fails the read rather than grading a partial set", async () => {
		await expect(
			readPullRequestDetail(
				{
					graphql: async <T>() =>
						pullRequest({
							reviewThreads: {
								pageInfo: { hasNextPage: true, endCursor: null },
								nodes: [],
							},
						}) as T,
					requestedReviewers: async () => ({ users: [], teams: [] }),
				},
				input,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("a missing pull request is NOT_FOUND", async () => {
		const error = await readPullRequestDetail(
			{
				graphql: async <T>() => ({ repository: { pullRequest: null } }) as T,
				requestedReviewers: async () => {
					throw new Error("Not Found");
				},
			},
			input,
		).catch((e) => e);
		expect(error).toBeInstanceOf(PullRequestReadError);
		expect(error.code).toBe("NOT_FOUND");
	});

	test("fields the GitHub App may not read fall back, one by one, instead of failing the read", async () => {
		const refused = Object.assign(new Error("Resource not accessible"), {
			errors: [
				{
					type: "FORBIDDEN",
					path: ["repository", "queueEnabled", "isMergeQueueEnabled"],
				},
			],
			data: {
				repository: {
					...appGatedRead().repository,
					queueEnabled: null,
				},
			},
		});
		const refusals: unknown[] = [];
		const detail = await readPullRequestDetail(
			{
				graphql: async <T>(query: string) => {
					if (isAppGatedRead(query)) throw refused;
					return pullRequest({
						reviewThreads: {
							pageInfo: { hasNextPage: false, endCursor: null },
							nodes: [],
						},
					}) as T;
				},
				requestedReviewers: async () => ({ users: [], teams: [] }),
			},
			input,
			{ onRefused: (error) => refusals.push(error) },
		);
		expect(refusals).toEqual([refused]);
		expect(detail.mergeability).toMatchObject({
			requiredApprovals: 2,
			requiresThreadResolution: true,
			queueEnabled: false,
		});
	});

	test("status checks the GitHub App may not read are dropped instead of failing the read", async () => {
		const page = pullRequest({
			reviewThreads: {
				pageInfo: { hasNextPage: false, endCursor: null },
				nodes: [],
			},
		});
		const contexts = page.repository.pullRequest.statusCheckRollup?.contexts;
		const refused = Object.assign(new Error("Resource not accessible"), {
			errors: [
				{
					type: "FORBIDDEN",
					path: [
						"repository",
						"pullRequest",
						"statusCheckRollup",
						"contexts",
						"nodes",
						1,
					],
				},
			],
			data: {
				repository: {
					...page.repository,
					pullRequest: {
						...page.repository.pullRequest,
						statusCheckRollup: {
							contexts: contexts && {
								...contexts,
								nodes: [contexts.nodes[0], null],
							},
						},
					},
				},
			},
		});
		const refusals: unknown[] = [];
		const detail = await readPullRequestDetail(
			{
				graphql: async <T>(query: string) => {
					if (isAppGatedRead(query)) return appGatedRead() as T;
					throw refused;
				},
				requestedReviewers: async () => ({ users: [], teams: [] }),
			},
			input,
			{ onRefused: (error) => refusals.push(error) },
		);
		expect(refusals).toEqual([refused]);
		expect(detail.checks.map((check) => check.name)).toEqual([
			"CI / Typecheck",
		]);
	});

	test("a refusal outside the checks, or next to another error, still fails the read", async () => {
		const failures = [
			{
				errors: [
					{ type: "FORBIDDEN", path: ["repository", "pullRequest", "title"] },
				],
			},
			{
				errors: [
					{
						type: "FORBIDDEN",
						path: ["repository", "pullRequest", "statusCheckRollup"],
					},
					{ type: "RATE_LIMITED", path: ["repository"] },
				],
			},
		];
		for (const failure of failures) {
			const error = Object.assign(new Error("GitHub refused"), {
				...failure,
				data: pullRequest(),
			});
			const refusals: unknown[] = [];
			const read = readPullRequestDetail(
				{
					graphql: async <T>(query: string) => {
						if (isAppGatedRead(query)) return appGatedRead() as T;
						throw error;
					},
					requestedReviewers: async () => ({ users: [], teams: [] }),
				},
				input,
				{ onRefused: (refusal) => refusals.push(refusal) },
			);
			await expect(read).rejects.toBe(error);
			expect(refusals).toEqual([]);
		}
	});

	test("requested reviewers are asked for alongside the main read, not after it", async () => {
		let releaseRead = () => {};
		let reviewersAsked = false;
		const read = readPullRequestDetail(
			{
				graphql: <T>(query: string) =>
					isAppGatedRead(query)
						? Promise.resolve(appGatedRead() as T)
						: new Promise<T>((resolve) => {
								releaseRead = () =>
									resolve(
										pullRequest({
											reviewThreads: {
												pageInfo: { hasNextPage: false, endCursor: null },
												nodes: [],
											},
										}) as T,
									);
							}),
				requestedReviewers: async () => {
					reviewersAsked = true;
					return { users: [], teams: [] };
				},
			},
			input,
		);
		expect(reviewersAsked).toBe(true);
		releaseRead();
		await read;
	});

	test("activity is read only when asked for, with reviews folded into the conversation", async () => {
		const asked: unknown[] = [];
		const client = {
			graphql: async <T>(query: string, variables: Record<string, unknown>) => {
				if (!isAppGatedRead(query)) asked.push(variables.activity);
				return pullRequest({
					reviewThreads: {
						pageInfo: { hasNextPage: false, endCursor: null },
						nodes: [],
					},
					author: { login: "satya", avatarUrl: null },
					headRefName: "feat/x",
					headRepository: { nameWithOwner: "fork/widgets" },
					createdAt: "2026-10-01T09:00:00Z",
					updatedAt: "2026-10-02T09:00:00Z",
					closedAt: null,
					labels: { nodes: [{ name: "desktop", color: "1d76db" }, null] },
					comments: {
						nodes: [
							{
								id: "C1",
								body: "On it",
								createdAt: "2026-10-02T09:30:00Z",
								url: "https://github.com/acme/widgets/pull/7#issuecomment-1",
								author: { login: "satya", name: "Satya" },
							},
						],
					},
					reviews: {
						nodes: [
							{
								id: "R1",
								body: "Fix it",
								state: "CHANGES_REQUESTED",
								submittedAt: "2026-10-02T10:00:00Z",
								author: { login: "lee" },
							},
							{
								id: "R2",
								body: "",
								state: "PENDING",
								submittedAt: null,
								author: null,
							},
						],
					},
					commits: {
						nodes: [
							{
								commit: {
									oid: "abc",
									messageHeadline: "feat: x ",
									committedDate: "2026-10-01T08:00:00Z",
									authors: { nodes: [{ name: "Satya", user: null }] },
								},
							},
						],
					},
				}) as T;
			},
			requestedReviewers: async () => ({ users: [], teams: [] }),
		};

		expect((await readPullRequestDetail(client, input)).activity).toBeNull();
		const { activity } = await readPullRequestDetail(client, input, {
			activity: true,
		});
		expect(asked).toEqual([false, true]);
		expect(activity).toMatchObject({
			author: { login: "satya", avatarUrl: null },
			headBranch: "feat/x",
			headRepoFullName: "fork/widgets",
			labels: [{ name: "desktop", color: "1d76db" }],
			commits: [
				{
					oid: "abc",
					messageHeadline: "feat: x",
					author: { login: null, name: "Satya" },
					url: "https://github.com/acme/widgets/pull/7/commits/abc",
				},
			],
		});
		expect(
			activity?.comments.map((c) => [c.kind, c.id, c.reviewState]),
		).toEqual([
			["comment", "C1", null],
			["review", "R1", "CHANGES_REQUESTED"],
		]);
	});
});
