import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RouterOutputs } from "@superset/trpc";

export type EnvironmentBuild =
	RouterOutputs["environment"]["builds"]["builds"][number];

export const BUILD_TRIGGER_LABELS: Record<
	EnvironmentBuild["trigger"],
	MessageDescriptor
> = {
	manual: msg({ message: "Manual" }),
	daily: msg({ message: "Daily" }),
	repositories: msg({ message: "Repositories changed" }),
	promote: msg({ message: "Saved from a workspace" }),
};

export const BUILD_STATUS_LABELS: Record<
	EnvironmentBuild["status"],
	MessageDescriptor
> = {
	running: msg({ message: "Running" }),
	succeeded: msg({ message: "Success" }),
	failed: msg({ message: "Failure" }),
};
