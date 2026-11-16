import { describe, expect, test } from "bun:test";
import { fromBootstrap } from "../from-api/from-api.ts";
import { syncStoreReducer } from "../sync-store/sync-store.ts";
import { apiMessage, bootstrap } from "../test-fixtures/test-fixtures.ts";
import { stateCacheText, stateFromCache } from "./state-cache.ts";

describe("the state cache", () => {
	test("a state comes back as it was", () => {
		const state = fromBootstrap(
			bootstrap({ groupsWithOlderMessages: ["g-trip"] }),
		);
		expect(stateFromCache(stateCacheText(state))).toEqual(state);
	});

	test("leaves out what only this run had: sends on their way and pages loading", () => {
		const state = fromBootstrap(
			bootstrap({ groupsWithOlderMessages: ["g-trip"] }),
		);
		const pending = {
			...state.messages[0]!,
			id: "local-abc",
			text: "on its way",
		};
		const loading = {
			...state,
			messages: [...state.messages, pending],
			olderMessages: { "g-trip": { hasMore: true, loading: true } },
		};
		const back = stateFromCache(stateCacheText(loading))!;
		expect(back.messages.map((m) => m.id)).toEqual(
			state.messages.map((m) => m.id),
		);
		expect(back.olderMessages).toEqual({
			"g-trip": { hasMore: true, loading: false },
		});
	});

	test("another version, or text that isn't one, reads as no cache", () => {
		expect(stateFromCache(null)).toBeNull();
		expect(stateFromCache("{not json")).toBeNull();
		expect(
			stateFromCache(
				JSON.stringify({ version: 0, state: fromBootstrap(bootstrap()) }),
			),
		).toBeNull();
		expect(
			stateFromCache(JSON.stringify({ version: 1, state: { meId: "u1" } })),
		).toBeNull();
	});

	test("the first bootstrap over a cached state replaces what's changed since", () => {
		const cached = stateFromCache(stateCacheText(fromBootstrap(bootstrap())));
		const fresh = fromBootstrap(
			bootstrap({
				messages: [apiMessage({ id: "m3", at: "2026-10-10T11:00:00.000Z" })],
				groups: bootstrap().groups.slice(1),
			}),
		);
		const next = syncStoreReducer(cached, {
			type: "refresh",
			fresh,
			confirmedClientIds: new Set(),
		})!;
		expect(next.messages.map((m) => m.id)).toEqual(["m3"]);
		expect(next.chats.map((c) => c.id)).toEqual(["g-me"]);
	});
});
