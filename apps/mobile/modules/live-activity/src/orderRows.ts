import type { AgentRow } from "./LiveActivity.types";

/**
 * Row order for the card, most urgent first.
 *
 * Deliberately NOT desktop's `STATUS_PRIORITY`, which ranks `working` above
 * `review`. On a glanceable card the question is "what wants me?", and a
 * finished session waiting to be read wants you more than a busy one that
 * does not. Rows are sorted by this, then by recency.
 */
export const CARD_PRIORITY: Record<AgentRow["state"], number> = {
	permission: 4,
	failed: 3,
	review: 2,
	working: 1,
};

export function orderRows(rows: AgentRow[]): AgentRow[] {
	return [...rows].sort(
		(a, b) => CARD_PRIORITY[b.state] - CARD_PRIORITY[a.state],
	);
}
