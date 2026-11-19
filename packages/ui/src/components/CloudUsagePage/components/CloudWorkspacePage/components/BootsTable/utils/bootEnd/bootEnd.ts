import type { CloudBoot } from "../../../../../../types";

type EndReason = NonNullable<CloudBoot["endReason"]>;

/** How a boot ended, or null when nothing recorded it (no reason, or `unknown`). */
export function bootEnd(boot: {
	stoppedAt: Date | null;
	endReason: EndReason | null;
}): "running" | Exclude<EndReason, "unknown"> | null {
	if (boot.stoppedAt === null) return "running";
	if (boot.endReason === null || boot.endReason === "unknown") return null;
	return boot.endReason;
}
