import { describe, expect, test } from "bun:test";
import { isFirstSyncPending } from "./usePendingSourceSyncs";

describe("isFirstSyncPending", () => {
	const row = (syncedAt: string | null, syncError: string | null) => ({
		id: "s",
		syncedAt,
		syncError,
		updatedAt: "2026-10-28T00:00:00Z",
	});

	test("a source with no sync and no error is still on its first sync", () => {
		expect(isFirstSyncPending(row(null, null))).toBe(true);
	});

	test("a synced or failed source is not pending", () => {
		expect(isFirstSyncPending(row("2026-10-28T00:00:00Z", null))).toBe(false);
		expect(isFirstSyncPending(row(null, "no access"))).toBe(false);
	});
});
