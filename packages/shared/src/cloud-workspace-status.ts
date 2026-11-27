import { z } from "zod";

export const cloudWorkspaceStatusValues = [
	"provisioning",
	"ready",
	"failed",
	"deleted",
	"awake",
	"asleep",
	"archived",
] as const;
export const cloudWorkspaceStatusEnum = z.enum(cloudWorkspaceStatusValues);
export type CloudWorkspaceStatus = z.infer<typeof cloudWorkspaceStatusEnum>;

export const cloudWorkspaceBootEndReasonValues = [
	"idle",
	"user",
	"usage_limit",
	"archived",
	"restarted",
	"failed",
	"released",
	"crashed",
	"unknown",
] as const;
export const cloudWorkspaceBootEndReasonEnum = z.enum(
	cloudWorkspaceBootEndReasonValues,
);
export type CloudWorkspaceBootEndReason = z.infer<
	typeof cloudWorkspaceBootEndReasonEnum
>;

export const cloudWorkspaceFailureReasonValues = [
	"usage_limit",
	"needs_paid_plan",
	"host_not_ready",
	"create_failed",
	"queue_failed",
	"sandbox_gone",
	"snapshot_expired",
] as const;
export const cloudWorkspaceFailureReasonEnum = z.enum(
	cloudWorkspaceFailureReasonValues,
);
export type CloudWorkspaceFailureReason = z.infer<
	typeof cloudWorkspaceFailureReasonEnum
>;

export function isAwakeCloudWorkspaceStatus(
	status: string | null | undefined,
): boolean {
	return status === "awake" || status === "ready";
}

export function isArchivedCloudWorkspaceStatus(
	status: string | null | undefined,
): boolean {
	return status === "archived" || status === "deleted";
}

/** Provisioned, and not failed or archived: awake or asleep, it can be used and opened. */
export function isLiveCloudWorkspaceStatus(status: string): boolean {
	return isAwakeCloudWorkspaceStatus(status) || status === "asleep";
}
