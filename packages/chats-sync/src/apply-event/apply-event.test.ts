import { describe, expect, test } from "bun:test";
import type { ApiApp } from "../api-types/api-types.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import {
	createAppOptimistic,
	localTaskId,
	sendOptimistic,
} from "../optimistic/optimistic.ts";
import {
	apiDev,
	apiMessage,
	apiQuestion,
	apiTask,
	apiTriggerBatch,
	bootstrap,
} from "../test-fixtures/test-fixtures.ts";
import { applyEvent, applyGroup, replayEvents } from "./apply-event.ts";

const base = () => fromBootstrap(bootstrap());
const now = new Date("2026-10-10T10:00:00.000Z");

describe("message.created", () => {
	test("adds someone else's message in time order", () => {
		const event = {
			type: "message.created" as const,
			message: apiMessage({
				id: "m-early",
				authorId: "u2",
				at: "2026-10-10T09:01:00.000Z",
			}),
			task: null,
		};
		expect(applyEvent(base(), event).messages.map((m) => m.id)).toEqual([
			"m1",
			"m-early",
			"m2",
		]);
	});

	test("is idempotent: the HTTP response and the realtime echo don't duplicate", () => {
		const event = {
			type: "message.created" as const,
			message: apiMessage({ id: "m3", at: "2026-10-10T09:10:00.000Z" }),
			task: null,
		};
		const once = applyEvent(base(), event);
		expect(applyEvent(once, event)).toEqual(once);
	});

	test("replaces our optimistic message and task with the server's, by clientId", () => {
		const clientId = "local-abc";
		const optimistic = sendOptimistic(base(), {
			chatId: "g-me",
			text: "/task Book flights @me",
			clientId,
			now,
		});
		expect(optimistic.tasks.map((t) => t.id)).toContain(localTaskId(clientId));

		const event = {
			type: "message.created" as const,
			message: apiMessage({
				id: "m-srv",
				clientId,
				taskId: "t-srv",
				text: "/task Book flights @me",
				at: "2026-10-10T10:00:01.000Z",
			}),
			task: apiTask({ id: "t-srv", title: "Book flights", due: null }),
		};
		const synced = applyEvent(optimistic, event);
		expect(
			synced.messages
				.filter((m) => m.text === "/task Book flights @me")
				.map((m) => m.id),
		).toEqual(["m-srv"]);
		expect(synced.tasks.map((t) => t.id).sort()).toEqual(["t-srv", "t1"]);
		expect(applyEvent(synced, event)).toEqual(synced);
	});

	test("ignores chats this client doesn't know", () => {
		const state = base();
		expect(
			applyEvent(state, {
				type: "message.created",
				message: apiMessage({ id: "x", groupId: "other" }),
				task: null,
			}),
		).toBe(state);
	});
});

describe("voice notes", () => {
	const note = (text: string, status: "transcribing" | "done") =>
		apiMessage({
			id: "v1",
			authorId: "u2",
			text,
			at: "2026-10-10T09:10:00.000Z",
			voice: { durationMs: 6_000, waveform: [0.5, 1], status },
		});

	test("message.updated fills in a voice note's words", () => {
		const posted = applyEvent(base(), {
			type: "message.created",
			message: note("", "transcribing"),
			task: null,
		});
		const heard = applyEvent(posted, {
			type: "message.updated",
			message: note("Book the train.", "done"),
		});
		expect(heard.messages.find((m) => m.id === "v1")).toMatchObject({
			text: "Book the train.",
			voice: { status: "done" },
		});
	});

	test("a late first event doesn't take the words back", () => {
		const heard = applyEvent(base(), {
			type: "message.updated",
			message: note("Book the train.", "done"),
		});
		expect(
			applyEvent(heard, {
				type: "message.created",
				message: note("", "transcribing"),
				task: null,
			}),
		).toBe(heard);
	});
});

