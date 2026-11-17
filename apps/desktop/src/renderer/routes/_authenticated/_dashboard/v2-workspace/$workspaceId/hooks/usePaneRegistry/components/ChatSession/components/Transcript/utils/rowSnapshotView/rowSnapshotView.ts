import {
	approvalAsker,
	displayText,
	type SessionSnapshot,
} from "@superset/chat/core";
import type { ApprovalRequest, Item, ToolCall } from "@superset/chat/protocol";
import type { TranscriptRow } from "../transcriptRows";

export type RowSnapshotView = {
	harness: string | undefined;
	/** Per item for item and footer rows, per step for tool runs. */
	texts: readonly string[];
	asker: ToolCall | undefined;
	approvalTarget: Item | undefined;
};

function approvalTarget(
	snapshot: SessionSnapshot,
	item: Item,
): Item | undefined {
	if (item.kind !== "approval_request") return undefined;
	const targetId = (item as ApprovalRequest).targetItemId;
	return targetId ? snapshot.items.get(targetId)?.item : undefined;
}

export function rowSnapshotView(
	row: TranscriptRow,
	snapshot: SessionSnapshot,
): RowSnapshotView {
	const harness = snapshot.session?.harness;
	switch (row.kind) {
		case "item":
			return {
				harness,
				texts: [displayText(snapshot, row.item.id)],
				asker: approvalAsker(snapshot.items, row.item),
				approvalTarget: approvalTarget(snapshot, row.item),
			};
		case "reply_footer":
			return {
				harness,
				texts: [displayText(snapshot, row.item.id)],
				asker: undefined,
				approvalTarget: undefined,
			};
		case "tool_run":
			return {
				harness,
				texts: row.steps.map((step) =>
					step.kind === "reasoning" ? displayText(snapshot, step.id) : "",
				),
				asker: undefined,
				approvalTarget: undefined,
			};
		default:
			return {
				harness,
				texts: [],
				asker: undefined,
				approvalTarget: undefined,
			};
	}
}
