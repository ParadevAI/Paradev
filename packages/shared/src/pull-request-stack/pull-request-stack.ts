/**
 * A pull request's stack: GitHub's own when the pull request is in one,
 * otherwise the chain of pull requests whose base branch is another's head
 * branch. No query here asks for check rollups: across many pull requests
 * they make GitHub's GraphQL edge answer 502, and `mergeStateStatus` already
 * says whether checks fail.
 */

export interface StackGithubClient {
	graphql: <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
	request: (
		route: string,
		parameters?: Record<string, unknown>,
	) => Promise<{ data: unknown }>;
}

export interface StackPullRequestRef {
	owner: string;
	repo: string;
	number: number;
}

export type StackLayerState = "open" | "merged" | "closed";
export type StackMergeability = "mergeable" | "conflicting" | "unknown";
export type StackReviewDecision =
	| "approved"
	| "changes_requested"
	| "review_required"
	| null;

export interface PullRequestStackLayer {
	/** 1 is the layer closest to the trunk. */
	position: number;
	number: number;
	title: string;
	url: string;
	state: StackLayerState;
	isDraft: boolean;
	headRefName: string;
	/** The head commit when the stack was read. */
	headRefOid: string;
	baseRefName: string;
	mergeable: StackMergeability;
	/** GitHub's `MergeStateStatus` (CLEAN, BLOCKED, UNSTABLE, ...). */
	mergeStateStatus: string | null;
	reviewDecision: StackReviewDecision;
	/** Its place in the base branch's merge queue; position 1 merges next. */
	queue: { position: number | null; state: string } | null;
	isCurrent: boolean;
}

export interface StackRestack {
	/** The merged pull request whose commits the branch still carries. */
	number: number;
	headRefName: string;
	/** Its last commit: a restack replays only the commits after it. */
	headRefOid: string;
}

export interface PullRequestStack {
	source: "github" | "inferred";
	/** GitHub's stack number; null for an inferred chain. */
	stackNumber: number | null;
	/** The branch every layer eventually lands on. */
	baseRefName: string;
	/** Ordered by position, trunk-most first. Merged layers stay listed. */
	layers: PullRequestStackLayer[];
	currentPosition: number;
	/** The base branch merges through a merge queue. */
	usesMergeQueue: boolean;
	/**
	 * Set while the current branch still carries the commits of a layer that
	 * merged below it. Until it is restacked onto the trunk, its diff repeats
	 * that layer and GitHub may report conflicts against the squashed copy.
	 */
	restack: StackRestack | null;
}

export interface StackPullRequestNode {
	number: number;
	title: string;
	url: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	/** True for a pull request from a fork; a stack lives in one repository. */
	isCrossRepository: boolean;
	headRefName: string;
	headRefOid: string;
	baseRefName: string;
	mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
	mergeStateStatus: string | null;
	reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
	updatedAt: string;
	isMergeQueueEnabled?: boolean;
	mergeQueueEntry: { position: number | null; state: string } | null;
	/** Chain lookups only: the base changes that say what it sat on before. */
	timelineItems?: {
		nodes: Array<{
			previousRefName?: string | null;
			currentRefName?: string | null;
		} | null>;
	};
}

export interface NativeStackNode {
	number: number;
	baseRefName: string;
	size: number;
	entries: {
		totalCount: number;
		nodes: Array<{
			position: number;
			pullRequest: StackPullRequestNode | null;
		} | null>;
	};
}

export type StackRootPullRequest = StackPullRequestNode & {
	stack?: NativeStackNode | null;
	stackEntry?: { position: number } | null;
};

export interface StackRootQueryResult {
	repository: {
		defaultBranchRef: { name: string } | null;
		pullRequest: StackRootPullRequest | null;
	} | null;
}

interface PullRequestListQueryResult {
	repository: {
		pullRequests: { nodes: Array<StackPullRequestNode | null> };
	} | null;
}

/** Native stacks larger than this are reported as incomplete, not paged. */
const NATIVE_STACK_ENTRY_LIMIT = 100;

