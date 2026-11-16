import { describe, expect, test } from "bun:test";
import { type ChatState, messagesOf } from "@superset/chats-core";
import type {
	ApiApp,
	ApiMessage,
	ApiMessagePage,
} from "../api-types/api-types.ts";
import { applyEvent } from "../apply-event/apply-event.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import { sendOptimistic } from "../optimistic/optimistic.ts";
import { syncStoreReducer } from "../sync-store/sync-store.ts";
import {
	apiMessage,
	apiTask,
	apiTriggerBatch,
	bootstrap,
} from "../test-fixtures/test-fixtures.ts";
import {
	createMessageHistory,
	keepOlderMessages,
	olderMessagesOf,
	withOlderPage,
} from "./message-history.ts";

/** Message `n` of my 1:1, a minute apart from 09:00. */
const msg = (n: number, overrides: Partial<ApiMessage> = {}) =>
	apiMessage({
		id: `m${n}`,
		text: `#${n}`,
		at: new Date(Date.UTC(2026, 9, 10, 9, n)).toISOString(),
		...overrides,
	});
const range = (from: number, to: number) =>
	Array.from({ length: to - from }, (_, i) => msg(from + i));
/** A page of older messages, with the apps and tasks their cards show. */
const page = (
	messages: ApiMessage[],
	cards: Partial<Omit<ApiMessagePage, "messages">> = {},
): ApiMessagePage => ({ messages, apps: [], tasks: [], ...cards });
const sketch = (
	id: string,
	createdAt = "2026-10-10T08:00:00.000Z",
): ApiApp => ({
	id,
	groupId: "g-me",
	name: "Split",
	description: "",
	color: 1,
	status: "live",
	version: null,
	url: null,
	saved: false,
	createdByDevId: null,
	createdAt,
});

/** My 1:1 holds messages 40–49 with more before them; the trip group has one message at 09:30. */
const loaded = () =>
	fromBootstrap(
		bootstrap({
			messages: [
				...range(40, 50),
				msg(30, { id: "trip-1", groupId: "g-trip" }),
			],
			groupsWithOlderMessages: ["g-me"],
		}),
	);
const ids = (state: ChatState, chatId = "g-me") =>
	messagesOf(state, chatId).map((m) => m.id);

describe("a page of older messages", () => {
	test("goes in front of the chat's, in time order, among other chats' messages", () => {
		const state = withOlderPage(
			loaded(),
			"g-me",
			"m40",
			page(range(30, 40)),
			10,
		);
		expect(ids(state)).toEqual(range(30, 50).map((m) => m.id));
		expect(state.messages.map((m) => m.at)).toEqual(
			state.messages.map((m) => m.at).sort(),
		);
		expect(ids(state, "g-trip")).toEqual(["trip-1"]);
		expect(olderMessagesOf(state, "g-me")).toEqual({
			hasMore: true,
			loading: false,
		});
	});

	test("never duplicates a message the chat already has", () => {
		const state = withOlderPage(
			loaded(),
			"g-me",
			"m40",
			page([...range(35, 40), msg(40)]),
			10,
		);
		expect(ids(state)).toEqual(range(35, 50).map((m) => m.id));
	});

	test("a short page means the chat's first message is here", () => {
		expect(
			olderMessagesOf(
				withOlderPage(loaded(), "g-me", "m40", page(range(36, 40)), 10),
				"g-me",
			),
		).toEqual({ hasMore: false, loading: false });
		expect(
			olderMessagesOf(
				withOlderPage(loaded(), "g-me", "m40", page([]), 10),
				"g-me",
			).hasMore,
		).toBe(false);
	});

	test("is dropped when the chat no longer starts where it was asked from", () => {
		const state = withOlderPage(
			loaded(),
			"g-me",
			"m12",
			page(range(2, 12)),
			10,
		);
		expect(ids(state)).toEqual(range(40, 50).map((m) => m.id));
		expect(olderMessagesOf(state, "g-me")).toEqual({
			hasMore: true,
			loading: false,
		});
	});

	test("brings the sketches and tasks its cards show that the state lacks; those it has stay as they are", () => {
		const live = {
			...sketch("a-known", "2026-10-10T07:00:00.000Z"),
			name: "Live",
			saved: true,
		};
		const withKnown = fromBootstrap(
			bootstrap({
				messages: range(40, 50),
				groupsWithOlderMessages: ["g-me"],
				apps: [live],
			}),
		);
		const known = { ...live, name: "Stale copy" };
		const cards = [
			msg(36, { appId: "a-old" }),
			msg(37, { taskId: "t-old" }),
			msg(38, { appId: "a-known" }),
		];
		const state = withOlderPage(
			withKnown,
			"g-me",
			"m40",
			page([...range(30, 36), ...cards, msg(39)], {
				apps: [sketch("a-old"), known],
				tasks: [apiTask({ id: "t-old", status: "done" })],
			}),
			10,
		);
		expect(state.apps.map((a) => [a.id, a.name])).toEqual([
			["a-known", "Live"],
			["a-old", "Split"],
		]);
		expect(state.tasks.find((t) => t.id === "t-old")?.status).toBe("done");

		const dropped = withOlderPage(
			withKnown,
			"g-me",
			"m12",
			page(range(2, 12), { apps: [sketch("a-old")] }),
			10,
		);
		expect(dropped.apps.map((a) => a.id)).toEqual(["a-known"]);
	});

	test("chats the bootstrap didn't list have nothing older", () => {
		expect(olderMessagesOf(loaded(), "g-trip")).toEqual({
			hasMore: false,
			loading: false,
		});
	});
});