test("message.updated with an edit changes the words, and the quotes of them in replies", () => {
	const reply = apiMessage({
		id: "r1",
		text: "ok",
		at: "2026-10-10T09:10:00.000Z",
		replyTo: {
			id: "m2",
			authorName: "harshith",
			authorKind: "person",
			authorId: "u1",
			text: "hello",
		},
	});
	const withReply = applyEvent(base(), {
		type: "message.created",
		message: reply,
		task: null,
	});
	const edited = applyEvent(withReply, {
		type: "message.updated",
		message: apiMessage({
			id: "m2",
			text: "hello again",
			at: "2026-10-10T09:05:00.000Z",
			editedAt: "2026-10-10T09:20:00.000Z",
		}),
	});
	expect(edited.messages.find((m) => m.id === "m2")).toMatchObject({
		text: "hello again",
		editedAt: "2026-10-10T09:20:00.000Z",
	});
	expect(edited.messages.find((m) => m.id === "r1")?.replyTo?.text).toBe(
		"hello again",
	);
});

test("message.deleted drops only the message (its task stays), once", () => {
	const gone = applyEvent(base(), {
		type: "message.deleted",
		groupId: "g-me",
		messageId: "m1",
	});
	expect(gone.messages.map((m) => m.id)).toEqual(["m2"]);
	expect(gone.tasks.map((t) => t.id)).toEqual(["t1"]);
	expect(
		applyEvent(gone, {
			type: "message.deleted",
			groupId: "g-me",
			messageId: "m1",
		}),
	).toBe(gone);
});

test("question.asked adds the card's message; answered and closed update its question, once", () => {
	const message = apiMessage({
		id: "mq",
		authorId: null,
		authorDevId: "m-me",
		text: "Which cuisine?",
		at: "2026-10-10T09:10:00.000Z",
		question: apiQuestion(),
	});
	const asked = applyEvent(base(), { type: "question.asked", message });
	expect(asked.messages.at(-1)).toMatchObject({
		id: "mq",
		question: { id: "q1", status: "open" },
	});
	expect(applyEvent(asked, { type: "question.asked", message })).toEqual(asked);
	const answered = applyEvent(asked, {
		type: "question.answered",
		groupId: "g-me",
		question: apiQuestion({
			status: "answered",
			answer: "Thai",
			answeredBy: "u1",
		}),
	});
	expect(answered.messages.at(-1)?.question).toMatchObject({
		status: "answered",
		answer: "Thai",
	});
	const expired = applyEvent(asked, {
		type: "question.closed",
		groupId: "g-me",
		question: apiQuestion({ status: "expired" }),
	});
	expect(expired.messages.at(-1)?.question?.status).toBe("expired");
	expect(
		applyEvent(base(), {
			type: "question.closed",
			groupId: "g-me",
			question: apiQuestion(),
		}),
	).toEqual(base());
});

test("task.deleted drops the task, once", () => {
	const gone = applyEvent(base(), {
		type: "task.deleted",
		groupId: "g-me",
		taskId: "t1",
	});
	expect(gone.tasks).toEqual([]);
	expect(
		applyEvent(gone, { type: "task.deleted", groupId: "g-me", taskId: "t1" }),
	).toBe(gone);
});

test("task.updated upserts the task", () => {
	const done = applyEvent(base(), {
		type: "task.updated",
		task: apiTask({ status: "done" }),
	});
	expect(done.tasks).toHaveLength(1);
	expect(done.tasks[0]?.status).toBe("done");
});

