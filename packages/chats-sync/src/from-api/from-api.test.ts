import { describe, expect, test } from "bun:test";
import { myTasks } from "@superset/chats-core";
import {
	apiDev,
	apiMessage,
	apiTask,
	apiTriggerBatch,
	bootstrap,
	PRIYA,
} from "../test-fixtures/test-fixtures.ts";
import { fromBootstrap, toMessage } from "./from-api.ts";

describe("fromBootstrap", () => {
	test("maps trigger batches to their chats, oldest first; a server without triggers sends none", () => {
		const state = fromBootstrap(
			bootstrap({
				triggerBatches: [
					apiTriggerBatch({ id: "b2", at: "2026-10-10T09:04:00.000Z" }),
					apiTriggerBatch(),
				],
			}),
		);
		expect(state.triggerBatches).toEqual([
			{
				id: "b1",
				chatId: "g-me",
				triggerId: "tr1",
				toolkit: "linear",
				count: 2,
				at: "2026-10-10T09:02:00.000Z",
				outcome: null,
				finished: true,
			},
			{
				id: "b2",
				chatId: "g-me",
				triggerId: "tr1",
				toolkit: "linear",
				count: 2,
				at: "2026-10-10T09:04:00.000Z",
				outcome: null,
				finished: true,
			},
		]);
		expect(fromBootstrap(bootstrap()).triggerBatches).toEqual([]);
	});

	test("maps groups to chats with their Devs, and who let each in", () => {
		const state = fromBootstrap(bootstrap());
		expect(state.meId).toBe("u1");
		expect(state.chats).toEqual([
			{
				id: "g-trip",
				title: "Trip",
				kind: "group",
				memberIds: ["u1", "u2"],
				ownerIds: ["u1"],
				devIds: ["m-trip"],
				devAddedBy: { "m-trip": "u1" },
			},
			{
				id: "g-me",
				title: "Juniper",
				kind: "direct",
				memberIds: ["u1"],
				ownerIds: ["u1"],
				devIds: ["m-me"],
				devAddedBy: { "m-me": "u1" },
			},
		]);
	});

	test("Devs keep their description, and their editable parts only when the server sent them", () => {
		const state = fromBootstrap(
			bootstrap({
				devs: [
					apiDev({ descriptionText: "Be brief" }),
					apiDev({
						id: "m-priya",
						ownerUserId: "u2",
						description: "Priya's personal Dev",
					}),
				],
			}),
		);
		expect(state.devs).toEqual({
			"m-me": {
				id: "m-me",
				kind: "personal",
				name: "Juniper",
				color: "#F2B23E",
				ownerId: "u1",
				description: "Your personal Dev",
				look: null,
				voice: null,
				listing: null,
				descriptionText: "Be brief",
			},
			"m-priya": {
				id: "m-priya",
				kind: "personal",
				name: "Juniper",
				color: "#F2B23E",
				ownerId: "u2",
				description: "Priya's personal Dev",
				look: null,
				voice: null,
				listing: null,
			},
		});
	});

	test("a Dev installed from the registry keeps where it came from", () => {
		const state = fromBootstrap(
			bootstrap({
				devs: [apiDev({ listing: { slug: "trip-planner", version: "1.0.0" } })],
			}),
		);
		expect(state.devs["m-me"]?.listing).toEqual({
			slug: "trip-planner",
			version: "1.0.0",
		});
	});

	test("a Dev added to a group from the registry knows who added it; others don't carry it", () => {
		const base = bootstrap();
		const added = apiDev({
			id: "m-plan",
			kind: "added",
			ownerUserId: null,
			groupId: "g-trip",
			name: "Trip Planner",
		});
		const state = fromBootstrap(
			bootstrap({
				devs: [...base.devs, added],
				groupDevs: [
					...base.groupDevs,
					{ groupId: "g-trip", devId: "m-plan", addedBy: "u2" },
				],
			}),
		);
		expect(
			state.chats.find((c) => c.id === "g-trip")?.devAddedBy?.["m-plan"],
		).toBe("u2");
	});

	test("a Dev's chosen look comes through; none, or a server from before looks, is automatic (null)", () => {
		const state = fromBootstrap(
			bootstrap({
				devs: [
					apiDev({ look: "pilot" }),
					apiDev({ id: "m-old", look: undefined }),
				],
			}),
		);
		expect(state.devs["m-me"]?.look).toBe("pilot");
		expect(state.devs["m-old"]?.look).toBeNull();
	});

	test("a Dev's voice comes through; none, or a server from before voices, is the default (null)", () => {
		const state = fromBootstrap(
			bootstrap({
				devs: [
					apiDev({ voice: "pFZP5JQG7iQjIQuC4Bku" }),
					apiDev({ id: "m-old", voice: undefined }),
				],
			}),
		);
		expect(state.devs["m-me"]?.voice).toBe("pFZP5JQG7iQjIQuC4Bku");
		expect(state.devs["m-old"]?.voice).toBeNull();
	});

	test("members are everyone in any group, named by their display name", () => {
		const state = fromBootstrap(bootstrap());
		expect(state.members).toEqual({
			u1: { id: "u1", name: "harshith" },
			u2: { id: PRIYA.id, name: "Priya" },
		});
	});

	test("messages are oldest first, keyed by chat, and link their task", () => {
		const state = fromBootstrap(bootstrap());
		expect(state.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
		expect(state.messages[0]).toEqual({
			id: "m1",
			chatId: "g-me",
			authorId: "u1",
			text: "/task Pay rent",
			at: "2026-10-10T09:00:00.000Z",
			taskId: "t1",
		});
		expect(state.tasks[0]).toMatchObject({
			id: "t1",
			chatId: "g-me",
			status: "todo",
		});
	});

	test("a task an older API still calls needs_review is in progress", () => {
		const state = fromBootstrap(
			bootstrap({ tasks: [apiTask({ status: "needs_review" as never })] }),
		);
		expect(state.tasks[0]!.status).toBe("in_progress");
	});

	test("unassigned tasks in my 1:1 with my Dev count as mine", () => {
		const data = bootstrap();
		data.tasks = [{ ...data.tasks[0]!, assigneeId: null }];
		expect(myTasks(fromBootstrap(data)).map((t) => t.id)).toEqual(["t1"]);
	});
});

test("system notes keep a null author and no taskId key", () => {
	expect(toMessage(apiMessage({ authorId: null }))).toEqual({
		id: "m1",
		chatId: "g-me",
		authorId: null,
		text: "hello",
		at: "2026-10-10T09:00:00.000Z",
	});
});

test("an app's card keeps its app and version; a card from before versions were recorded has no version", () => {
	// The sender's clientId rides along, so the sent message's row keeps its key once the server's copy replaces it.
	expect(toMessage(apiMessage({ clientId: "c-1" })).clientId).toBe("c-1");
	expect(toMessage(apiMessage({ appId: "a1", appVersion: 3 }))).toMatchObject({
		appId: "a1",
		appVersion: 3,
	});
	expect(
		toMessage(apiMessage({ appId: "a1", appVersion: null })),
	).not.toHaveProperty("appVersion");
	expect(
		toMessage(apiMessage({ appId: null, appVersion: null })),
	).not.toHaveProperty("appId");
});

test("a shared file rides on its message; other messages have no file key", () => {
	const file = {
		id: "f1",
		chatId: "g-me",
		name: "plan.pdf",
		title: "",
		mime: "application/pdf",
		size: 1200,
		sharedBy: { kind: "dev" as const, id: "j" },
		preview: "",
		createdAt: "2026-10-10T09:00:00.000Z",
	};
	expect(toMessage(apiMessage({ file }))).toMatchObject({ file });
	expect(toMessage(apiMessage({}))).not.toHaveProperty("file");
});

test("a message sent with an API key names the key; others don't", () => {
	expect(toMessage(apiMessage({ viaKey: "Claude Code" })).viaKey).toBe(
		"Claude Code",
	);
	expect(toMessage(apiMessage({}))).not.toHaveProperty("viaKey");
});