const LAYER_FRAGMENTS = `
fragment StackLayer on PullRequest {
	number title url state isDraft isCrossRepository
	headRefName headRefOid baseRefName
	mergeable mergeStateStatus reviewDecision updatedAt
	isMergeQueueEnabled
	mergeQueueEntry { position state }
}
fragment ChainLayer on PullRequest {
	...StackLayer
	timelineItems(last: 5, itemTypes: [BASE_REF_CHANGED_EVENT]) {
		nodes { ... on BaseRefChangedEvent { previousRefName currentRefName } }
	}
}`;

const NATIVE_STACK_SELECTION = `
			stack {
				number baseRefName size
				entries(first: ${NATIVE_STACK_ENTRY_LIMIT}) {
					totalCount
					nodes { position pullRequest { ...StackLayer } }
				}
			}
			stackEntry { position }`;

/**
 * The pull request itself with its native stack, if any. `includeNativeStack`
 * exists for hosts whose schema predates stacks, where the unknown fields
 * would fail validation for the whole query.
 */
export function buildStackRootQuery(includeNativeStack: boolean): string {
	return `
query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		defaultBranchRef { name }
		pullRequest(number: $number) {
			...ChainLayer${includeNativeStack ? NATIVE_STACK_SELECTION : ""}
		}
	}
}
${LAYER_FRAGMENTS}`;
}

/** The open pull request whose head is `$head`: the layer beneath a base branch. */
export const OPEN_BY_HEAD_QUERY = `
query($owner: String!, $name: String!, $head: String!) {
	repository(owner: $owner, name: $name) {
		pullRequests(headRefName: $head, states: [OPEN], first: 5) {
			nodes { ...ChainLayer }
		}
	}
}
${LAYER_FRAGMENTS}`;

/** Open pull requests targeting `$base`: the layers built on a head branch. */
export const OPEN_BY_BASE_QUERY = `
query($owner: String!, $name: String!, $base: String!) {
	repository(owner: $owner, name: $name) {
		pullRequests(
			baseRefName: $base, states: [OPEN], first: 10,
			orderBy: { field: UPDATED_AT, direction: DESC }
		) {
			nodes { ...ChainLayer }
		}
	}
}
${LAYER_FRAGMENTS}`;

/** The merged pull request whose head was `$head`: a layer that already landed. */
export const MERGED_BY_HEAD_QUERY = `
query($owner: String!, $name: String!, $head: String!) {
	repository(owner: $owner, name: $name) {
		pullRequests(
			headRefName: $head, states: [MERGED], first: 3,
			orderBy: { field: UPDATED_AT, direction: DESC }
		) {
			nodes { ...ChainLayer }
		}
	}
}
${LAYER_FRAGMENTS}`;

export type StackGraphqlRunner = StackGithubClient["graphql"];

function isUnknownStackFieldError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? "");
	return (
		/field '?stack(Entry)?'?/i.test(message) && /exist|unknown/i.test(message)
	);
}

/**
 * Runs the root query, tolerating the two ways the native-stack fields fail.
 * Octokit rejects any response that carries `errors`, even with usable
 * partial data: a repository with stacks switched off answers the `stack`
 * field with an error and everything else intact, so the partial payload is
 * kept. A schema that lacks the fields fails validation for the whole query,
 * and is retried without them.
 */
export async function runStackRootQuery(
	graphql: StackGraphqlRunner,
	variables: { owner: string; name: string; number: number },
): Promise<StackRootQueryResult | null> {
	try {
		return await graphql<StackRootQueryResult>(
			buildStackRootQuery(true),
			variables,
		);
	} catch (error) {
		const partial = (error as { data?: StackRootQueryResult | null })?.data;
		if (partial?.repository?.pullRequest) return partial;
		if (isUnknownStackFieldError(error)) {
			return await graphql<StackRootQueryResult>(
				buildStackRootQuery(false),
				variables,
			);
		}
		throw error;
	}
}

