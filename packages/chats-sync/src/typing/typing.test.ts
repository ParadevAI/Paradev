import { describe, expect, test } from "bun:test";
import type {
	ApiMessage,
	RealtimeEvent,
	SyncSignal,
} from "../api-types/api-types.ts";
import {
	applyTyping,
	createTypingReporter,
	createTypingWatch,
	pruneTypists,
	TYPING_EXPIRE_MS,
	typingIn,
} from "./typing.ts";

const typing = (
	userId: string,
	on = true,
	groupId = "trip",
): RealtimeEvent => ({ type: "typing", groupId, userId, typing: on });
const sent = (authorId: string, groupId = "trip"): RealtimeEvent =>
	({
		type: "message.created",
		message: {
			id: "m",
			groupId,
			authorId,
			authorDevId: null,
			text: "hi",
		} as ApiMessage,
		task: null,
	}) as RealtimeEvent;

describe("typists", () => {
	test("a report starts or refreshes someone in their place; stopping, or sending a message, drops them", () => {
		let t = applyTyping({}, typing("nina"), 0);
		t = applyTyping(t, typing("sam"), 1_000);
		t = applyTyping(t, typing("nina"), 2_000);
		expect(typingIn(t, "trip", 2_000)).toEqual(["nina", "sam"]);
		expect(
			typingIn(applyTyping(t, typing("nina", false), 2_000), "trip", 2_000),
		).toEqual(["sam"]);
		expect(typingIn(applyTyping(t, sent("sam"), 2_000), "trip", 2_000)).toEqual(
			["nina"],
		);
		expect(applyTyping(t, sent("ola"), 2_000)).toBe(t);
		expect(typingIn(t, "elsewhere", 2_000)).toEqual([]);
	});

	test("a report runs out without a refresh", () => {
		const t = applyTyping(
			applyTyping({}, typing("nina"), 0),
			typing("sam"),
			3_000,
		);
		expect(typingIn(t, "trip", TYPING_EXPIRE_MS)).toEqual(["sam"]);
		expect(pruneTypists(t, TYPING_EXPIRE_MS)).toEqual({
			trip: { sam: 3_000 + TYPING_EXPIRE_MS },
		});
		expect(pruneTypists(t, 1_000)).toBe(t);
		expect(pruneTypists(t, 3_000 + TYPING_EXPIRE_MS)).toEqual({});
	});
});

describe("createTypingWatch", () => {
	test("follows the events, keeps each chat's array until it changes, and lets reports run out", () => {
		let clock = 0;
		let emit: ((s: SyncSignal) => void) | null = null;
		let due: { fn: () => void; at: number } | null = null;
		const timer = (fn: () => void, ms: number) => {
			due = { fn, at: clock + ms };
			return () => {
				due = null;
			};
		};
		const watch = createTypingWatch({
			subscribe: (l) => {
				emit = l;
				return () => {
					emit = null;
				};
			},
			now: () => clock,
			timer,
		});
		expect(emit).toBeNull();
		let heard = 0;
		const unsubscribe = watch.subscribe(() => heard++);
		const event = (e: RealtimeEvent) =>
			emit?.({ type: "event", event: e, at: clock });

		expect(watch.typists("trip")).toEqual([]);
		event(typing("nina"));
		const first = watch.typists("trip");
		expect(first).toEqual(["nina"]);
		event(typing("nina"));
		expect(watch.typists("trip")).toBe(first);
		expect(heard).toBe(1);
		event(typing("sam", true, "other"));
		expect(watch.typists("trip")).toBe(first);

		expect(due!.at).toBe(TYPING_EXPIRE_MS);
		clock = TYPING_EXPIRE_MS;
		due!.fn();
		expect(watch.typists("trip")).toEqual([]);
		expect(watch.typists("other")).toEqual([]);
		expect(heard).toBe(3);
		expect(due).toBeNull();

		// With no view listening it lets go of the signals and forgets who was typing.
		event(typing("nina"));
		unsubscribe();
		expect(emit).toBeNull();
		expect(due).toBeNull();
		expect(watch.typists("trip")).toEqual([]);
	});
});

describe("createTypingReporter", () => {
	test("says typing at most every 3 s while the text changes, and stopped once it's cleared or sent", () => {
		let clock = 0;
		const calls: [string, boolean][] = [];
		const r = createTypingReporter({
			send: async (g, t) => void calls.push([g, t]),
			now: () => clock,
		});
		r.changed("trip", "h");
		clock = 1_000;
		r.changed("trip", "he");
		clock = 3_000;
		r.changed("trip", "he");
		expect(calls).toEqual([["trip", true]]);
		r.changed("trip", "hey");
		expect(calls).toEqual([
			["trip", true],
			["trip", true],
		]);
		r.changed("trip", "  ");
		expect(calls.at(-1)).toEqual(["trip", false]);
		r.stopped("trip");
		expect(calls).toHaveLength(3);
	});

	test("a stop long after the last report says nothing: the others' view already ran out", () => {
		let clock = 0;
		const calls: boolean[] = [];
		const r = createTypingReporter({
			send: async (_g, t) => void calls.push(t),
			now: () => clock,
		});
		r.changed("trip", "draft");
		clock = TYPING_EXPIRE_MS;
		r.stopped("trip");
		expect(calls).toEqual([true]);
	});

	test("a failed report is dropped", async () => {
		const r = createTypingReporter({
			send: () => Promise.reject(new Error("offline")),
		});
		expect(() => r.changed("trip", "x")).not.toThrow();
	});
});
