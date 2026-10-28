import { describe, expect, test } from "bun:test";
import {
	finishedRequests,
	isFirstSyncPending,
	SYNC_GIVE_UP_MS,
} from "./usePendingSourceSyncs";

const T0 = Date.parse("2026-10-28T00:00:00Z");
const row = (
	overrides: Partial<Parameters<typeof isFirstSyncPending>[0]> = {},
) => ({
	id: "s",
	syncedAt: null,
	syncError: null,
	createdAt: new Date(T0),
	updatedAt: new Date(T0),
	...overrides,
});

describe("isFirstSyncPending", () => {
	test("a new source with no sync and no error is pending until the time limit", () => {
		expect(isFirstSyncPending(row(), T0 + 1_000)).toBe(true);
		expect(isFirstSyncPending(row(), T0 + SYNC_GIVE_UP_MS + 1)).toBe(false);
	});

	test("a synced or failed source is not pending", () => {
		expect(isFirstSyncPending(row({ syncedAt: new Date(T0) }), T0)).toBe(false);
		expect(isFirstSyncPending(row({ syncError: "no access" }), T0)).toBe(false);
	});
});

describe("finishedRequests", () => {
	const requested = { s: { updatedAt: T0, at: T0 } };

	test("a request is done when its row is written again", () => {
		expect(
			finishedRequests(requested, [row({ updatedAt: new Date(T0 + 1) })], T0),
		).toEqual(["s"]);
	});

	test("an unchanged row stays pending until the time limit, then ends", () => {
		expect(finishedRequests(requested, [row()], T0 + 1_000)).toEqual([]);
		expect(
			finishedRequests(requested, [row()], T0 + SYNC_GIVE_UP_MS + 1),
		).toEqual(["s"]);
	});

	test("a removed source ends its request", () => {
		expect(finishedRequests(requested, [], T0)).toEqual(["s"]);
	});
});
