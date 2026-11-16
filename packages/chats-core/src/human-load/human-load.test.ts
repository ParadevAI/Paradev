import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Message, Task } from "../model/model.ts";
import {
	chatLoad,
	humanLoad,
	type LoadActivity,
	utilisationLevel,
} from "./human-load.ts";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const TODAY = "2026-11-09";
const ago = (min: number) =>
	new Date(NOW.getTime() - min * 60_000).toISOString();
const task = (id: string, over: Partial<Task> = {}): Task => ({
	id,
	chatId: "cos",
	title: id,
	description: "",
	status: "todo",
	assigneeId: "me",
	assigneeDevId: null,
	due: TODAY,
	scheduledAt: null,
	remind: false,
	repeat: null,
	createdAt: ago(600),
	createdByDevId: "sam",
	...over,
});
const chat = (id: string) => ({
	id,
	title: id,
	kind: "direct" as const,
	memberIds: ["me"],
	ownerIds: ["me"],
	devIds: ["sam"],
});
const base: ChatState = {
	meId: "me",
	members: { me: { id: "me", name: "Me" } },
	devs: {
		sam: {
			id: "sam",
			kind: "custom",
			name: "Sam",
			color: "#9DB89A",
			ownerId: "me",
			description: "",
		},
	},
	chats: ["cos", "a", "b", "c", "d", "e", "f"].map(chat),
	messages: [],
	tasks: [],
	apps: [],
};
const view = (chatId: string, min: number): LoadActivity => ({
	at: ago(min),
	kind: "view",
	chatId,
});
const away = (chatId: string, min: number): LoadActivity => ({
	at: ago(min),
	kind: "away",
	chatId,
});
const wrote = (chatId: string, min: number): Message => ({
	id: `m-${chatId}-${min}`,
	chatId,
	authorId: null,
	authorDevId: "sam",
	text: "hi",
	at: ago(min),
});
const CHATS = ["cos", "a", "b", "c", "d", "e"];
/** Nine stays of five minutes, a different chat each time, ending now. */
const hopping = CHATS.flatMap((c, i) => [
	view(c, 45 - i * 5),
	view(CHATS[(i + 1) % 6]!, 42.5 - i * 5),
]);