describe("with older messages in", () => {
	const paged = () =>
		withOlderPage(loaded(), "g-me", "m40", page(range(30, 40)), 10);

	test("a new message, our own send and its confirmation land at the end", () => {
		let state = applyEvent(paged(), {
			type: "message.created",
			message: msg(55),
			task: null,
		});
		state = sendOptimistic(state, {
			chatId: "g-me",
			text: "hi",
			clientId: "local-1",
			now: new Date(Date.UTC(2026, 9, 10, 10)),
		});
		state = applyEvent(state, {
			type: "message.created",
			message: msg(60, { id: "m-sent", clientId: "local-1", text: "hi" }),
			task: null,
		});
		expect(ids(state)).toEqual([
			...range(30, 50).map((m) => m.id),
			"m55",
			"m-sent",
		]);
	});

	test("events replayed on resume change nothing", () => {
		const state = paged();
		expect(
			applyEvent(state, {
				type: "message.created",
				message: msg(45),
				task: null,
			}),
		).toEqual(state);
	});

	test("a deleted older message goes, and the next page goes back from the one now first", async () => {
		let state: ChatState | null = applyEvent(paged(), {
			type: "message.deleted",
			groupId: "g-me",
			messageId: "m30",
		});
		const asked: string[] = [];
		const history = createMessageHistory({
			api: {
				olderMessages: async (_chat, beforeId) => (
					asked.push(beforeId), page(range(21, 30))
				),
			},
			getState: () => state,
			update: (change) => (state = change(state!)),
		});
		await history.loadOlderMessages("g-me");
		expect(asked).toEqual(["m31"]);
		expect(ids(state!)[0]).toBe("m21");
	});
});

describe("loading older messages", () => {
	function setup(
		answer: () => Promise<ApiMessage[]>,
		start: ChatState = loaded(),
	) {
		let state: ChatState | null = start;
		const calls: { chatId: string; beforeId: string; limit: number }[] = [];
		const history = createMessageHistory({
			api: {
				olderMessages: (chatId, beforeId, limit) => (
					calls.push({ chatId, beforeId, limit }),
					answer().then((messages) => page(messages))
				),
			},
			getState: () => state,
			update: (change) => (state = change(state!)),
		});
		return { history, calls, state: () => state! };
	}

	test("asks for the page before the oldest message, once at a time, and shows it's loading", async () => {
		let resolve!: (page: ApiMessage[]) => void;
		const { history, calls, state } = setup(
			() => new Promise((r) => (resolve = r)),
		);
		const first = history.loadOlderMessages("g-me");
		void history.loadOlderMessages("g-me");
		expect(olderMessagesOf(state(), "g-me").loading).toBe(true);
		expect(calls).toEqual([{ chatId: "g-me", beforeId: "m40", limit: 50 }]);
		resolve(range(20, 40));
		await first;
		expect(ids(state())[0]).toBe("m20");
		expect(olderMessagesOf(state(), "g-me")).toEqual({
			hasMore: false,
			loading: false,
		});
	});

	test("a chat with nothing older is never asked about", async () => {
		const { history, calls } = setup(async () => []);
		await history.loadOlderMessages("g-trip");
		expect(calls).toEqual([]);
	});

	test("our unsent message is never the cursor", async () => {
		const start = loaded();
		const onlyLocal = sendOptimistic(
			{ ...start, messages: [] },
			{ chatId: "g-me", text: "hi", clientId: "local-1", now: new Date() },
		);
		const { history, calls } = setup(async () => [], onlyLocal);
		await history.loadOlderMessages("g-me");
		expect(calls).toEqual([]);
	});

	test("a failed page stops loading, and the next try asks again", async () => {
		let fail = true;
		const { history, calls, state } = setup(async () => {
			if (fail) throw new Error("offline");
			return range(30, 40);
		});
		await history.loadOlderMessages("g-me");
		expect(olderMessagesOf(state(), "g-me")).toEqual({
			hasMore: true,
			loading: false,
		});
		fail = false;
		await history.loadOlderMessages("g-me");
		expect(calls).toHaveLength(2);
		expect(ids(state())[0]).toBe("m30");
	});
});

