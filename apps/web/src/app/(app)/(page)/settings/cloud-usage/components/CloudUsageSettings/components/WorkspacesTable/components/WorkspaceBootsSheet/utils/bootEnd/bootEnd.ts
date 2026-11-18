import type { CloudWorkspaceBootEndReason } from "@superset/db/enums";

/** How a boot ended, or null when nothing recorded it (no reason, or `unknown`). */
export function bootEnd(boot: {
	stoppedAt: Date | null;
	endReason: CloudWorkspaceBootEndReason | null;
}): "running" | Exclude<CloudWorkspaceBootEndReason, "unknown"> | null {
	if (boot.stoppedAt === null) return "running";
	if (boot.endReason === null || boot.endReason === "unknown") return null;
	return boot.endReason;
}
