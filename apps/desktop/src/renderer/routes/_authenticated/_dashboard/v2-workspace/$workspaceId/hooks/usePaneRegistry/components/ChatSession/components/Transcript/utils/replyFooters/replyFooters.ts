import type { AgentMessage } from "@superset/chat/protocol";
import type { TranscriptRow } from "../transcriptRows";

type ItemRow = Extract<TranscriptRow, { kind: "item" }>;

/**
 * Places each settled turn's reply footer: under its last reply when that
 * reply ends the turn, else in a `reply_footer` row after the turn's last row.
 */
export function replyFooters(rows: readonly TranscriptRow[]): {
	rows: TranscriptRow[];
	inlineReplyKeys: Set<string>;
} {
	const placed: TranscriptRow[] = [];
	const inlineReplyKeys = new Set<string>();
	let reply: ItemRow | null = null;
	let turnRunning = false;
	const endTurn = () => {
		if (reply && !turnRunning && reply.item.completedAtMs !== undefined) {
			if (placed.at(-1) === reply) {
				inlineReplyKeys.add(reply.key);
			} else {
				placed.push({
					kind: "reply_footer",
					key: `reply_footer:${reply.key}`,
					groupStart: false,
					item: reply.item as AgentMessage,
				});
			}
		}
		reply = null;
		turnRunning = false;
	};
	for (const row of rows) {
		if (row.groupStart) endTurn();
		placed.push(row);
		if (row.kind === "working") turnRunning = row.running;
		if (row.kind === "item" && row.item.kind === "agent_message") reply = row;
	}
	endTurn();
	return { rows: placed, inlineReplyKeys };
}
