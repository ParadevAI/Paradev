import type { SessionSnapshot } from "@superset/chat/core";
import { rowSnapshotView } from "../../../../utils/rowSnapshotView";
import type { TranscriptRow } from "../../../../utils/transcriptRows";

export function sameRowSnapshot(
	row: TranscriptRow,
	previous: SessionSnapshot,
	next: SessionSnapshot,
): boolean {
	if (previous === next) return true;
	const before = rowSnapshotView(row, previous);
	const after = rowSnapshotView(row, next);
	return (
		before.harness === after.harness &&
		before.asker === after.asker &&
		before.approvalTarget === after.approvalTarget &&
		before.texts.length === after.texts.length &&
		before.texts.every((text, index) => text === after.texts[index])
	);
}
