import { describe, expect, test } from "bun:test";
import {
	appsOf,
	type ChatState,
	type Env,
	lastMessageByChat,
	messagesOf,
	myApps,
	myTasks,
	reduce,
	savedAppsOf,
	tasksOf,
} from "./chat-state.ts";

function env(): Env {
	let n = 0;
	return { now: () => new Date(2026, 9, 8, 9, 0), id: () => `id${++n}` };
}

const ME_CHAT_ID = "dm";

/** A signed-in user with just their 1:1 with their personal Dev. */
function meState(): ChatState {
	const me = { id: "u1", name: "Harshith" };
	return {
		meId: me.id,
		members: { [me.id]: me },
		devs: {
			m1: {
				id: "m1",
				kind: "personal",
				name: "Juniper",
				color: "#F2B23E",
				ownerId: me.id,
				description: "Your personal Dev",
			},
		},
		chats: [
			{
				id: ME_CHAT_ID,
				title: "Juniper",
				kind: "direct",
				memberIds: [me.id],
				ownerIds: [me.id],
				devIds: ["m1"],
			},
		],
		messages: [],
		tasks: [],
		apps: [],
	};
}

describe("chat state", () => {
	test("a normal message is just a message", () => {
		const e = env();
		const state = reduce(
			meState(),
			{ type: "send", chatId: ME_CHAT_ID, text: " hello " },
			e,
		);
		expect(messagesOf(state, ME_CHAT_ID).at(-1)).toMatchObject({
			text: "hello",
			authorId: "u1",
		});
		expect(state.tasks).toHaveLength(0);
	});

	test("each chat's last message, in one pass", () => {
		const e = env();
		let state: ChatState = {
			...meState(),
			chats: [
				...meState().chats,
				{
					id: "g",
					title: "Trip",
					kind: "group",
					memberIds: ["u1"],
					ownerIds: ["u1"],
					devIds: [],
				},
			],
		};
		state = reduce(state, { type: "send", chatId: ME_CHAT_ID, text: "one" }, e);
		state = reduce(state, { type: "send", chatId: "g", text: "two" }, e);
		state = reduce(
			state,
			{ type: "send", chatId: ME_CHAT_ID, text: "three" },
			e,
		);
		const last = lastMessageByChat(state);
		expect(last.get(ME_CHAT_ID)).toBe(messagesOf(state, ME_CHAT_ID).at(-1)!);
		expect(last.get("g")?.text).toBe("two");
		expect(lastMessageByChat(meState()).size).toBe(0);
	});

	test("blank messages and unknown chats are ignored", () => {
		const e = env();
		const start = meState();
		expect(
			reduce(start, { type: "send", chatId: ME_CHAT_ID, text: "   " }, e),
		).toBe(start);
		expect(reduce(start, { type: "send", chatId: "nope", text: "hi" }, e)).toBe(
			start,
		);
	});

	test("/task creates a task linked from the message", () => {
		const e = env();
		const state = reduce(
			meState(),
			{ type: "send", chatId: ME_CHAT_ID, text: "/task Pay rent @me today" },
			e,
		);
		const task = state.tasks[0];
		expect(task).toMatchObject({
			title: "Pay rent",
			assigneeId: "u1",
			assigneeDevId: null,
			due: "2026-10-08",
			status: "todo",
		});
		expect(messagesOf(state, ME_CHAT_ID).at(-1)?.taskId).toBe(task?.id);
	});

	test("in a 1:1, a task without an assignee goes to its Dev; an unknown @handle leaves it unassigned", () => {
		const e = env();
		let state = reduce(
			meState(),
			{
				type: "send",
				chatId: ME_CHAT_ID,
				text: "/task Research running shoes",
			},
			e,
		);
		expect(state.tasks[0]).toMatchObject({
			assigneeId: null,
			assigneeDevId: "m1",
		});
		state = reduce(
			state,
			{ type: "send", chatId: ME_CHAT_ID, text: "/task Call @priya" },
			e,
		);
		expect(state.tasks[1]).toMatchObject({
			assigneeId: null,
			assigneeDevId: null,
		});
	});

	test("a group's Dev by name or mention token; a Dev not in the chat is ignored", () => {
		const e = env();
		let state = meState();
		state = {
			...state,
			devs: {
				...state.devs,
				gm: {
					id: "gm",
					kind: "group",
					name: "Wren",
					color: "#2F6F6A",
					ownerId: null,
					description: "",
				},
			},
			chats: [
				...state.chats,
				{
					id: "g",
					title: "Trip",
					kind: "group",
					memberIds: ["u1"],
					ownerIds: ["u1"],
					devIds: ["gm"],
				},
			],
		};
		const token = "<@dev:0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b>";
		state = reduce(
			state,
			{ type: "send", chatId: "g", text: "/task Book the boat @wren" },
			e,
		);
		state = reduce(
			state,
			{ type: "send", chatId: "g", text: `/task Pack ${token}` },
			e,
		);
		state = reduce(
			state,
			{ type: "send", chatId: "g", text: "/task Nobody's" },
			e,
		);
		expect(state.tasks.map((t) => t.assigneeDevId)).toEqual(["gm", null, null]);
	});

	test("a timed /task keeps its time and reminder", () => {
		const e = env();
		const state = reduce(
			meState(),
			{
				type: "send",
				chatId: ME_CHAT_ID,
				text: "/task Launch party remind me tomorrow 10am",
			},
			e,
		);
		expect(state.tasks[0]).toMatchObject({
			remind: true,
			scheduledAt: new Date(2026, 9, 9, 10).toISOString(),
			due: null,
		});
	});

	test("toggling completes and reopens", () => {
		const e = env();
		let state = reduce(
			meState(),
			{ type: "send", chatId: ME_CHAT_ID, text: "/task Call mom" },
			e,
		);
		const id = state.tasks[0]!.id;
		state = reduce(state, { type: "toggle-task", taskId: id }, e);
		expect(state.tasks[0]?.status).toBe("done");
		state = reduce(state, { type: "toggle-task", taskId: id }, e);
		expect(state.tasks[0]?.status).toBe("todo");
	});

	test("tasks sort by status, then due time, then when they were made", () => {
		let minute = 0;
		let n = 0;
		const e: Env = {
			now: () => new Date(2026, 9, 8, 9, minute++),
			id: () => `id${++n}`,
		};
		let state = meState();
		for (const text of [
			"/task E",
			"/task C tomorrow",
			"/task B today",
			"/task A at 11am",
			"/task D today",
			"/task F",
		]) {
			state = reduce(state, { type: "send", chatId: ME_CHAT_ID, text }, e);
		}
		const byTitle = (title: string) =>
			state.tasks.find((t) => t.title === title)!.id;
		state = reduce(state, { type: "toggle-task", taskId: byTitle("D") }, e);
		state = {
			...state,
			tasks: state.tasks.map((t) =>
				t.title === "F" ? { ...t, status: "in_progress" as const } : t,
			),
		};
		expect(tasksOf(state, ME_CHAT_ID).map((t) => t.title)).toEqual([
			"F",
			"B",
			"A",
			"C",
			"E",
			"D",
		]);
	});

	test("my tasks: assigned to me or my Devs anywhere, plus unassigned ones in my 1:1 with my Dev", () => {
		const e = env();
		let state = meState();
		state = {
			...state,
			devs: {
				...state.devs,
				m2: {
					id: "m2",
					kind: "custom",
					name: "Coach",
					color: "#2F6F6A",
					ownerId: "u1",
					description: "Coaches me",
				},
			},
			chats: [
				...state.chats,
				{
					id: "g",
					title: "Trip",
					kind: "group",
					memberIds: ["u1", "u2"],
					ownerIds: ["u1"],
					devIds: [],
				},
				{
					id: "coach",
					title: "Coach",
					kind: "direct",
					memberIds: ["u1"],
					ownerIds: ["u1"],
					devIds: ["m2"],
				},
			],
		};
		for (const [chatId, text] of [
			[ME_CHAT_ID, "/task Mine in my 1:1"],
			["g", "/task Someone's"],
			["g", "/task Mine in group @me"],
			["coach", "/task For my custom agent"],
			[ME_CHAT_ID, "/task Kept for me @me"],
		] as const) {
			state = reduce(state, { type: "send", chatId, text }, e);
		}
		state = {
			...state,
			tasks: [
				...state.tasks,
				{
					...state.tasks[0]!,
					id: "loose",
					title: "Unassigned in my 1:1",
					assigneeDevId: null,
				},
			],
		};
		expect(
			myTasks(state)
				.map((t) => t.title)
				.sort(),
		).toEqual([
			"For my custom agent",
			"Kept for me",
			"Mine in group",
			"Mine in my 1:1",
			"Unassigned in my 1:1",
		]);
	});
});