/** The targeted lookups a chain walk needs, so tests can back them in memory. */
export interface StackChainFetchers {
	/** The open pull request in this repository whose head branch is `headRefName`. */
	findOpenByHead(headRefName: string): Promise<StackPullRequestNode | null>;
	/** Open pull requests in this repository based on `baseRefName`, newest first. */
	findOpenByBase(baseRefName: string): Promise<StackPullRequestNode[]>;
	/** The most recently merged pull request whose head branch was `headRefName`. */
	findMergedByHead(headRefName: string): Promise<StackPullRequestNode | null>;
}

function byUpdatedDesc(a: { updatedAt: string }, b: { updatedAt: string }) {
	return b.updatedAt.localeCompare(a.updatedAt);
}

export function createStackFetchers(
	graphql: StackGraphqlRunner,
	repo: { owner: string; name: string },
): StackChainFetchers {
	const listNodes = async (query: string, variables: Record<string, string>) =>
		(
			(
				await graphql<PullRequestListQueryResult | null | undefined>(query, {
					...repo,
					...variables,
				})
			)?.repository?.pullRequests.nodes ?? []
		)
			// A fork can carry a branch of the same name; the stack lives here.
			.filter(
				(node): node is StackPullRequestNode =>
					node != null && !node.isCrossRepository,
			);

	return {
		async findOpenByHead(headRefName) {
			return (
				(await listNodes(OPEN_BY_HEAD_QUERY, { head: headRefName }))[0] ?? null
			);
		},
		async findOpenByBase(baseRefName) {
			return (await listNodes(OPEN_BY_BASE_QUERY, { base: baseRefName })).sort(
				byUpdatedDesc,
			);
		},
		async findMergedByHead(headRefName) {
			return (
				(await listNodes(MERGED_BY_HEAD_QUERY, { head: headRefName })).sort(
					byUpdatedDesc,
				)[0] ?? null
			);
		},
	};
}

function reviewDecision(
	value: StackPullRequestNode["reviewDecision"],
): StackReviewDecision {
	if (value === "APPROVED") return "approved";
	if (value === "CHANGES_REQUESTED") return "changes_requested";
	if (value === "REVIEW_REQUIRED") return "review_required";
	return null;
}

export function mapStackLayer(
	node: StackPullRequestNode,
	position: number,
	isCurrent: boolean,
): PullRequestStackLayer {
	return {
		position,
		number: node.number,
		title: node.title,
		url: node.url,
		state:
			node.state === "MERGED"
				? "merged"
				: node.state === "CLOSED"
					? "closed"
					: "open",
		isDraft: node.isDraft,
		headRefName: node.headRefName,
		headRefOid: node.headRefOid,
		baseRefName: node.baseRefName,
		mergeable:
			node.mergeable === "MERGEABLE"
				? "mergeable"
				: node.mergeable === "CONFLICTING"
					? "conflicting"
					: "unknown",
		mergeStateStatus: node.mergeStateStatus?.trim() || null,
		reviewDecision: reviewDecision(node.reviewDecision),
		queue: node.mergeQueueEntry
			? {
					position: node.mergeQueueEntry.position ?? null,
					state: node.mergeQueueEntry.state,
				}
			: null,
		isCurrent,
	};
}

/** GitHub listed a stack this pull request is in, but not all of it. */
export class IncompleteStackError extends Error {
	constructor() {
		super("GitHub returned a partial or inconsistent pull request stack.");
		this.name = "IncompleteStackError";
	}
}

/**
 * Layers from GitHub's own stack, or null when the pull request isn't in one.
 * Throws when GitHub's answer does not add up (a missing entry, a gap in the
 * positions, the pull request at another position than it claims): a merge
 * planned from part of a stack would land the wrong prefix.
 */
