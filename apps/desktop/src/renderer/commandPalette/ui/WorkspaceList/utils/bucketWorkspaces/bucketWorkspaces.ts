import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { compareWorkspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";
import { scoreText } from "../../../../core/rankCommands";

export type SwitcherBucket = "needsInput" | "completed" | "running" | "recent";

export const BUCKET_ORDER: SwitcherBucket[] = [
	"needsInput",
	"completed",
	"running",
	"recent",
];

type BucketInputs = Pick<
	AccessibleV2Workspace,
	| "id"
	| "name"
	| "branch"
	| "projectName"
	| "hostName"
	| "agentStatus"
	| "lastAgentEventAt"
	| "createdAt"
> & { pr: { prNumber: number; title: string } | null };

export interface SwitcherRow<T extends BucketInputs> {
	workspace: T;
	bucket: SwitcherBucket;
	isCurrent: boolean;
}

export interface SwitcherGroup<T extends BucketInputs> {
	bucket: SwitcherBucket;
	rows: SwitcherRow<T>[];
}

export function bucketOf(
	agentStatus: BucketInputs["agentStatus"],
): SwitcherBucket {
	switch (agentStatus) {
		case "permission":
			return "needsInput";
		case "review":
		case "failed":
			return "completed";
		case "working":
			return "running";
		default:
			return "recent";
	}
}

/** The current workspace leads "recent" whatever its status: you are already there. */
export function bucketWorkspaces<T extends BucketInputs>(
	workspaces: T[],
	currentId: string | null,
): SwitcherGroup<T>[] {
	const byBucket = new Map<SwitcherBucket, SwitcherRow<T>[]>();
	let current: SwitcherRow<T> | null = null;
	for (const workspace of [...workspaces].sort(compareWorkspaces)) {
		if (workspace.id === currentId) {
			current = { workspace, bucket: "recent", isCurrent: true };
			continue;
		}
		const bucket = bucketOf(workspace.agentStatus);
		const rows = byBucket.get(bucket) ?? [];
		rows.push({ workspace, bucket, isCurrent: false });
		byBucket.set(bucket, rows);
	}
	if (current) {
		byBucket.set("recent", [current, ...(byBucket.get("recent") ?? [])]);
	}
	return BUCKET_ORDER.flatMap((bucket) => {
		const rows = byBucket.get(bucket);
		return rows && rows.length > 0 ? [{ bucket, rows }] : [];
	});
}

function searchable(workspace: BucketInputs) {
	return {
		title: workspace.name,
		keywords: [
			workspace.branch,
			workspace.projectName ?? "",
			workspace.hostName,
			workspace.pr?.title ?? "",
			workspace.pr ? `#${workspace.pr.prNumber}` : "",
		].filter(Boolean),
	};
}

export function rankSwitcherRows<T extends BucketInputs>(
	groups: SwitcherGroup<T>[],
	query: string,
): SwitcherRow<T>[] {
	if (!query.trim()) return groups.flatMap((group) => group.rows);
	const scored: { row: SwitcherRow<T>; score: number; order: number }[] = [];
	let order = 0;
	for (const group of groups) {
		for (const row of group.rows) {
			const score = scoreText(searchable(row.workspace), query);
			if (score > 0) scored.push({ row, score, order });
			order += 1;
		}
	}
	return scored
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.map((entry) => entry.row);
}

export function switcherRowScore<T extends BucketInputs>(
	row: SwitcherRow<T>,
	query: string,
): number {
	return scoreText(searchable(row.workspace), query);
}