describe("apps", () => {
	const app: ApiApp = {
		id: "a1",
		groupId: "g-me",
		name: "Budget",
		description: "",
		color: 1,
		status: "draft",
		version: null,
		url: null,
		createdByDevId: null,
		saved: true,
		createdAt: "2026-10-10T10:00:01.000Z",
	};
	const note = apiMessage({
		id: "note-srv",
		authorId: null,
		text: "harshith added the app Budget",
		at: "2026-10-10T10:00:01.000Z",
	});

	test("app.created swaps our optimistic note for the server's and keeps one app", () => {
		const optimistic = createAppOptimistic(base(), {
			appId: "a1",
			chatId: "g-me",
			name: "Budget",
			description: "",
			now,
		});
		const synced = applyEvent(optimistic, {
			type: "app.created",
			app,
			message: note,
		});
		expect(synced.apps.map((a) => a.id)).toEqual(["a1"]);
		expect(
			synced.messages.filter((m) => m.authorId === null).map((m) => m.id),
		).toEqual(["note-srv"]);
		expect(
			applyEvent(synced, { type: "app.created", app, message: note }),
		).toEqual(synced);
	});

	test("app.deleted removes it, and is a no-op when already gone", () => {
		const withApp = applyEvent(base(), {
			type: "app.created",
			app,
			message: note,
		});
		const removed = applyEvent(withApp, { type: "app.deleted", appId: "a1" });
		expect(removed.apps).toEqual([]);
		expect(applyEvent(removed, { type: "app.deleted", appId: "a1" })).toBe(
			removed,
		);
	});

	test("app.updated brings a new version and never goes back to an older one", () => {
		const withApp = applyEvent(base(), {
			type: "app.created",
			app,
			message: note,
		});
		const v = (number: number) => ({
			...app,
			status: "live" as const,
			version: { number, label: "", createdAt: now.toISOString() },
			url: `http://a1.localhost:3002/_v/${number}/`,
		});
		const v2 = applyEvent(withApp, { type: "app.updated", app: v(2) });
		expect(v2.apps[0]).toMatchObject({
			status: "live",
			version: { number: 2 },
			url: "http://a1.localhost:3002/_v/2/",
		});
		expect(applyEvent(v2, { type: "app.updated", app: v(1) })).toBe(v2);
		// A Dev's publish of an app this client hadn't seen adds it; other chats' apps are ignored.
		expect(
			applyEvent(base(), { type: "app.updated", app: v(1) }).apps,
		).toHaveLength(1);
		expect(
			applyEvent(base(), {
				type: "app.updated",
				app: { ...v(1), groupId: "elsewhere" },
			}).apps,
		).toHaveLength(0);
		expect(
			applyEvent(v2, {
				type: "app.storage",
				appId: "a1",
				scope: "shared",
				key: "k",
				value: "1",
				updatedBy: "u2",
			}),
		).toBe(v2);
	});
});

