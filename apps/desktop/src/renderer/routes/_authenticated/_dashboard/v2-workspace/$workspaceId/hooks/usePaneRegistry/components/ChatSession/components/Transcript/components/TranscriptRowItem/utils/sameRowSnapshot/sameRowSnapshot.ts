import { displayText, type SessionSnapshot } from "@superset/chat/core";
import type { TranscriptRow } from "../../../../utils/transcriptRows";

function textItemIds(row: TranscriptRow): string[] {
	switch (row.kind) {
		case "item":
		case "reply_footer":
			return [row.item.id];
		case "tool_run":
			return row.steps
				.filter((step) => step.kind === "reasoning")
				.map((step) => step.id);
		default:
			return [];
	}
}

/** Mirrors what `TurnGroupSection` reads from the snapshot for `row`. */
export function sameRowSnapshot(
	row: TranscriptRow,
	previous: SessionSnapshot,
	next: SessionSnapshot,
): boolean {
	if (previous === next) return true;
	if (previous.session?.harness !== next.session?.harness) return false;
	if (
		row.kind === "item" &&
		row.item.kind === "approval_request" &&
		previous.items !== next.items
	)
		return false;
	return textItemIds(row).every(
		(id) => displayText(previous, id) === displayText(next, id),
	);
}
