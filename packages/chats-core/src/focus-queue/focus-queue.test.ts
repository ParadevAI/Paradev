import { describe, expect, test } from "bun:test";
import type { NeedItem } from "../needs-you/needs-you.ts";
import { focusItemKey, focusPiles, focusQueue } from "./focus-queue.ts";

const task = (
	id: string,
	at: string,
	over: Partial<NeedItem> = {},
): NeedItem => ({
	kind: "task",
	chatId: "cos",
	devId: "sam",
	at,
	title: id,
	taskId: id,
	...over,
});
const question = (
	id: string,
	at: string,
	over: Partial<NeedItem> = {},
): NeedItem => ({
	kind: "question",
	chatId: "trip",
	devId: "sol",
	at,
	title: id,
	messageId: id,
	...over,
});

describe("focusQueue", () => {
	const items = [
		task("today-old", "1"),
		task("late", "3", { late: true }),
		question("q", "5"),
		task("today-new", "2"),
	];

	test("questions, then late tasks, then today's, oldest first", () => {
		expect(focusQueue(items, "all", [], null).map(focusItemKey)).toEqual([
			"q",
			"late",
			"today-old",
			"today-new",
		]);
	});

	test("Later sends one to the back, in the order they were put off", () => {
		expect(
			focusQueue(items, "all", ["late", "q"], null).map(focusItemKey),
		).toEqual(["today-old", "today-new", "late", "q"]);
	});

	test("a chip shows its Dev's pile; the one waiting out its Undo is hidden", () => {
		expect(focusQueue(items, "sam", [], "late").map(focusItemKey)).toEqual([
			"today-old",
			"today-new",
		]);
	});
});

test("piles are per Dev, biggest first", () => {
	const piles = focusPiles([
		task("a", "1"),
		question("q", "2"),
		task("b", "3"),
	]);
	expect(piles.map((p) => [p.key, p.items.length])).toEqual([
		["sam", 2],
		["sol", 1],
	]);
});
