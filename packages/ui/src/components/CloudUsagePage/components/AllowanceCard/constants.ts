import type { HeldLine } from "@superset/shared/cloud-usage-display";

/** The design's ramp: free amounts in greys, paid ones in a warm tone, past the allowance strongest. */
export const SEGMENT_COLORS: Record<HeldLine["kind"] | "over", string> = {
	included: "bg-foreground/60",
	freeCredits: "bg-foreground/35",
	bought: "bg-warning/55",
	over: "bg-warning",
};
