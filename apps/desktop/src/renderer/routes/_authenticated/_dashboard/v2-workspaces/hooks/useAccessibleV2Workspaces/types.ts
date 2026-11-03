import type { CheckItem } from "@superset/local-db";
import type { PaneStatus } from "shared/tabs-types";

export type V2WorkspaceHostType = "local-device" | "remote-device" | "cloud";

/** Host vocabulary — includes merge-queue, unlike the old cloud join. */
export type V2WorkspacePrState =
	| "open"
	| "merged"
	| "closed"
	| "draft"
	| "queued";

export type V2WorkspacePrReviewDecision =
	| "approved"
	| "changes_requested"
	| "pending";

export type V2WorkspacePrChecksStatus =
	| "none"
	| "pending"
	| "success"
	| "failure";

export interface V2WorkspacePrSummary {
	prNumber: number;
	title: string;
	url: string;
	state: V2WorkspacePrState;
	checksStatus: V2WorkspacePrChecksStatus;
	reviewDecision: V2WorkspacePrReviewDecision;
	checks: CheckItem[];
	/** First observed merged (epoch ms); null unless merged. */
	mergedAt: number | null;
}

export interface V2WorkspaceDiffStats {
	additions: number;
	deletions: number;
	fileCount: number;
}

/** What opening the row marks as seen, so a finished-unread row clears. */
export interface V2WorkspaceSeenMarks {
	/** Host terminals with an agent binding, by their last event (host clock). */
	terminals: Array<{ terminalId: string; lastEventAt: number }>;
	/** When the cloud reported the status (its clock); null for host rows. */
	reportedAt: number | null;
}

export interface AccessibleV2Workspace {
	id: string;
	name: string;
	branch: string;
	type: "local" | "worktree" | "session";
	createdAt: Date;
	createdByUserId: string | null;
	createdByName: string | null;
	createdByImage: string | null;
	isCreatedByCurrentUser: boolean;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	/** Null for project-less "session" workspaces. */
	projectName: string | null;
	projectIconUrl: string | null;
	/** The cloud workspace's own id for a cloud row. */
	hostId: string;
	hostName: string;
	hostIsOnline: boolean;
	hostType: V2WorkspaceHostType;
	isInSidebar: boolean;
	pr: V2WorkspacePrSummary | null;
	/**
	 * Highest-priority live agent status across the workspace's terminals;
	 * `review` means finished and not yet looked at.
	 */
	agentStatus: PaneStatus;
	/** Most recent agent event across the workspace's terminals (epoch ms);
	 * null when no agent has ever run here. */
	lastAgentEventAt: number | null;
	/** Working-tree + against-base churn; null until the host answers. */
	diffStats: V2WorkspaceDiffStats | null;
	/** A cloud sandbox still being made, or one that failed; null otherwise. */
	sandboxStatus: "provisioning" | "failed" | null;
	seenMarks: V2WorkspaceSeenMarks;
	/** Non-null = archived tombstone (soft-deleted workspace). */
	archivedAt: number | null;
	archiveReason: "merged" | "deleted" | null;
}

export interface V2WorkspaceHostOption {
	hostId: string;
	hostName: string;
	isOnline: boolean;
	isLocal: boolean;
}

export interface V2WorkspaceProjectOption {
	projectId: string;
	projectName: string;
	iconUrl: string | null;
	count: number;
}

export interface V2WorkspaceCreatorOption {
	userId: string;
	name: string;
	image: string | null;
	isCurrentUser: boolean;
	count: number;
}