describe("groups and Devs", () => {
	test("groups.changed leaves state alone (the store refreshes its channels and re-bootstraps instead)", () => {
		const state = base();
		expect(applyEvent(state, { type: "groups.changed" })).toBe(state);
	});

	test("group.updated renames; member.joined adds the person once", () => {
		let state = applyEvent(base(), {
			type: "group.updated",
			group: { id: "g-trip", title: "Goa trip" },
		});
		expect(state.chats.find((c) => c.id === "g-trip")?.title).toBe("Goa trip");
		const joined = {
			type: "member.joined" as const,
			groupId: "g-trip",
			member: {
				id: "u3",
				email: "sam@example.com",
				name: "Sam",
				displayName: "Sam",
				role: "member" as const,
			},
		};
		state = applyEvent(state, joined);
		expect(applyEvent(state, joined)).toEqual(state);
		expect(state.chats.find((c) => c.id === "g-trip")?.memberIds).toEqual([
			"u1",
			"u2",
			"u3",
		]);
		expect(state.members.u3?.name).toBe("Sam");
	});

	test("a Dev let into a group appears once, with its Dev and who let it in; removing takes it out", () => {
		const priyas = apiDev({ id: "m-priya", ownerUserId: "u2", name: "Pip" });
		const added = {
			type: "group_dev.added" as const,
			groupDev: { groupId: "g-trip", devId: "m-priya", addedBy: "u2" },
			dev: priyas,
		};
		const state = applyEvent(base(), added);
		expect(applyEvent(state, added)).toEqual(state);
		expect(state.chats.find((c) => c.id === "g-trip")?.devIds).toEqual([
			"m-trip",
			"m-priya",
		]);
		expect(state.devs["m-priya"]?.name).toBe("Pip");
		expect(
			state.chats.find((c) => c.id === "g-trip")?.devAddedBy?.["m-priya"],
		).toBe("u2");
		const removed = applyEvent(state, {
			type: "group_dev.removed",
			groupId: "g-trip",
			devId: "m-priya",
		});
		expect(removed.chats.find((c) => c.id === "g-trip")?.devIds).toEqual([
			"m-trip",
		]);
	});

	test("a Dev added from the registry keeps who added it, through a later update", () => {
		const planner = apiDev({
			id: "m-plan",
			kind: "added",
			ownerUserId: null,
			groupId: "g-trip",
			name: "Trip Planner",
		});
		let state = applyEvent(base(), {
			type: "group_dev.added",
			groupDev: { groupId: "g-trip", devId: "m-plan", addedBy: "u2" },
			dev: planner,
		});
		expect(
			state.chats.find((c) => c.id === "g-trip")?.devAddedBy?.["m-plan"],
		).toBe("u2");
		state = applyEvent(state, {
			type: "dev.updated",
			dev: { ...planner, name: "Planner" },
		});
		expect(state.devs["m-plan"]?.name).toBe("Planner");
		expect(
			state.chats.find((c) => c.id === "g-trip")?.devAddedBy?.["m-plan"],
		).toBe("u2");
	});

	test("dev.updated from a group channel doesn't wipe the owner's description text", () => {
		const state = applyEvent(base(), {
			type: "dev.updated",
			dev: apiDev({ name: "Juno" }),
		});
		expect(state.devs["m-me"]).toMatchObject({
			name: "Juno",
			descriptionText: "",
		});
	});

	test("dev.updated sets a chosen look, and takes it back to automatic", () => {
		const dressed = applyEvent(base(), {
			type: "dev.updated",
			dev: apiDev({ look: "chef" }),
		});
		expect(dressed.devs["m-me"]?.look).toBe("chef");
		expect(
			applyEvent(dressed, {
				type: "dev.updated",
				dev: apiDev({ look: null }),
			}).devs["m-me"]?.look,
		).toBeNull();
	});

	test("my personal Dev stays described for me, whichever channel's copy of an update arrives last", () => {
		const forMe = apiDev({
			description: "Your personal Dev · Knows my week",
			descriptionText: "Knows my week",
		});
		const forTheGroup = apiDev({
			description: "harshith's personal Dev · Knows my week",
		});
		for (const events of [
			[forMe, forTheGroup],
			[forTheGroup, forMe],
		]) {
			const state = replayEvents(
				base(),
				events.map((dev) => ({ type: "dev.updated" as const, dev })),
			);
			expect(state.devs["m-me"]).toMatchObject({
				description: "Your personal Dev · Knows my week",
				descriptionText: "Knows my week",
			});
		}
		// Someone else's personal Dev takes the group's wording as it comes.
		const priyas = applyEvent(base(), {
			type: "dev.updated",
			dev: apiDev({
				id: "m-priya",
				ownerUserId: "u2",
				description: "Priya's personal Dev",
			}),
		});
		expect(priyas.devs["m-priya"]?.description).toBe("Priya's personal Dev");
	});

	test("dev.deleted removes it from chats and drops its 1:1", () => {
		const state = applyEvent(base(), {
			type: "dev.deleted",
			devId: "m-me",
		});
		expect(state.devs["m-me"]).toBeUndefined();
		expect(state.chats.map((c) => c.id)).toEqual(["g-trip"]);
		expect(applyEvent(state, { type: "dev.deleted", devId: "m-me" })).toBe(
			state,
		);
	});

	test("group.deleted drops the chat with its messages, tasks, apps and own Dev, and keeps members' Devs", () => {
		const withApp = applyEvent(base(), {
			type: "app.created",
			app: {
				id: "a1",
				groupId: "g-trip",
				name: "Budget",
				description: "",
				color: 1,
				status: "draft",
				version: null,
				url: null,
				createdByDevId: null,
				saved: true,
				createdAt: now.toISOString(),
			},
			message: apiMessage({ id: "note", groupId: "g-trip", authorId: null }),
		});
		const state = applyEvent(withApp, {
			type: "app.created",
			app: {
				id: "a2",
				groupId: "g-me",
				name: "Mine",
				description: "",
				color: 2,
				status: "draft",
				version: null,
				url: null,
				createdByDevId: null,
				saved: true,
				createdAt: now.toISOString(),
			},
			message: apiMessage({ id: "note-2", authorId: null }),
		});
		const deleted = {
			type: "group.deleted" as const,
			groupId: "g-trip",
			title: "Trip",
			deletedBy: "u2",
		};
		const gone = applyEvent(state, deleted);
		expect(gone.chats.map((c) => c.id)).toEqual(["g-me"]);
		expect(gone.messages.every((m) => m.chatId === "g-me")).toBe(true);
		expect(gone.apps.map((a) => a.id)).toEqual(["a2"]);
		expect(gone.devs["m-trip"]).toBeUndefined();
		expect(gone.devs["m-me"]).toBeDefined();
		expect(applyEvent(gone, deleted)).toBe(gone);
	});

	test("applyGroup adds a created chat with its Dev, and refreshes one already known", () => {
		const group = {
			id: "g-new",
			kind: "group" as const,
			title: "Goa",
			members: [
				{
					id: "u1",
					email: "harshith@example.com",
					name: null,
					displayName: "harshith",
					role: "owner" as const,
				},
			],
		};
		const dev = apiDev({
			id: "m-goa",
			kind: "group",
			name: "Goa",
			ownerUserId: null,
			groupId: "g-new",
		});
		const state = applyGroup(base(), group, {
			dev,
			groupDev: { groupId: "g-new", devId: "m-goa", addedBy: "u1" },
		});
		expect(state.chats.at(-1)).toEqual({
			id: "g-new",
			title: "Goa",
			kind: "group",
			memberIds: ["u1"],
			ownerIds: ["u1"],
			devIds: ["m-goa"],
			devAddedBy: { "m-goa": "u1" },
		});
		expect(
			applyGroup(state, { ...group, title: "Goa 2" }).chats.at(-1),
		).toMatchObject({ title: "Goa 2", devIds: ["m-goa"] });
	});
});

