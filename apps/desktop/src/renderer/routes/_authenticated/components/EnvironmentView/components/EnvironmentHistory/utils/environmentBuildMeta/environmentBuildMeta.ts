import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	BUILD_ERRORS,
	BUILD_LIMIT_MINUTES,
} from "@superset/shared/sandbox/build-errors";
import type { RouterOutputs } from "@superset/trpc";

export type EnvironmentBuild =
	RouterOutputs["environment"]["builds"]["builds"][number];

/** Anything a person started reads as Manual; only the daily job is Daily. */
export const BUILD_TRIGGER_LABELS: Record<
	EnvironmentBuild["trigger"],
	MessageDescriptor
> = {
	manual: msg({ message: "Manual" }),
	daily: msg({ message: "Daily" }),
	promote: msg({ message: "Manual" }),
};

export const BUILD_STATUS_LABELS: Record<
	EnvironmentBuild["status"],
	MessageDescriptor
> = {
	running: msg({ message: "Running" }),
	succeeded: msg({ message: "Success" }),
	failed: msg({ message: "Failure" }),
};

/** The fixed sentences a build fails with; any other error is command output, shown as it is. */
export const BUILD_ERROR_LABELS: Record<string, MessageDescriptor> = {
	[BUILD_ERRORS.stoppedUnexpectedly]: msg({
		message: "The build stopped unexpectedly",
	}),
	[BUILD_ERRORS.timeLimit]: msg({
		message: `The build ran for more than ${BUILD_LIMIT_MINUTES} minutes and was stopped`,
	}),
	[BUILD_ERRORS.environmentChanged]: msg({
		message:
			"The environment changed during the build; its current snapshot was kept",
	}),
	[BUILD_ERRORS.notRunning]: msg({
		message: "The build is no longer running",
	}),
};
