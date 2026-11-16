import { expect, test } from "bun:test";
import { fromBootstrap } from "../from-api/from-api.ts";
import { sendOptimistic } from "../optimistic/optimistic.ts";
import { bootstrap } from "../test-fixtures/test-fixtures.ts";
import { syncStoreReducer } from "./sync-store.ts";

const fresh = fromBootstrap(bootstrap());

test("a change before the first bootstrap is dropped; the bootstrap becomes the state", () => {
	expect(
		syncStoreReducer(null, { type: "update", change: () => fresh }),
	).toBeNull();
	expect(
		syncStoreReducer(null, {
			type: "refresh",
			fresh,
			confirmedClientIds: new Set(),
		}),
	).toBe(fresh);
});

test("a later bootstrap keeps a message the server hasn't confirmed", () => {
	const local = syncStoreReducer(fresh, {
		type: "update",
		change: (s) =>
			sendOptimistic(s, {
				chatId: "g-me",
				text: "hi",
				clientId: "local-1",
				now: new Date("2026-10-12T09:00:00Z"),
			}),
	})!;
	const next = syncStoreReducer(local, {
		type: "refresh",
		fresh,
		confirmedClientIds: new Set(),
	})!;
	expect(next.messages.some((m) => m.text === "hi")).toBe(true);
});
