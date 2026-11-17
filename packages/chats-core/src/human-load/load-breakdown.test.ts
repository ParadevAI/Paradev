import { expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Task } from "../model/model.ts";
import { humanLoad } from "./human-load.ts";
import { loadHeadline, loadSignals } from "./load-breakdown.ts";

const NOW = new Date("2026-11-10T18:00:00.000Z");
const TODAY = "2026-11-10";
const task = (id: string, chatId: string): Task =>
	({
		id,
		chatId,
		title: id,
		status: "todo",
		assigneeId: "me",
		assigneeDevId: null,
		due: TODAY,
		scheduledAt: null,
		createdAt: "2026-11-10T09:00:00.000Z",
	}) as Task;
const state = {
	meId: "me",
	members: { me: { id: "me", name: "Me" } },
	devs: {},
	chats: [
		{
			id: "cos",
			kind: "group",
			title: "CoS",
			memberIds: ["me"],
			devIds: [],
		},
		{
			id: "sol",
			kind: "group",
			title: "Sol",
			memberIds: ["me"],
			devIds: [],
		},
	],
	messages: [],
	tasks: [
		...Array.from({ length: 5 }, (_, i) => task(`c${i}`, "cos")),
		task("s", "sol"),
	],
	apps: [],
} as unknown as ChatState;
const at = (min: number) =>
	new Date(NOW.getTime() - min * 60_000).toISOString();

test("what's waiting is counted, by chat, biggest first", () => {
	const load = humanLoad(state, [], NOW, TODAY);
	const { waiting } = loadSignals(state, load, NOW, TODAY);
	expect(waiting.detail).toBe("6 tasks");
	expect(waiting.chats).toEqual([
		{ chatId: "cos", title: "CoS", items: 5 },
		{ chatId: "sol", title: "Sol", items: 1 },
	]);
	expect(waiting.level).toBe("full");
});

test("switching says its counts, and a quiet hour says so", () => {
	const quiet = loadSignals(
		state,
		humanLoad(state, [], NOW, TODAY),
		NOW,
		TODAY,
	).switching;
	expect(quiet).toMatchObject({ detail: "A quiet hour", level: "calm" });
	const log = [
		{ at: at(20), kind: "view" as const, chatId: "cos" },
		{ at: at(10), kind: "view" as const, chatId: "sol" },
		{ at: at(2), kind: "read" as const, chatId: "sol", words: 900 },
		{ at: at(1), kind: "answer" as const, chatId: "sol" },
	];
	const s = loadSignals(
		state,
		humanLoad(state, log, NOW, TODAY),
		NOW,
		TODAY,
	).switching;
	expect(s.detail).toBe("1 switch across 2 chats this hour");
	expect(s.rows).toEqual([
		"about 900 words arrived in chats you read",
		"1 answer and task changes",
	]);
});

test("the headline names the word and what drove it", () => {
	expect(loadHeadline(humanLoad(state, [], NOW, TODAY))).toEqual({
		title: "Full · from waiting",
		subtitle: "6 things waiting on you.",
	});
	const none = { ...state, tasks: [] } as ChatState;
	expect(loadHeadline(humanLoad(none, [], NOW, TODAY))).toEqual({
		title: "Calm",
		subtitle: "Nothing is asking much of you.",
	});
	const scattered = [
		"cos",
		"sol",
		"cos",
		"sol",
		"cos",
		"sol",
		"cos",
		"sol",
		"cos",
		"sol",
	].map((c, i) => ({ at: at(50 - i * 5), kind: "view" as const, chatId: c }));
	const answers = Array.from({ length: 12 }, () => ({
		at: at(1),
		kind: "answer" as const,
		chatId: "cos",
	}));
	const h = loadHeadline(
		humanLoad(none, [...scattered, ...answers], NOW, TODAY),
	);
	expect(h.title).toBe("Full · from switching");
	expect(h.subtitle).toBe("Nothing is waiting on you. The hour was scattered.");
});
