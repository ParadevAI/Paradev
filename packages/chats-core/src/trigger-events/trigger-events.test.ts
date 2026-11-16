import { describe, expect, test } from "bun:test";
import type { TriggerBatch } from "../model/model.ts";
import {
	batchesByDay,
	eventChip,
	eventCounts,
	eventDayLabel,
	eventNote,
	eventSender,
	eventsLineLabel,
	eventsTimeRange,
	eventTitle,
	filterBatchGroups,
	filterEvents,
	groupBatchesByTrigger,
	triggerHeading,
} from "./trigger-events.ts";

describe("an event's chip", () => {
	test("says what the Dev did, else where the event stands", () => {
		expect(eventChip({ status: "handled", action: "told" })).toEqual({
			label: "Told you",
			tone: "told",
		});
		expect(eventChip({ status: "handled", action: "acted" }).label).toBe(
			"Acted",
		);
		expect(eventChip({ status: "pending", action: "skipped" }).label).toBe(
			"Skipped",
		);
		expect(eventChip({ status: "handled", action: null })).toEqual({
			label: "Handled",
			tone: "handled",
		});
		expect(eventChip({ status: "handled" }).label).toBe("Handled");
		expect(eventChip({ status: "pending" })).toEqual({
			label: "Handling",
			tone: "pending",
		});
		expect(eventChip({ status: "dropped" }).label).toBe("Paused");
		expect(eventChip({ status: "capped" }).label).toBe("Over limit");
	});
});

test("filters keep the events reported that way; an unreported one shows only under All", () => {
	const events = [
		{ id: "a", status: "handled" as const, action: "told" as const },
		{ id: "b", status: "handled" as const, action: "skipped" as const },
		{ id: "c", status: "handled" as const, action: null },
	];
	expect(filterEvents(events, "all").map((e) => e.id)).toEqual(["a", "b", "c"]);
	expect(filterEvents(events, "told").map((e) => e.id)).toEqual(["a"]);
	expect(filterEvents(events, "skipped").map((e) => e.id)).toEqual(["b"]);
	expect(filterEvents(events, "acted")).toEqual([]);
});

test("the events line says what's handled and what the Dev is still on", () => {
	expect(eventsLineLabel(1, 0)).toBe("1 event handled");
	expect(eventsLineLabel(25, 0)).toBe("25 events handled");
	expect(eventsLineLabel(3, 3)).toBe("Handling 3 new events…");
	expect(eventsLineLabel(1, 1)).toBe("Handling 1 new event…");
	expect(eventsLineLabel(5, 2)).toBe("3 events handled · handling 2…");
});

test("batches group by trigger, the latest trigger first, a removed trigger's by app", () => {
	const batch = (
		id: string,
		triggerId: string | null,
		at: string,
	): TriggerBatch => ({
		id,
		chatId: "g",
		triggerId,
		toolkit: "gmail",
		count: 1,
		at,
		outcome: null,
		finished: true,
	});
	const groups = groupBatchesByTrigger([
		batch("1", "t1", "2026-10-10T09:00:00Z"),
		batch("2", "t2", "2026-10-10T09:05:00Z"),
		batch("3", "t1", "2026-10-10T09:10:00Z"),
		batch("4", null, "2026-10-10T08:00:00Z"),
	]);
	expect(groups.map((g) => [g.key, g.batches.map((b) => b.id)])).toEqual([
		["t1", ["3", "1"]],
		["t2", ["2"]],
		["gone:gmail", ["4"]],
	]);
});

test("under a filter, only batches with a matching event, and triggers left with any; unloaded batches stay", () => {
	const batch = (id: string, triggerId: string): TriggerBatch => ({
		id,
		chatId: "g",
		triggerId,
		toolkit: "linear",
		count: 1,
		at: `2026-10-10T09:0${id}:00Z`,
		outcome: null,
		finished: true,
	});
	const groups = groupBatchesByTrigger([
		batch("1", "t1"),
		batch("2", "t1"),
		batch("3", "t2"),
		batch("4", "t3"),
	]);
	const loaded: Record<
		string,
		{ status: "handled"; action: "told" | "skipped" }[]
	> = {
		"1": [{ status: "handled", action: "told" }],
		"2": [{ status: "handled", action: "skipped" }],
		"3": [{ status: "handled", action: "skipped" }],
	};
	const shown = (filter: "all" | "told") =>
		filterBatchGroups(groups, (id) => loaded[id], filter).map((g) => [
			g.key,
			g.batches.map((b) => b.id),
		]);
	expect(shown("told")).toEqual([
		["t3", ["4"]],
		["t1", ["1"]],
	]);
	expect(shown("all")).toHaveLength(3);
});

