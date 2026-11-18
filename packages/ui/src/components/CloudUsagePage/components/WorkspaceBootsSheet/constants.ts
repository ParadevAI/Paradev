import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { bootEnd } from "./utils/bootEnd";

export const END_REASONS: Record<
	NonNullable<ReturnType<typeof bootEnd>>,
	MessageDescriptor
> = {
	running: msg({ message: "Running" }),
	idle: msg({ message: "Stopped when idle" }),
	user: msg({ message: "Stopped by a person" }),
	usage_limit: msg({ message: "Usage limit reached" }),
	archived: msg({ message: "Archived", context: "cloud workspace status" }),
	restarted: msg({ message: "Restarted" }),
	failed: msg({ message: "Could not start" }),
	released: msg({ message: "Released before use" }),
	crashed: msg({ message: "Crashed" }),
};
