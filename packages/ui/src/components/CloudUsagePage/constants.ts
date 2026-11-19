import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { WorkspaceRef } from "./types";

export type Tone = "ok" | "warn" | "bad" | "idle";

export const STATUS_BADGES: Record<
	WorkspaceRef["status"],
	{ label: MessageDescriptor; tone: Tone }
> = {
	provisioning: {
		label: msg({ message: "Provisioning", context: "cloud workspace status" }),
		tone: "warn",
	},
	ready: {
		label: msg({ message: "Ready", context: "cloud workspace status" }),
		tone: "ok",
	},
	failed: {
		label: msg({ message: "Failed", context: "cloud workspace status" }),
		tone: "bad",
	},
	deleted: {
		label: msg({ message: "Deleted", context: "cloud workspace status" }),
		tone: "idle",
	},
	awake: {
		label: msg({ message: "Awake", context: "cloud workspace status" }),
		tone: "ok",
	},
	asleep: {
		label: msg({ message: "Asleep", context: "cloud workspace status" }),
		tone: "idle",
	},
	archived: {
		label: msg({ message: "Archived", context: "cloud workspace status" }),
		tone: "idle",
	},
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