describe("apps", () => {
	// Each call ticks the clock a minute so createdAt orders the apps.
	function clockEnv(): Env {
		let n = 0;
		let minute = 0;
		return {
			now: () => new Date(2026, 9, 10, 9, minute++),
			id: () => `id${++n}`,
		};
	}

	function withApp(
		state: ChatState,
		appId: string,
		name: string,
		e: Env,
		chatId = ME_CHAT_ID,
	): ChatState {
		return reduce(
			state,
			{
				type: "create-app",
				appId,
				chatId,
				name,
				description: ` Track ${name} `,
			},
			e,
		);
	}

	test("create-app adds a draft app with a trimmed brief and notes it in the chat", () => {
		const e = clockEnv();
		const state = withApp(meState(), "a1", " Budget ", e);
		expect(state.apps).toEqual([
			{
				id: "a1",
				chatId: ME_CHAT_ID,
				name: "Budget",
				description: "Track  Budget",
				color: 1,
				status: "draft",
				version: null,
				url: null,
				creatorDevId: null,
				saved: true,
				createdAt: expect.any(String),
			},
		]);
		expect(messagesOf(state, ME_CHAT_ID).at(-1)).toMatchObject({
			authorId: null,
			text: "You added the sketch Budget",
		});
	});

	test("create-app ignores blank names, unknown chats and reused ids", () => {
		const e = clockEnv();
		const start = withApp(meState(), "a1", "Budget", e);
		expect(withApp(start, "a2", "  ", e)).toBe(start);
		expect(withApp(start, "a2", "Trips", e, "nope")).toBe(start);
		expect(withApp(start, "a1", "Trips", e)).toBe(start);
	});

	test("colours cycle through the palette", () => {
		const e = clockEnv();
		let state = meState();
		for (let i = 0; i < 13; i++) state = withApp(state, `a${i}`, `App ${i}`, e);
		expect(state.apps.map((a) => a.color)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1,
		]);
	});

	test("delete-app removes it", () => {
		const e = clockEnv();
		const state = withApp(meState(), "a1", "Budget", e);
		expect(reduce(state, { type: "delete-app", appId: "a1" }, e).apps).toEqual(
			[],
		);
		expect(reduce(state, { type: "delete-app", appId: "zz" }, e)).toBe(state);
	});

	test("appsOf keeps creation order; myApps is newest first, saved and only chats I'm in", () => {
		const e = clockEnv();
		let state = meState();
		state = {
			...state,
			chats: [
				...state.chats,
				{
					id: "g",
					title: "Trip",
					kind: "group",
					memberIds: ["u1", "u2"],
					ownerIds: ["u1"],
					devIds: [],
				},
				{
					id: "x",
					title: "Theirs",
					kind: "group",
					memberIds: ["u2", "u3"],
					ownerIds: ["u2"],
					devIds: [],
				},
			],
		};
		state = withApp(state, "a1", "Budget", e);
		state = withApp(state, "a2", "Packing", e, "g");
		state = withApp(state, "a3", "Habits", e);
		state = withApp(state, "a4", "Not mine", e, "x");
		state = {
			...state,
			apps: state.apps.map((a) => (a.id === "a3" ? { ...a, saved: false } : a)),
		};
		expect(appsOf(state, ME_CHAT_ID).map((a) => a.id)).toEqual(["a1", "a3"]);
		expect(savedAppsOf(state, ME_CHAT_ID).map((a) => a.id)).toEqual(["a1"]);
		expect(myApps(state).map((a) => a.id)).toEqual(["a2", "a1"]);
	});
});