describe("trigger.batch", () => {
	const batch = (overrides = {}) => ({
		type: "trigger.batch" as const,
		batch: apiTriggerBatch(overrides),
	});

	test("adds a batch in time order and replaces it when it settles", () => {
		const early = applyEvent(
			applyEvent(base(), batch()),
			batch({ id: "b0", at: "2026-10-10T09:01:00.000Z" }),
		);
		expect(early.triggerBatches?.map((b) => b.id)).toEqual(["b0", "b1"]);
		const settled = applyEvent(
			early,
			batch({ outcome: "Commented on ENG-12" }),
		);
		expect(settled.triggerBatches?.map((b) => [b.id, b.outcome])).toEqual([
			["b0", null],
			["b1", "Commented on ENG-12"],
		]);
		expect(settled.triggerBatches?.[1]).toMatchObject({
			chatId: "g-me",
			triggerId: "tr1",
			toolkit: "linear",
			count: 2,
		});
	});

	test("a replayed earlier copy never takes a finished batch back to being handled", () => {
		const settled = applyEvent(base(), batch({ outcome: "Done" }));
		expect(applyEvent(settled, batch({ finished: false }))).toBe(settled);
		const handling = applyEvent(base(), batch({ finished: false }));
		expect(handling.triggerBatches?.[0]?.finished).toBe(false);
		// Given back: no events, done.
		expect(
			applyEvent(handling, batch({ count: 0, finished: true }))
				.triggerBatches?.[0],
		).toMatchObject({ count: 0, finished: true });
	});

	test("ignores chats this client doesn't know, and goes with its deleted group", () => {
		expect(
			applyEvent(base(), batch({ groupId: "g-gone" })).triggerBatches,
		).toEqual([]);
		const state = applyEvent(
			applyEvent(base(), batch({ groupId: "g-trip" })),
			batch({ id: "b2" }),
		);
		const gone = applyEvent(state, {
			type: "group.deleted",
			groupId: "g-trip",
			title: "Trip",
			deletedBy: "u2",
		});
		expect(gone.triggerBatches?.map((b) => b.id)).toEqual(["b2"]);
	});
});