export function buildNativeStackLayers(
	pr: StackRootPullRequest | null | undefined,
): {
	layers: PullRequestStackLayer[];
	stack: NativeStackNode;
	usesMergeQueue: boolean;
} | null {
	const stack = pr?.stack;
	const entry = pr?.stackEntry;
	if (!pr || (!stack && !entry)) return null;
	if (!stack || !entry) throw new IncompleteStackError();
	const nodes = stack.entries.nodes.flatMap((node) =>
		node?.pullRequest
			? [{ position: node.position, pullRequest: node.pullRequest }]
			: [],
	);
	const layers = nodes
		.map((node) =>
			mapStackLayer(
				node.pullRequest,
				node.position,
				node.pullRequest.number === pr.number,
			),
		)
		.sort((a, b) => a.position - b.position);
	if (
		stack.size !== stack.entries.totalCount ||
		layers.length !== stack.size ||
		layers.some((layer, index) => layer.position !== index + 1) ||
		layers[entry.position - 1]?.number !== pr.number
	) {
		throw new IncompleteStackError();
	}
	return {
		layers,
		stack,
		usesMergeQueue: nodes.some(
			(node) => node.pullRequest.isMergeQueueEnabled === true,
		),
	};
}

/** Bounds a pathological base-branch loop (A on B on A). */
const MAX_CHAIN_LENGTH = 25;
const MAX_MERGED_BELOW = 10;

/**
 * Walks the base-branch chain: down until a base is no open pull request's
 * head (the trunk), up while an open pull request builds on the head. A fork
 * above (two pull requests based on the same branch) follows the most
 * recently updated one, so the chain stays linear like a native stack. The
 * default branch is never looked up as a layer.
 */
export async function walkInferredChain(
	current: StackPullRequestNode,
	fetchers: Pick<StackChainFetchers, "findOpenByHead" | "findOpenByBase">,
	options: { defaultBranch: string | null } = { defaultBranch: null },
): Promise<StackPullRequestNode[]> {
	const visited = new Set<number>([current.number]);

	const below: StackPullRequestNode[] = [];
	let cursor = current;
	while (below.length < MAX_CHAIN_LENGTH) {
		if (
			cursor.baseRefName === options.defaultBranch ||
			cursor.baseRefName === cursor.headRefName
		) {
			break;
		}
		const next = await fetchers.findOpenByHead(cursor.baseRefName);
		if (!next || visited.has(next.number)) break;
		visited.add(next.number);
		below.unshift(next);
		cursor = next;
	}

	const above: StackPullRequestNode[] = [];
	cursor = current;
	while (above.length < MAX_CHAIN_LENGTH) {
		const children = (await fetchers.findOpenByBase(cursor.headRefName))
			.filter((pr) => !visited.has(pr.number))
			.sort(byUpdatedDesc);
		const next = children[0];
		if (!next) break;
		visited.add(next.number);
		above.push(next);
		cursor = next;
	}

	return [...below, current, ...above];
}

/** The branch a pull request targeted before GitHub moved it to its present base. */
function previousBase(node: StackPullRequestNode): string | null {
	const events = node.timelineItems?.nodes ?? [];
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.currentRefName === node.baseRefName && event.previousRefName) {
			return event.previousRefName;
		}
	}
	return null;
}

/**
 * The layers that already merged beneath `bottom`, trunk-most first. When a
 * layer merges, GitHub retargets the one above it to the trunk and the chain
 * loses its link; the retarget stays in the pull request's timeline and
 * names the branch it sat on.
 */
export async function walkMergedBelow(
	bottom: StackPullRequestNode,
	fetchers: Pick<StackChainFetchers, "findMergedByHead">,
): Promise<StackPullRequestNode[]> {
	const seen = new Set<number>([bottom.number]);
	const merged: StackPullRequestNode[] = [];
	let cursor = bottom;
	while (merged.length < MAX_MERGED_BELOW) {
		const head = previousBase(cursor);
		if (!head) break;
		const below = await fetchers.findMergedByHead(head);
		if (!below || seen.has(below.number)) break;
		seen.add(below.number);
		merged.unshift(below);
		cursor = below;
	}
	return merged;
}

function field<T>(data: unknown, key: string): T | undefined {
	return data && typeof data === "object"
		? ((data as Record<string, unknown>)[key] as T | undefined)
		: undefined;
}

/**
 * Whether `branchHead` still contains the merged layer's last commit while
 * the trunk does not. A merge-commit merge keeps that commit reachable from
 * the trunk, so it needs no restack; a squash or rebase merge rewrites it.
 */
