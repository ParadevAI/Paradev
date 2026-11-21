import { describe, expect, it } from "bun:test";
import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";
import { selectPendingInserts } from "./selectPendingInserts";

function snapshot(
	workspaceId: string,
	type: WorkspaceTransactionSnapshot["type"],
): WorkspaceTransactionSnapshot {
	const at = new Date("2026-01-01T00:00:00.000Z");
	return {
		id: `tx-${workspaceId}`,
		workspaceId,
		type,
		state: "persisting",
		createdAt: at,
		updatedAt: at,
	};
}

describe("selectPendingInserts", () => {
	it("keeps only inserts, by reference", () => {
		const insert = snapshot("a", "insert");
		const selected = selectPendingInserts({
			a: insert,
			b: snapshot("b", "update"),
			c: snapshot("c", "delete"),
		});
		expect(selected).toEqual({ a: insert });
		expect(selected.a).toBe(insert);
	});
});