describe("a re-bootstrap", () => {
	const paged = () =>
		withOlderPage(loaded(), "g-me", "m40", page(range(30, 40)), 10);
	const refresh = (
		local: ChatState,
		messages: ApiMessage[],
		older = ["g-me"],
	) =>
		syncStoreReducer(local, {
			type: "refresh",
			fresh: fromBootstrap(
				bootstrap({ messages, groupsWithOlderMessages: older }),
			),
			confirmedClientIds: new Set(),
		})!;

	test("keeps the older pages when its messages join up with ours", () => {
		const state = refresh(paged(), range(42, 52));
		expect(ids(state)).toEqual(range(30, 52).map((m) => m.id));
		expect(olderMessagesOf(state, "g-me").hasMore).toBe(true);
	});

	test("keeps the sketches and tasks the older pages' cards show, which the fresh bootstrap no longer sends", () => {
		const local = withOlderPage(
			loaded(),
			"g-me",
			"m40",
			page([msg(38, { appId: "a-old", taskId: "t-old" }), msg(39)], {
				apps: [sketch("a-old")],
				tasks: [apiTask({ id: "t-old" })],
			}),
			2,
		);
		const state = refresh(local, range(40, 52));
		expect(state.apps.map((a) => a.id)).toContain("a-old");
		expect(state.tasks.map((t) => t.id)).toContain("t-old");
		expect(refresh(local, range(60, 70)).apps.map((a) => a.id)).not.toContain(
			"a-old",
		);
	});

	test("starts the chat again from its messages when there's a gap", () => {
		const state = refresh(paged(), range(60, 70));
		expect(ids(state)).toEqual(range(60, 70).map((m) => m.id));
		expect(olderMessagesOf(state, "g-me").hasMore).toBe(true);
	});

	test("takes the server's word when it sent the whole chat", () => {
		const state = refresh(paged(), range(35, 50), []);
		expect(ids(state)).toEqual(range(35, 50).map((m) => m.id));
	});

	test("keeps the batches between the older pages it keeps, and takes the server's for the rest", () => {
		const local = fromBootstrap(
			bootstrap({
				messages: range(30, 50),
				groupsWithOlderMessages: ["g-me"],
				triggerBatches: [
					apiTriggerBatch({ id: "old", at: msg(35).at }),
					apiTriggerBatch({ id: "gone", at: msg(45).at }),
				],
			}),
		);
		const fresh = fromBootstrap(
			bootstrap({
				messages: range(42, 52),
				groupsWithOlderMessages: ["g-me"],
				triggerBatches: [apiTriggerBatch({ id: "new", at: msg(50).at })],
			}),
		);
		const state = syncStoreReducer(local, {
			type: "refresh",
			fresh,
			confirmedClientIds: new Set(),
		})!;
		expect(state.triggerBatches?.map((b) => b.id)).toEqual(["old", "new"]);
		expect(refresh(local, range(60, 70)).triggerBatches).toEqual([]);
	});

	test("leaves a fresh state alone when nothing was paged in", () => {
		const fresh = fromBootstrap(
			bootstrap({ messages: range(40, 50), groupsWithOlderMessages: ["g-me"] }),
		);
		expect(keepOlderMessages(fresh, fresh)).toBe(fresh);
	});
});