describe("humanLoad", () => {
	test("nothing waiting and nothing done: calm, no driver", () => {
		const l = humanLoad(base, [], NOW, TODAY);
		expect(l).toMatchObject({ utilisation: 0, level: "calm", driver: null });
		expect(l.backlog).toMatchObject({ tasks: 0, questions: 0, minutes: 0 });
	});

	test("backlog: 12 minutes of waiting is full, half of that busy, and it says the waiting did it", () => {
		const some = (n: number) => ({
			...base,
			tasks: Array.from({ length: n }, (_, i) => task(`t${i}`)),
		});
		const full = humanLoad(some(6), [], NOW, TODAY);
		expect(full.backlog).toMatchObject({
			tasks: 6,
			minutes: 12,
			utilisation: 1,
		});
		expect(full).toMatchObject({ level: "full", driver: "waiting" });
		expect(humanLoad(some(3), [], NOW, TODAY)).toMatchObject({
			level: "busy",
			driver: "waiting",
		});
		expect(humanLoad(some(2), [], NOW, TODAY).level).toBe("calm");
	});

	test("backlog doesn't fade while something is open, however long ago you last did anything", () => {
		const state = {
			...base,
			tasks: Array.from({ length: 6 }, (_, i) => task(`t${i}`)),
		};
		expect(
			humanLoad(state, [view("a", 300), away("a", 299)], NOW, TODAY).level,
		).toBe("full");
	});

	test("a glance under 15 seconds isn't a switch, and makes no chat", () => {
		const glances = ["a", "b", "c", "d", "e", "f"].flatMap((c, i) => [
			view(c, 10 - i * 0.5),
			away(c, 10 - i * 0.5 - 0.1),
		]);
		const l = humanLoad(base, glances, NOW, TODAY);
		expect(l.churn).toMatchObject({ switches: 0, chats: 0 });
		expect(l.level).toBe("calm");
	});

	test("a switch you chose costs less than one a Dev's message pulled you into", () => {
		const chosen = humanLoad(base, hopping, NOW, TODAY);
		const pulledState = {
			...base,
			messages: hopping
				.filter((a) => a.kind === "view")
				.map((a) =>
					wrote(a.chatId, (NOW.getTime() - Date.parse(a.at)) / 60_000 + 1),
				),
		};
		const pulled = humanLoad(pulledState, hopping, NOW, TODAY);
		expect(chosen.churn.pulled).toBe(0);
		expect(pulled.churn.pulled).toBe(pulled.churn.switches);
		expect(pulled.churn.utilisation).toBeGreaterThan(
			chosen.churn.utilisation * 1.5,
		);
	});

	test("a scattered hour with nothing waiting is full from switching", () => {
		// Ten three-minute stays in six chats, each right after a Dev wrote there, each with something read.
		const stays = Array.from({ length: 10 }, (_, i) => ({
			chatId: CHATS[i % 6]!,
			min: 30 - i * 3,
		}));
		const activity: LoadActivity[] = stays.flatMap((s) => [
			view(s.chatId, s.min),
			{
				at: ago(s.min - 1),
				kind: "read" as const,
				chatId: s.chatId,
				words: 700,
			},
		]);
		const messages = stays.map((s) => wrote(s.chatId, s.min + 1));
		const l = humanLoad({ ...base, messages }, activity, NOW, TODAY);
		expect(l).toMatchObject({ level: "full", driver: "switching" });
		expect(l.backlog.utilisation).toBe(0);
		expect(l.churn).toMatchObject({ switches: 9, pulled: 9, chats: 6 });
	});

	test("churn fades: the same hour half an hour on is less than half as heavy, and nothing steps at the hour's edge", () => {
		const at = (min: number) =>
			humanLoad(base, hopping, new Date(NOW.getTime() + min * 60_000), TODAY)
				.churn.utilisation;
		expect(at(30)).toBeLessThan(at(0) / 2);
		expect(Math.abs(at(15.01) - at(14.99))).toBeLessThan(0.01);
		expect(Math.abs(at(20.01) - at(19.99))).toBeLessThan(0.01);
	});

	test("opening a long unread backlog for 20 seconds isn't reading it: reading is capped by the time the chat was on screen", () => {
		const peek: LoadActivity[] = [
			view("a", 10),
			{ at: ago(9.9), kind: "read", chatId: "a", words: 3000 },
			away("a", 9.67),
		];
		const l = humanLoad(base, peek, NOW, TODAY);
		expect(l.churn.utilisation).toBeLessThan(0.1);
	});

	test("a long read that was really read counts, skimmed, while the chat stays open", () => {
		const stay: LoadActivity[] = [
			view("a", 12),
			{ at: ago(10), kind: "read", chatId: "a", words: 1100 },
		];
		const l = humanLoad(base, stay, NOW, TODAY);
		// 1100 words ≈ 5 min read, skimmed at half = 2.5 min, capped at 80% of the ~2m 55s it was acted in.
		expect(l.churn.utilisation).toBeGreaterThan(0.05);
		expect(l.churn.words).toBe(1100);
	});

	test("reads with no views around them (a device that doesn't log the chat on screen) are charged from their words", () => {
		const l = humanLoad(
			base,
			[{ at: ago(5), kind: "read", chatId: "a", words: 2200, events: 4 }],
			NOW,
			TODAY,
		);
		expect(l.churn.words).toBe(2200);
		expect(l.churn.utilisation).toBeGreaterThan(0.2);
	});

	test("answers and task changes add churn and fade", () => {
		const l = humanLoad(
			base,
			[
				{ at: ago(0), kind: "answer", chatId: "a" },
				{ at: ago(0), kind: "task", chatId: "a" },
			],
			NOW,
			TODAY,
		);
		expect(l.churn.answers).toBe(2);
		expect(l.churn.utilisation).toBeCloseTo(2 / 14);
		expect(
			humanLoad(
				base,
				[{ at: ago(15), kind: "answer", chatId: "a" }],
				NOW,
				TODAY,
			).churn.utilisation,
		).toBeCloseTo(0.5 / 14);
	});

	test("the level is the worse of the two, and the driver names it", () => {
		const state = {
			...base,
			tasks: Array.from({ length: 3 }, (_, i) => task(`t${i}`)),
		};
		const l = humanLoad(state, hopping, NOW, TODAY);
		expect(l.utilisation).toBe(
			Math.max(l.backlog.utilisation, l.churn.utilisation),
		);
		expect(l.driver).toBe(
			l.churn.utilisation > l.backlog.utilisation ? "switching" : "waiting",
		);
	});

	test("activity from the future or long ago changes nothing", () => {
		const l = humanLoad(
			base,
			[
				{ at: ago(-5), kind: "answer", chatId: "a" },
				{ at: ago(600), kind: "read", chatId: "a", words: 99999 },
			],
			NOW,
			TODAY,
		);
		expect(l.churn.utilisation).toBeLessThan(0.001);
	});
});

describe("chatLoad", () => {
	test("what's waiting here, on the backlog's scale", () => {
		const state = {
			...base,
			tasks: [task("1"), task("2"), task("3", { chatId: "a" })],
		};
		expect(chatLoad(state, "cos", NOW, TODAY)).toMatchObject({
			minutes: 4,
			level: "calm",
		});
		expect(chatLoad(state, "cos", NOW, TODAY).utilisation).toBeCloseTo(4 / 12);
		expect(
			chatLoad(
				{ ...base, tasks: Array.from({ length: 6 }, (_, i) => task(`t${i}`)) },
				"cos",
				NOW,
				TODAY,
			).level,
		).toBe("full");
	});
});

test("levels: calm under half, busy from half, full from 100%", () => {
	expect([0.49, 0.5, 0.99, 1].map(utilisationLevel)).toEqual([
		"calm",
		"busy",
		"busy",
		"full",
	]);
});
