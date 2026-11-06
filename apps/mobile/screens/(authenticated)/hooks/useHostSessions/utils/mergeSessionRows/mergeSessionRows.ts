import type {
	TerminalAttention,
	TerminalRowData,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";

// Desktop's STATUS_PRIORITY: a live permission prompt is actionable right
// now; a failure is terminal; review is the least urgent.
const ATTENTION_PRIORITY: Record<TerminalAttention, number> = {
	review: 1,
	working: 2,
	failed: 3,
	permission: 4,
};

export interface MergedSessionRows {
	rowsByWorkspace: Map<string, TerminalRowData[]>;
	/** Per-workspace attention rollup by desktop's status priority. */
	attentionByWorkspace: Map<string, TerminalAttention>;
}

/** Terminals and chats per workspace, newest activity first. */
export function mergeSessionRows(
	...sources: ReadonlyMap<string, TerminalRowData[]>[]
): MergedSessionRows {
	const rowsByWorkspace = new Map<string, TerminalRowData[]>();
	for (const source of sources) {
		for (const [workspaceId, rows] of source) {
			const group = rowsByWorkspace.get(workspaceId);
			if (group) group.push(...rows);
			else rowsByWorkspace.set(workspaceId, [...rows]);
		}
	}

	const attentionByWorkspace = new Map<string, TerminalAttention>();
	for (const [workspaceId, rows] of rowsByWorkspace) {
		rows.sort((a, b) => b.ts - a.ts);
		let top: TerminalAttention | null = null;
		for (const { attention } of rows) {
			if (
				attention &&
				(!top || ATTENTION_PRIORITY[attention] > ATTENTION_PRIORITY[top])
			) {
				top = attention;
			}
		}
		if (top) attentionByWorkspace.set(workspaceId, top);
	}
	return { rowsByWorkspace, attentionByWorkspace };
}
