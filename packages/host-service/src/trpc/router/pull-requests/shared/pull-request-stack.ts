/**
 * A PR's stack comes from GitHub's native `stack` field when it has one,
 * otherwise from the chain of open PRs whose base branch is another's head
 * branch. No query here asks for check rollups: rollups across many PRs in
 * one query make GitHub's GraphQL edge answer 502, and `mergeStateStatus`
 * already says whether checks fail.
 */

export type StackLayerState = "open" | "merged" | "closed";
export type StackMergeability = "mergeable" | "conflicting" | "unknown";

export interface PullRequestStackLayer {
	/** 1 is the layer closest to the trunk. */
	position: number;
	number: number;
	title: string;
	url: string;
	state: StackLayerState;
	isDraft: boolean;
	isQueued: boolean;
	headRefName: string;
	baseRefName: string;
	mergeable: StackMergeability;
	/** GitHub's `MergeStateStatus` (CLEAN, BLOCKED, UNSTABLE, ...). */
	mergeStateStatus: string | null;
	isCurrent: boolean;
	/** A live workspace on this host linked to the layer's PR. */
	workspaceId: string | null;
}

export interface MergedLayerBelow {
	number: number;
	title: string;
	url: string;
	headRefName: string;
	/** The merged layer's last commit, which a restack replays from. */
	headRefOid: string;
	mergedAt: string | null;
}

export interface PullRequestStack {
	source: "github" | "inferred";
	/** GitHub's stack number; null for an inferred chain. */
	stackNumber: number | null;
	/** The branch every layer eventually lands on. */
	baseRefName: string;
	/** Ordered by position, trunk-most first. */
	layers: PullRequestStackLayer[];
	currentPosition: number;
	/**
	 * A layer that already merged while this branch still carries its
	 * commits. Until the branch is restacked onto the trunk, GitHub reports
	 * conflicts against the squashed copy of those commits.
	 */
	mergedBelow: MergedLayerBelow | null;
}

export interface StackPullRequestNode {
	number: number;
	title: string;
	url: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	/** True for a PR from a fork; a stack lives in one repository. */
	isCrossRepository: boolean;
	headRefName: string;
	baseRefName: string;
	mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
	mergeStateStatus: string | null;
	updatedAt: string;
	mergeQueueEntry: { id: string } | null;
}