export async function carriesMergedCommits(
	client: Pick<StackGithubClient, "request">,
	repo: { owner: string; repo: string },
	refs: { mergedHead: string; branchHead: string; trunk: string },
): Promise<boolean> {
	const missingFrom = async (head: string): Promise<number | null> => {
		try {
			const { data } = await client.request(
				"GET /repos/{owner}/{repo}/compare/{basehead}",
				{ ...repo, basehead: `${refs.mergedHead}...${head}`, per_page: 1 },
			);
			return field<number>(data, "behind_by") ?? null;
		} catch {
			return null;
		}
	};
	if ((await missingFrom(refs.branchHead)) !== 0) return false;
	const missingFromTrunk = await missingFrom(refs.trunk);
	return missingFromTrunk !== null && missingFromTrunk > 0;
}

/**
 * The stack `pr` belongs to, or null for a pull request that stands alone.
 * Throws when GitHub cannot be read or answers with part of a native stack.
 */
export async function readPullRequestStack(
	client: StackGithubClient,
	pr: StackPullRequestRef,
): Promise<PullRequestStack | null> {
	const repo = { owner: pr.owner, name: pr.repo };
	const root = await runStackRootQuery(client.graphql, {
		...repo,
		number: pr.number,
	});
	const repository = root?.repository;
	const current = repository?.pullRequest;
	if (!repository || !current || current.number !== pr.number) return null;

	const native = buildNativeStackLayers(current);
	if (native) {
		return {
			source: "github",
			stackNumber: native.stack.number,
			baseRefName: native.stack.baseRefName,
			layers: native.layers,
			currentPosition:
				native.layers.find((layer) => layer.isCurrent)?.position ?? 1,
			usesMergeQueue: native.usesMergeQueue,
			restack: null,
		};
	}

	const fetchers = createStackFetchers(client.graphql, repo);
	const open =
		current.state === "OPEN"
			? await walkInferredChain(current, fetchers, {
					defaultBranch: repository.defaultBranchRef?.name ?? null,
				})
			: [current];
	const bottom = open[0] ?? current;
	const merged = await walkMergedBelow(bottom, fetchers);
	const nodes = [...merged, ...open];
	if (nodes.length < 2) return null;

	const mergedBelow = merged.at(-1);
	const restack =
		mergedBelow && current.state === "OPEN" && bottom.number === current.number
			? (await carriesMergedCommits(
					client,
					{ owner: pr.owner, repo: pr.repo },
					{
						mergedHead: mergedBelow.headRefOid,
						branchHead: current.headRefOid,
						trunk: current.baseRefName,
					},
				))
				? {
						number: mergedBelow.number,
						headRefName: mergedBelow.headRefName,
						headRefOid: mergedBelow.headRefOid,
					}
				: null
			: null;

	return {
		source: "inferred",
		stackNumber: null,
		baseRefName: bottom.baseRefName,
		layers: nodes.map((node, index) =>
			mapStackLayer(node, index + 1, node.number === current.number),
		),
		currentPosition: merged.length + open.indexOf(current) + 1,
		usesMergeQueue: open.some((node) => node.isMergeQueueEnabled === true),
		restack,
	};
}

/**
 * The layers a merge of the current one lands: itself and every unmerged
 * layer below it, trunk-most first.
 */
export function stackMergeTargets(
	stack: Pick<PullRequestStack, "layers" | "currentPosition">,
): PullRequestStackLayer[] {
	return stack.layers.filter(
		(layer) =>
			layer.position <= stack.currentPosition && layer.state !== "merged",
	);
}

/**
 * Turns a chain of pull requests into a stack on GitHub, bottom to top. Each
 * one's base branch must be the head branch of the one before it.
 */
export async function createPullRequestStack(
	client: Pick<StackGithubClient, "request">,
	repo: { owner: string; repo: string },
	pullRequests: number[],
): Promise<{ stackNumber: number | null }> {
	const { data } = await client.request("POST /repos/{owner}/{repo}/stacks", {
		owner: repo.owner,
		repo: repo.repo,
		pull_requests: pullRequests,
	});
	return { stackNumber: field<number>(data, "number") ?? null };
}
