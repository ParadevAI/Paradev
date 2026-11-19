import type { CloudBoot } from "../../../../../../types";

type EndReason = NonNullable<CloudBoot["endReason"]>;

/** How a boot ended, running while it has neither a stop nor a reason, or null when nothing recorded it. */
export function bootEnd(boot: {
	stoppedAt: Date | null;
	endReason: EndReason | null;
}): "running" | Exclude<EndReason, "unknown"> | null {
	const known =
		boot.endReason === null || boot.endReason === "unknown"
			? null
			: boot.endReason;
	return known ?? (boot.stoppedAt === null ? "running" : null);
}