export interface MergedPullRequestNode {
	number: number;
	title: string;
	url: string;
	headRefName: string;
	headRefOid: string;
	baseRefName: string;
	mergedAt: string | null;
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

interface MergedListQueryResult {
	repository: {
		pullRequests: { nodes: Array<MergedPullRequestNode | null> };
	} | null;
}

/** Native stacks larger than this are reported as incomplete, not paged. */
const NATIVE_STACK_ENTRY_LIMIT = 100;

const STACK_LAYER_FRAGMENT = `
fragment StackLayer on PullRequest {
	number title url state isDraft isCrossRepository headRefName baseRefName
	mergeable mergeStateStatus updatedAt
	mergeQueueEntry { id }
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
 * The PR itself with its native stack, if any. `includeNativeStack` exists
 * for hosts whose schema predates stacks (GitHub Enterprise), where the
 * unknown fields would fail validation for the whole query.
 */
export function buildStackRootQuery(includeNativeStack: boolean): string {
	return `
query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		defaultBranchRef { name }
		pullRequest(number: $number) {
			...StackLayer${includeNativeStack ? NATIVE_STACK_SELECTION : ""}
		}
	}
}
${STACK_LAYER_FRAGMENT}`;
}

/** The open PR whose head is `$head`: the layer beneath a base branch. */
export const OPEN_BY_HEAD_QUERY = `
query($owner: String!, $name: String!, $head: String!) {
	repository(owner: $owner, name: $name) {
		pullRequests(headRefName: $head, states: [OPEN], first: 5) {
			nodes { ...StackLayer }
		}
	}
}
${STACK_LAYER_FRAGMENT}`;

/** Open PRs targeting `$base`: the layers built on a head branch. */
export const OPEN_BY_BASE_QUERY = `
query($owner: String!, $name: String!, $base: String!) {
	repository(owner: $owner, name: $name) {
		pullRequests(
			baseRefName: $base, states: [OPEN], first: 10,
			orderBy: { field: UPDATED_AT, direction: DESC }
		) {
			nodes { ...StackLayer }
		}
	}
}
${STACK_LAYER_FRAGMENT}`;

/** Recently merged PRs into the trunk: candidates for a layer that landed. */
export const MERGED_INTO_QUERY = `
query($owner: String!, $name: String!, $base: String!) {
	repository(owner: $owner, name: $name) {
		pullRequests(
			baseRefName: $base, states: [MERGED], first: 30,
			orderBy: { field: UPDATED_AT, direction: DESC }
		) {
			nodes { number title url headRefName headRefOid baseRefName mergedAt }
		}
	}
}`;

export type StackGraphqlRunner = (
	query: string,
	variables: Record<string, unknown>,
) => Promise<unknown>;

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
		return (await graphql(
			buildStackRootQuery(true),
			variables,
		)) as StackRootQueryResult;
	} catch (error) {
		const partial = (error as { data?: StackRootQueryResult | null })?.data;
		if (partial?.repository?.pullRequest) return partial;
		if (isUnknownStackFieldError(error)) {
			return (await graphql(
				buildStackRootQuery(false),
				variables,
			)) as StackRootQueryResult;
		}
		throw error;
	}
}

/** The targeted lookups a chain walk needs, so tests can back them in memory. */
export interface StackChainFetchers {
	/** The open PR in this repository whose head branch is `headRefName`. */
	findOpenByHead(headRefName: string): Promise<StackPullRequestNode | null>;
	/** Open PRs in this repository based on `baseRefName`, newest first. */
	findOpenByBase(baseRefName: string): Promise<StackPullRequestNode[]>;
}

export interface StackFetchers extends StackChainFetchers {
	/** Recently merged PRs into `baseRefName`, newest first. */
	findMergedInto(baseRefName: string): Promise<MergedPullRequestNode[]>;
}

function byUpdatedDesc(a: { updatedAt: string }, b: { updatedAt: string }) {
	return b.updatedAt.localeCompare(a.updatedAt);
}

export function createStackFetchers(
	graphql: StackGraphqlRunner,
	repo: { owner: string; name: string },
): StackFetchers {
	const listNodes = async (query: string, variables: Record<string, string>) =>
		(
			(
				(await graphql(query, { ...repo, ...variables })) as
					| PullRequestListQueryResult
					| null
					| undefined
			)?.repository?.pullRequests.nodes ?? []
		).filter((node): node is StackPullRequestNode => node != null);

	return {
		async findOpenByHead(headRefName) {
			const nodes = await listNodes(OPEN_BY_HEAD_QUERY, { head: headRefName });
			// A fork can carry a branch of the same name; the stack lives here.
			return nodes.find((pr) => !pr.isCrossRepository) ?? null;
		},
		async findOpenByBase(baseRefName) {
			const nodes = await listNodes(OPEN_BY_BASE_QUERY, { base: baseRefName });
			return nodes.filter((pr) => !pr.isCrossRepository).sort(byUpdatedDesc);
		},
		async findMergedInto(baseRefName) {
			const result = (await graphql(MERGED_INTO_QUERY, {
				...repo,
				base: baseRefName,
			})) as MergedListQueryResult | null | undefined;
			return (result?.repository?.pullRequests.nodes ?? []).filter(
				(node): node is MergedPullRequestNode => node != null,
			);
		},
	};
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
		isQueued: node.mergeQueueEntry != null,
		headRefName: node.headRefName,
		baseRefName: node.baseRefName,
		mergeable:
			node.mergeable === "MERGEABLE"
				? "mergeable"
				: node.mergeable === "CONFLICTING"
					? "conflicting"
					: "unknown",
		mergeStateStatus: node.mergeStateStatus?.trim() || null,
		isCurrent,
		workspaceId: null,
	};
}

/** GitHub listed a stack this PR is in, but not all of it. */
export class IncompleteStackError extends Error {
	constructor() {
		super("GitHub returned a partial or inconsistent pull request stack.");
		this.name = "IncompleteStackError";
	}
}

/**
 * Layers from GitHub's own stack, or null when the PR isn't in one. Throws
 * when GitHub's answer does not add up (a missing entry, a gap in the
 * positions, the PR at another position than it claims): a merge planned
 * from part of a stack would land the wrong prefix.
 */
export function buildNativeStackLayers(
	pr: StackRootPullRequest | null | undefined,
): { layers: PullRequestStackLayer[]; stack: NativeStackNode } | null {
	const stack = pr?.stack;
	const entry = pr?.stackEntry;
	if (!pr || (!stack && !entry)) return null;
	if (!stack || !entry) throw new IncompleteStackError();
	const layers = stack.entries.nodes
		.flatMap((node) =>
			node?.pullRequest
				? [
						mapStackLayer(
							node.pullRequest,
							node.position,
							node.pullRequest.number === pr.number,
						),
					]
				: [],
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
	return { layers, stack };
}

/** Bounds a pathological base-branch loop (A on B on A). */
const MAX_CHAIN_LENGTH = 25;

/**
 * Walks the base-branch chain: down until a base is no open PR's head (the
 * trunk), up while an open PR builds on the head. A fork above (two PRs
 * based on the same branch) follows the most recently updated one, so the
 * chain stays linear like a native stack. The default branch is never
 * looked up as a layer.
 */
export async function walkInferredChain(
	current: StackPullRequestNode,
	fetchers: StackChainFetchers,
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

export type IsAncestor = (oid: string, ref: string) => Promise<boolean>;

/**
 * The most recently merged PR whose last commit this branch still carries
 * but the trunk does not. A merge-commit merge keeps that commit reachable
 * from the trunk, so it is skipped: the branch is merely behind.
 */
export async function findMergedLayerBelow({
	current,
	merged,
	trunkRef,
	isAncestor,
}: {
	current: { number: number; headRefName: string };
	merged: MergedPullRequestNode[];
	/** The trunk as a local ref, e.g. `origin/main`. */
	trunkRef: string;
	isAncestor: IsAncestor;
}): Promise<MergedLayerBelow | null> {
	const candidates = merged
		.filter(
			(pr) =>
				pr.number !== current.number &&
				pr.headRefName !== current.headRefName &&
				pr.headRefOid.length > 0,
		)
		.sort((a, b) => (b.mergedAt ?? "").localeCompare(a.mergedAt ?? ""));

	for (const pr of candidates) {
		if (!(await isAncestor(pr.headRefOid, "HEAD"))) continue;
		if (await isAncestor(pr.headRefOid, trunkRef)) continue;
		return {
			number: pr.number,
			title: pr.title,
			url: pr.url,
			headRefName: pr.headRefName,
			headRefOid: pr.headRefOid,
			mergedAt: pr.mergedAt,
		};
	}
	return null;
}

export interface ResolvedStackShape {
	source: "github" | "inferred";
	stackNumber: number | null;
	baseRefName: string;
	layers: PullRequestStackLayer[];
	/**
	 * True when the layer directly under the current one is absent or already
	 * merged: the only case where a merged PR could be hiding in this
	 * branch's history, so the ancestry probe is worth its git calls.
	 */
	probeMergedBelow: boolean;
}

/**
 * Picks the source and shapes the layers: GitHub's stack when the PR is in
 * one, otherwise the chain walked through targeted lookups. A single-layer
 * result is still returned so the caller can probe beneath it.
 */
export async function resolveStackShape(
	root: StackRootQueryResult,
	currentNumber: number,
	fetchers: StackChainFetchers,
): Promise<ResolvedStackShape | null> {
	const repository = root.repository;
	const pr = repository?.pullRequest;
	if (!repository || !pr || pr.number !== currentNumber) return null;

	const native = buildNativeStackLayers(pr);
	if (native) {
		const currentIndex = native.layers.findIndex((layer) => layer.isCurrent);
		const under = native.layers[currentIndex - 1];
		return {
			source: "github",
			stackNumber: native.stack.number,
			baseRefName: native.stack.baseRefName,
			layers: native.layers,
			probeMergedBelow: under == null || under.state === "merged",
		};
	}

	const chain = await walkInferredChain(pr, fetchers, {
		defaultBranch: repository.defaultBranchRef?.name ?? null,
	});
	const layers = chain.map((node, index) =>
		mapStackLayer(node, index + 1, node.number === pr.number),
	);
	const currentIndex = layers.findIndex((layer) => layer.isCurrent);
	return {
		source: "inferred",
		stackNumber: null,
		baseRefName: chain[0]?.baseRefName ?? pr.baseRefName,
		layers,
		probeMergedBelow: currentIndex === 0,
	};
}

/**
 * Final shape for the client. A lone PR with nothing merged beneath it is not
 * a stack; a lone PR whose lower layer already landed is a two-layer stack
 * with the merged layer synthesised at the bottom, since GitHub no longer
 * links the two.
 */
export function assemblePullRequestStack(
	shape: ResolvedStackShape,
	mergedBelow: MergedLayerBelow | null,
): PullRequestStack | null {
	let layers = shape.layers;
	if (
		mergedBelow &&
		shape.source === "inferred" &&
		!layers.some((layer) => layer.number === mergedBelow.number)
	) {
		const synthesized: PullRequestStackLayer = {
			position: 1,
			number: mergedBelow.number,
			title: mergedBelow.title,
			url: mergedBelow.url,
			state: "merged",
			isDraft: false,
			isQueued: false,
			headRefName: mergedBelow.headRefName,
			baseRefName: shape.baseRefName,
			mergeable: "unknown",
			mergeStateStatus: null,
			isCurrent: false,
			workspaceId: null,
		};
		layers = [
			synthesized,
			...layers.map((layer) => ({ ...layer, position: layer.position + 1 })),
		];
	}
	if (layers.length < 2) return null;
	const current = layers.find((layer) => layer.isCurrent);
	if (!current) return null;
	return {
		source: shape.source,
		stackNumber: shape.stackNumber,
		baseRefName: shape.baseRefName,
		layers,
		currentPosition: current.position,
		mergedBelow,
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