describe("runtime events", () => {
	test("a Dev's reply is a message from that Dev, not a system note", () => {
		const event = {
			type: "message.created" as const,
			message: apiMessage({
				id: "m-bot",
				authorId: null,
				authorDevId: "m1",
				text: "hello from Juniper",
				at: "2026-10-10T09:20:00.000Z",
			}),
			task: null,
		};
		expect(applyEvent(base(), event).messages.at(-1)).toMatchObject({
			id: "m-bot",
			authorId: null,
			authorDevId: "m1",
		});
	});

	test("status and turn events, and events this build doesn't know, leave the state as it is", () => {
		const state = base();
		expect(
			applyEvent(state, {
				type: "dev.status",
				devId: "m1",
				groupId: "g-me",
				status: "waking",
			}),
		).toBe(state);
		expect(
			applyEvent(state, {
				type: "turn.started",
				devId: "m1",
				groupId: "g-me",
				turnId: "t",
			}),
		).toBe(state);
		expect(applyEvent(state, { type: "something.new" } as never)).toBe(state);
	});
});

test("a bootstrap that was read before an event it lands after keeps that event (replayed in order)", () => {
	const priyas = apiDev({ id: "m-priya", ownerUserId: "u2", name: "Pip" });
	const added = {
		type: "group_dev.added" as const,
		groupDev: { groupId: "g-trip", devId: "m-priya", addedBy: "u2" },
		dev: priyas,
	};
	const renamed = {
		type: "dev.updated" as const,
		dev: { ...priyas, name: "Pippa" },
	};
	const stale = fromBootstrap(bootstrap());
	const fresh = replayEvents(stale, [added, renamed]);
	expect(fresh.chats.find((c) => c.id === "g-trip")?.devIds).toEqual([
		"m-trip",
		"m-priya",
	]);
	expect(fresh.devs["m-priya"]?.name).toBe("Pippa");
	// A snapshot that already had them is unchanged by the replay.
	expect(replayEvents(fresh, [added, renamed])).toEqual(fresh);
});

describe("chat.read", () => {
	const read = {
		groupId: "g-trip",
		userId: null,
		devId: "m-trip",
		messageId: "m2",
		messageAt: "2026-10-10T09:05:00.000Z",
		at: "2026-10-10T09:06:00.000Z",
	};

	test("a read comes in from the bootstrap and moves forward with events, never back", () => {
		const state = fromBootstrap(
			bootstrap({ reads: [{ ...read, userId: "u1", devId: null }] }),
		);
		expect(state.reads).toEqual([
			{
				chatId: "g-trip",
				reader: { kind: "person", id: "u1" },
				messageId: "m2",
				messageAt: read.messageAt,
				at: read.at,
			},
		]);
		const seen = applyEvent(state, { type: "chat.read", ...read });
		expect(seen.reads?.find((r) => r.reader.kind === "dev")).toMatchObject({
			reader: { id: "m-trip" },
			messageId: "m2",
		});
		expect(
			applyEvent(seen, {
				type: "chat.read",
				...read,
				messageId: "m0",
				messageAt: "2026-10-10T08:00:00.000Z",
			}),
		).toBe(seen);
		// A chat this client doesn't have is ignored.
		expect(
			applyEvent(seen, { type: "chat.read", ...read, groupId: "g-gone" }),
		).toBe(seen);
	});
});

describe("chat.brief", () => {
	const brief = {
		groupId: "g-trip",
		devId: "m-trip",
		topics: [
			{
				topic: "Hotel",
				line: "Two shortlisted, needs your pick",
				needsYou: true,
			},
		],
		updatedAt: "2026-10-10T09:00:00.000Z",
	};

	test("a brief comes in from the bootstrap and is replaced by newer ones", () => {
		const state = fromBootstrap(bootstrap({ briefs: [brief] }));
		expect(state.briefs).toEqual([
			{
				chatId: "g-trip",
				devId: "m-trip",
				topics: brief.topics,
				updatedAt: brief.updatedAt,
			},
		]);
		const newer = applyEvent(state, {
			type: "chat.brief",
			...brief,
			topics: [],
			updatedAt: "2026-10-10T10:00:00.000Z",
		});
		expect(newer.briefs?.[0]?.topics).toEqual([]);
		expect(
			applyEvent(newer, { type: "chat.brief", ...brief, groupId: "g-gone" }),
		).toBe(newer);
	});
});
