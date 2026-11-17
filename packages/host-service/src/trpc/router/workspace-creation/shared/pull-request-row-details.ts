import { z } from "zod";
import type {
	ChecksStatus,
	PullRequestCheck,
} from "../../../../runtime/pull-requests/utils/pull-request-mappers";
import {
	normalizePullRequestChecks,
	pullRequestCheckContextSchema,
} from "../../pull-requests/pull-request-checks";
import type { ExecGh } from "../utils/exec-gh";
import type { ResolvedGithubRepo } from "./project-helpers";

/** What a PR list row shows beyond the search hit: checks, diff stat, branch. */
export interface PullRequestRowDetails {
	checks: PullRequestCheck[];
	checksStatus: ChecksStatus;
	additions: number | null;
	deletions: number | null;
	headRefName: string | null;
}

export type RunGraphqlQuery = (
	query: string,
	variables: Record<string, string>,
) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

const rowDetailsGraphqlDataSchema = z.object({
	repository: z
		.record(
			z.string(),
			z
				.object({
					number: z.number(),
					additions: z.number().optional(),
					deletions: z.number().optional(),
					headRefName: z.string().optional(),
					statusCheckRollup: z
						.object({
							contexts: z.object({
								nodes: z.array(pullRequestCheckContextSchema.nullable()),
								pageInfo: z.object({
									hasNextPage: z.boolean(),
									endCursor: z.string().nullable(),
								}),
							}),
						})
						.nullable()
						.optional(),
				})
				.nullable(),
		)
		.nullable(),
});

// 100 checks a page, so 2,000 per PR before giving up on a runaway cursor.
const MAX_CHECK_PAGES = 20;

type GraphqlDetails = Pick<
	PullRequestRowDetails,
	"additions" | "deletions" | "headRefName"
>;

/** One batched GraphQL read per repo, following check-rollup pages past 100. */
export async function fetchPullRequestRowDetails(
	runQuery: RunGraphqlQuery,
	repo: { owner: string; name: string },
	pullRequestNumbers: number[],
): Promise<Map<number, PullRequestRowDetails>> {
	if (pullRequestNumbers.length === 0) return new Map();
	const contextsByPullRequest = new Map<
		number,
		z.infer<typeof pullRequestCheckContextSchema>[]
	>();
	const detailsByPullRequest = new Map<number, GraphqlDetails>();
	let cursors = new Map<number, string | null>(
		pullRequestNumbers.map((number) => [number, null]),
	);
	const seenCursors = new Map<number, Set<string>>();

	for (let pageCount = 1; cursors.size > 0; pageCount++) {
		if (pageCount > MAX_CHECK_PAGES) {
			throw new Error(
				`Check rollup ran past ${MAX_CHECK_PAGES} pages for PRs ${[...cursors.keys()].join(", ")}`,
			);
		}
		const cursorDefinitions = [...cursors]
			.flatMap(([number, cursor]) =>
				cursor ? [`$cursor${number}: String!`] : [],
			)
			.join(", ");
		const selections = [...cursors]
			.map(
				([number, cursor]) => `pr${number}:pullRequest(number:${number}) {
				number
				additions
				deletions
				headRefName
				statusCheckRollup {
					contexts(first: 100${cursor ? `, after: $cursor${number}` : ""}) {
						pageInfo { hasNextPage endCursor }
						nodes {
							__typename
							... on CheckRun {
								name
								status
								conclusion
								detailsUrl
								startedAt
								completedAt
							}
							... on StatusContext {
								context
								state
								targetUrl
								createdAt
							}
						}
					}
				}
			}`,
			)
			.join("\n");
		const query = `query($owner: String!, $name: String!${cursorDefinitions ? `, ${cursorDefinitions}` : ""}) {
		repository(owner: $owner, name: $name) {
			${selections}
		}
	}`;
		const variables: Record<string, string> = {
			owner: repo.owner,
			name: repo.name,
		};
		for (const [number, cursor] of cursors) {
			if (cursor) variables[`cursor${number}`] = cursor;
		}
		const raw = await runQuery(query, variables);
		// `gh api graphql` returns the full `{ data: ... }` envelope;
		// octokit.graphql resolves to the inner data object.
		const data = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
		const repository = rowDetailsGraphqlDataSchema.parse(data).repository;
		if (!repository) return new Map();

		const nextCursors = new Map<number, string | null>();
		for (const pullRequest of Object.values(repository)) {
			if (!pullRequest) continue;
			const contexts =
				pullRequest.statusCheckRollup?.contexts.nodes.filter(
					(context): context is z.infer<typeof pullRequestCheckContextSchema> =>
						context !== null,
				) ?? [];
			const existing = contextsByPullRequest.get(pullRequest.number) ?? [];
			contextsByPullRequest.set(pullRequest.number, [...existing, ...contexts]);
			detailsByPullRequest.set(pullRequest.number, {
				additions: pullRequest.additions ?? null,
				deletions: pullRequest.deletions ?? null,
				headRefName: pullRequest.headRefName ?? null,
			});
			const pageInfo = pullRequest.statusCheckRollup?.contexts.pageInfo;
			if (pageInfo?.hasNextPage) {
				if (!pageInfo.endCursor) {
					throw new Error(
						`Missing check-rollup cursor for PR #${pullRequest.number}`,
					);
				}
				const seen = seenCursors.get(pullRequest.number) ?? new Set<string>();
				if (seen.has(pageInfo.endCursor)) {
					throw new Error(
						`Check-rollup cursor repeated for PR #${pullRequest.number}`,
					);
				}
				seen.add(pageInfo.endCursor);
				seenCursors.set(pullRequest.number, seen);
				nextCursors.set(pullRequest.number, pageInfo.endCursor);
			}
		}
		cursors = nextCursors;
	}

	return new Map(
		pullRequestNumbers.map((pullRequestNumber) => {
			const contexts = contextsByPullRequest.get(pullRequestNumber) ?? [];
			const { checks, checksStatus } = normalizePullRequestChecks(contexts);
			const details = detailsByPullRequest.get(pullRequestNumber) ?? {
				additions: null,
				deletions: null,
				headRefName: null,
			};
			return [pullRequestNumber, { checks, checksStatus, ...details }] as const;
		}),
	);
}

export function ghFetchPullRequestRowDetails(
	execGh: ExecGh,
	repo: ResolvedGithubRepo,
	pullRequestNumbers: number[],
): Promise<Map<number, PullRequestRowDetails>> {
	return fetchPullRequestRowDetails(
		(query, variables) =>
			execGh(
				[
					"api",
					"graphql",
					"-f",
					`query=${query}`,
					...Object.entries(variables).flatMap(([key, value]) => [
						"-f",
						`${key}=${value}`,
					]),
				],
				{ cwd: repo.repoPath ?? undefined },
			),
		repo,
		pullRequestNumbers,
	);
}
