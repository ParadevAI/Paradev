import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { WorkspaceRef } from "./types";

export const STATUS_LABELS: Record<WorkspaceRef["status"], MessageDescriptor> =
	{
		provisioning: msg({
			message: "Starting",
			context: "cloud workspace status",
		}),
		ready: msg({ message: "Ready", context: "cloud workspace status" }),
		failed: msg({ message: "Failed", context: "cloud workspace status" }),
		deleted: msg({ message: "Deleted", context: "cloud workspace status" }),
		awake: msg({ message: "Running", context: "cloud workspace status" }),
		asleep: msg({ message: "Asleep", context: "cloud workspace status" }),
		archived: msg({ message: "Archived", context: "cloud workspace status" }),
	};

export const FAILURE_REASONS: Record<
	NonNullable<WorkspaceRef["failure"]>["reason"],
	MessageDescriptor
> = {
	usage_limit: msg({ message: "The organization reached its usage limit." }),
	needs_paid_plan: msg({ message: "Cloud workspaces need a paid plan." }),
	host_not_ready: msg({ message: "The workspace did not become ready." }),
	create_failed: msg({ message: "The workspace could not be created." }),
	queue_failed: msg({ message: "The workspace could not be queued to start." }),
	sandbox_gone: msg({ message: "Its machine no longer exists." }),
	snapshot_expired: msg({ message: "Its saved state expired." }),
};
