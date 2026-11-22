import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import type { HomeListItem } from "../../types";

export type NeedsMeBucket = "input" | "review" | "working";

/** Needs input includes failures: both wait on you before anything moves. */
export function needsMeBucket(
	attention: TerminalAttention | null | undefined,
): NeedsMeBucket | null {
	switch (attention) {
		case "permission":
		case "failed":
			return "input";
		case "review":
			return "review";
		case "working":
			return "working";
		default:
			return null;
	}
}

export interface AttentionCounts {
	input: number;
	review: number;
	working: number;
}

export function countAttention(
	attentions: Iterable<TerminalAttention | null | undefined>,
): AttentionCounts {
	const counts: AttentionCounts = { input: 0, review: 0, working: 0 };
	for (const attention of attentions) {
		const bucket = needsMeBucket(attention);
		if (bucket) counts[bucket] += 1;
	}
	return counts;
}

/** Working is listed under Needs me but is not something you need to do. */
export function needsMeCount(counts: AttentionCounts): number {
	return counts.input + counts.review;
}

export interface NeedsMeCandidate {
	item: Extract<HomeListItem, { kind: "workspace" | "cloudRow" }>;
	attention: TerminalAttention | null | undefined;
	/** Newest first inside each section. */
	ts: number;
}

const BUCKET_ORDER: NeedsMeBucket[] = ["input", "review", "working"];

/** A flat list under small section labels: Needs input, Ready for review, Working. */
export function buildNeedsMeList(
	candidates: readonly NeedsMeCandidate[],
	labels: Record<NeedsMeBucket, string>,
): HomeListItem[] {
	const buckets = new Map<NeedsMeBucket, NeedsMeCandidate[]>();
	for (const candidate of candidates) {
		const bucket = needsMeBucket(candidate.attention);
		if (!bucket) continue;
		const list = buckets.get(bucket);
		if (list) list.push(candidate);
		else buckets.set(bucket, [candidate]);
	}
	return BUCKET_ORDER.flatMap((bucket): HomeListItem[] => {
		const list = buckets.get(bucket);
		if (!list) return [];
		return [
			{
				kind: "periodHeader",
				key: `needs-me:${bucket}`,
				label: labels[bucket],
			},
			...[...list]
				.sort((a, b) => (b.ts || 0) - (a.ts || 0))
				.map((candidate) => candidate.item),
		];
	});
}

/** A cloud row's attention, read the way its row marks it. */
export function cloudRowAttention(
	row: {
		status: string;
		agentStatus: string | null;
		agentStatusAt: Date | null;
	},
	readAt: number | undefined,
	manuallyUnread: boolean,
): TerminalAttention | null {
	if (row.status === "failed" || row.agentStatus === "failed") return "failed";
	if (row.agentStatus === "permission") return "permission";
	if (row.agentStatus === "working") return "working";
	const isRead =
		!manuallyUnread &&
		(row.agentStatusAt === null ||
			(readAt ?? 0) >= row.agentStatusAt.getTime());
	if (manuallyUnread || (row.agentStatus === "review" && !isRead)) {
		return "review";
	}
	return null;
}
