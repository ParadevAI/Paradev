import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { PillTone } from "../../../../constants";
import type { bootEnd } from "./utils/bootEnd";

export const END_PILLS: Record<
	NonNullable<ReturnType<typeof bootEnd>>,
	{ label: MessageDescriptor; tone: PillTone }
> = {
	running: {
		label: msg({ message: "Running", context: "cloud workspace boot" }),
		tone: "ok",
	},
	idle: {
		label: msg({ message: "Idle", context: "cloud workspace boot" }),
		tone: "idle",
	},
	user: {
		label: msg({ message: "Stopped", context: "cloud workspace boot" }),
		tone: "idle",
	},
	usage_limit: { label: msg({ message: "Usage limit" }), tone: "warn" },
	archived: {
		label: msg({ message: "Archived", context: "cloud workspace status" }),
		tone: "idle",
	},
	restarted: { label: msg({ message: "Restarted" }), tone: "idle" },
	failed: { label: msg({ message: "Could not start" }), tone: "bad" },
	released: { label: msg({ message: "Released before use" }), tone: "idle" },
	crashed: { label: msg({ message: "Crashed" }), tone: "bad" },
};
