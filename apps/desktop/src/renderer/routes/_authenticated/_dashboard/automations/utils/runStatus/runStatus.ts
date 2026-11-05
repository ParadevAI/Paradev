import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { SelectAutomationRun } from "@superset/db/schema";

type RunStatus = SelectAutomationRun["status"];

export interface RunStatusMeta {
	dot: string;
	label: MessageDescriptor;
	/** Ascending order puts runs that need attention first. */
	sortRank: number;
}

export const RUN_STATUS_META: Record<RunStatus, RunStatusMeta> = {
	dispatched: {
		dot: "bg-emerald-500",
		label: msg({ message: "created" }),
		sortRank: 5,
	},
	dispatching: {
		dot: "bg-amber-500",
		label: msg({ message: "creating" }),
		sortRank: 3,
	},
	// Not a failure: the schedule came due with no host online. Amber, not
	// red, because nothing broke and retrying hours later is rarely wanted.
	skipped_offline: {
		dot: "bg-amber-500",
		label: msg({ message: "missed" }),
		sortRank: 1,
	},
	dispatch_failed: {
		dot: "bg-red-500",
		label: msg({ message: "failed" }),
		sortRank: 0,
	},
	debounced: {
		dot: "bg-slate-400",
		label: msg({ message: "superseded" }),
		sortRank: 4,
	},
	rejected: {
		dot: "bg-amber-500",
		label: msg({ message: "blocked" }),
		sortRank: 2,
	},
};