test("a trigger's group is headed by its title, or its app's name once it's gone", () => {
	const triggers = [{ id: "t1", title: "Investor mail" }];
	expect(triggerHeading({ triggerId: "t1", toolkit: "gmail" }, triggers)).toBe(
		"Investor mail",
	);
	expect(triggerHeading({ triggerId: null, toolkit: "gmail" }, triggers)).toBe(
		"Gmail",
	);
	expect(triggerHeading({ triggerId: "t1", toolkit: "linear" }, null)).toBe(
		"Linear",
	);
});

test("an event without a title is named after its app", () => {
	expect(eventTitle({ title: null, toolkit: "gmail" })).toBe("Gmail event");
	expect(
		eventTitle({ title: "ENG-812 Checkout 500s", toolkit: "linear" }),
	).toBe("ENG-812 Checkout 500s");
});

test("a range within one minute is one time", () => {
	const at = "2026-10-15T09:02:10.000Z";
	expect(
		eventsTimeRange(
			at,
			"2026-10-15T09:02:50.000Z",
			new Date("2026-10-15T12:00:00.000Z"),
		),
	).not.toContain("–");
	expect(
		eventsTimeRange(
			at,
			"2026-10-15T11:15:00.000Z",
			new Date("2026-10-15T12:00:00.000Z"),
		),
	).toContain("–");
});

describe("the events panel's words", () => {
	const now = new Date(2026, 9, 27, 18, 0);
	const at = (d: number, h: number, m = 0) =>
		new Date(2026, 9, d, h, m).toISOString();

	test("a range within today is times; one crossing days or not today says its days", () => {
		expect(eventsTimeRange(at(27, 9, 2), at(27, 11, 15), now)).not.toContain(
			"Today",
		);
		expect(eventsTimeRange(at(26, 19, 41), at(27, 16, 39), now)).toMatch(
			/^Yesterday .+ – Today .+$/,
		);
		expect(eventsTimeRange(at(26, 9), at(26, 10), now)).toStartWith(
			"Yesterday ",
		);
	});

	test("days: Today, Yesterday, else the weekday and date", () => {
		expect(eventDayLabel(at(27, 1), now)).toBe("Today");
		expect(eventDayLabel(at(26, 23), now)).toBe("Yesterday");
		expect(eventDayLabel(at(22, 12), now)).toMatch(/22/);
	});

	test("a sender is the name, unquoted, else the address; other subtitles pass", () => {
		expect(
			eventSender(`"'Jared Burke' via support" <support@superset.sh>`),
		).toBe("Jared Burke via support");
		expect(eventSender("Nathan Windsor <iamnathanwindsor@gmail.com>")).toBe(
			"Nathan Windsor",
		);
		expect(eventSender(`"Conan O'Brien" <conan@example.com>`)).toBe(
			"Conan O'Brien",
		);
		expect(eventSender("<aakarsh@gmail.com>")).toBe("aakarsh@gmail.com");
		expect(eventSender("Engineering · In Progress")).toBe(
			"Engineering · In Progress",
		);
	});

	test("a trigger's turns, newest first, in runs of the same day", () => {
		const batch = (id: string, iso: string) =>
			({ id, at: iso }) as TriggerBatch;
		const days = batchesByDay(
			[batch("c", at(27, 16)), batch("b", at(27, 9)), batch("a", at(26, 20))],
			now,
		);
		expect(days.map((d) => [d.day, d.batches.map((b) => b.id)])).toEqual([
			["Today", ["c", "b"]],
			["Yesterday", ["a"]],
		]);
	});

	test("counts per filter, for the tabs", () => {
		const events = [
			{ status: "handled" as const, action: "acted" as const },
			{ status: "handled" as const, action: "acted" as const },
			{ status: "handled" as const, action: "skipped" as const },
		];
		expect(eventCounts(events)).toEqual({
			all: 3,
			told: 0,
			acted: 2,
			skipped: 1,
		});
	});

	test("the Dev's note once: a lone event's turn outcome, else each event's own", () => {
		expect(
			eventNote(
				{ note: "Noted; no ping." },
				{ outcome: "Jared is complaining… I raised his item.", count: 1 },
			),
		).toBe("Jared is complaining… I raised his item.");
		expect(
			eventNote({ note: "Noted; no ping." }, { outcome: null, count: 1 }),
		).toBe("Noted; no ping.");
		expect(
			eventNote(
				{ note: "Noted; no ping." },
				{ outcome: "Two emails handled.", count: 2 },
			),
		).toBe("Noted; no ping.");
		expect(eventNote({ note: null }, { outcome: "", count: 1 })).toBeNull();
	});
});
