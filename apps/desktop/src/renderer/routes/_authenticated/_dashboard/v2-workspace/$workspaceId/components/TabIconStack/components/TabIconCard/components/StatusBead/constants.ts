import type { ActivePaneStatus } from "shared/tabs-types";

/** The sidebar's status colours, as hex so the bead can mix them into its glow and rim. */
export const STATUS_BEAD_COLORS: Record<ActivePaneStatus, string> = {
	permission: "#eab308",
	failed: "#ef4444",
	working: "#f59e0b",
	review: "#22c55e",
};

/** Statuses that need you breathe; the rest hold still. */
export const BREATHING_STATUSES: ReadonlySet<ActivePaneStatus> = new Set([
	"permission",
	"failed",
]);
