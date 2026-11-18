export type TerminalAttention = "working" | "permission" | "failed" | "review";

// Desktop's STATUS_PRIORITY: a live permission prompt is actionable right
// now; a failure is terminal; review is the least urgent.
export const ATTENTION_PRIORITY: Record<TerminalAttention, number> = {
	review: 1,
	working: 2,
	failed: 3,
	permission: 4,
};
