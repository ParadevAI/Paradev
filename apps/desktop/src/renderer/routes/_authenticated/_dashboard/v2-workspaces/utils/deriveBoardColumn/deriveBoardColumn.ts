import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	AccessibleV2Workspace,
	V2WorkspacePrState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

export type BoardColumnKey =
	| "idle"
	| "working"
	| "attention"
	| "finished"
	| "review"
	| "merged"
	| "deleted";

/** Fixed Linear-style workflow order — never user-reorderable. */
export const BOARD_COLUMN_ORDER: BoardColumnKey[] = [
	"idle",
	"working",
	"attention",
	"finished",
	"review",
	"merged",
	"deleted",
];

export const BOARD_COLUMN_LABELS: Record<BoardColumnKey, MessageDescriptor> = {
	idle: msg({ message: "Idle" }),
	working: msg({
		message: "Working",
	}),
	attention: msg({
		message: "Needs attention",
	}),
	finished: msg({
		message: "Finished · unread",
	}),
	review: msg({
		message: "In review",
	}),
	merged: msg({
		message: "Merged",
	}),
	deleted: msg({
		message: "Deleted",
	}),
};

type BoardColumnInputs = Pick<
	AccessibleV2Workspace,
	"archivedAt" | "archiveReason" | "agentStatus" | "type"
> & {
	pr: { state: V2WorkspacePrState } | null;
	sandboxStatus?: AccessibleV2Workspace["sandboxStatus"];
};

/**
 * Column derivation, first match wins:
 *   1. archived "deleted"                → Deleted
 *   2. archived "merged"                 → Merged
 *   3. live PR merged                    → Merged
 *   4. sandbox failed                    → Needs attention
 *   5. agent permission/failed           → Needs attention
 *   6. sandbox provisioning              → Working
 *   7. agent working                     → Working
 *   8. agent review on a main/worktree   → Finished · unread
 *   9. PR open/draft/queued              → In review
 *  10. otherwise                         → Idle
 *
 * A finished agent is unread until the row is opened, which is what makes
 * "Finished" clearable; the PR then files the row under "In review", which
 * waits on other people. Only session workspaces (automation and chat runs
 * with no project checkout) skip Finished: they arrive in volume, and
 * routing them there buries the real candidates.
 */
export function deriveBoardColumn(
	workspace: BoardColumnInputs,
): BoardColumnKey {
	if (workspace.archivedAt != null) {
		return workspace.archiveReason === "merged" ? "merged" : "deleted";
	}
	if (workspace.pr?.state === "merged") return "merged";
	if (
		workspace.sandboxStatus === "failed" ||
		workspace.agentStatus === "permission" ||
		workspace.agentStatus === "failed"
	) {
		return "attention";
	}
	if (
		workspace.sandboxStatus === "provisioning" ||
		workspace.agentStatus === "working"
	) {
		return "working";
	}
	if (workspace.agentStatus === "review" && workspace.type !== "session") {
		return "finished";
	}
	if (
		workspace.pr?.state === "open" ||
		workspace.pr?.state === "draft" ||
		workspace.pr?.state === "queued"
	) {
		return "review";
	}
	return "idle";
}
