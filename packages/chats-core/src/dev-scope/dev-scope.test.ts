import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { App, Dev, Message, SharedFile, Task } from "../model/model.ts";
import {
	appsInScope,
	filesInScope,
	inDevScope,
	infoScope,
	scopeDevs,
	tasksInScope,
} from "./dev-scope.ts";

const task = (id: string, assigneeDevId: string | null): Task =>
	({ id, assigneeDevId }) as Task;
const app = (id: string, creatorDevId: string | null): App =>
	({ id, creatorDevId }) as App;
const file = (id: string, sharedBy: SharedFile["sharedBy"]): SharedFile =>
	({ id, sharedBy }) as SharedFile;
const message = (
	id: string,
	f: SharedFile | undefined,
	voice = false,
): Message =>
	({ id, file: f, voice: voice ? {} : undefined }) as unknown as Message;

describe("dev scope", () => {
	test("null is the whole chat; a Dev id is only its own", () => {
		expect(inDevScope(null, "m1")).toBe(true);
		expect(inDevScope(null, undefined)).toBe(true);
		expect(inDevScope("m1", "m1")).toBe(true);
		expect(inDevScope("m1", "m2")).toBe(false);
		expect(inDevScope("m1", null)).toBe(false);
	});

	test("tasks are the ones a Dev is doing", () => {
		const tasks = [task("a", "m1"), task("b", "m2"), task("c", null)];
		expect(tasksInScope(tasks, null).map((t) => t.id)).toEqual(["a", "b", "c"]);
		expect(tasksInScope(tasks, "m1").map((t) => t.id)).toEqual(["a"]);
	});

	test("sketches are the ones a Dev first published", () => {
		const apps = [app("a", "m1"), app("b", null)];
		expect(appsInScope(apps, "m1").map((a) => a.id)).toEqual(["a"]);
		expect(appsInScope(apps, null)).toHaveLength(2);
	});

	test("files are what a Dev shared; voice notes are never listed", () => {
		const msgs = [
			message("1", file("f1", { kind: "dev", id: "m1" })),
			message("2", file("f2", { kind: "user", id: "u1" })),
			message("3", file("f3", { kind: "dev", id: "m1" }), true),
			message("4", undefined),
		];
		expect(filesInScope(msgs, "m1").map((m) => m.id)).toEqual(["1"]);
		expect(filesInScope(msgs, null).map((m) => m.id)).toEqual(["1", "2"]);
	});
});

describe("whose a chat's info shows", () => {
	const m = (id: string, kind: Dev["kind"], ownerId: string | null): Dev => ({
		id,
		kind,
		name: id,
		color: "#F2B23E",
		ownerId,
		description: "",
	});
	const state: ChatState = {
		meId: "u1",
		members: {},
		devs: {
			goa: m("goa", "group", null),
			planner: m("planner", "added", null),
			sol: m("sol", "custom", "u1"),
			pip: m("pip", "personal", "u2"),
			mine: m("mine", "personal", "u1"),
		},
		chats: [
			{
				id: "g",
				title: "Goa trip",
				kind: "group",
				memberIds: ["u1", "u2"],
				ownerIds: ["u1"],
				devIds: ["goa", "planner", "sol", "pip"],
			},
			{
				id: "dm",
				title: "Dev",
				kind: "direct",
				memberIds: ["u1"],
				ownerIds: ["u1"],
				devIds: ["mine"],
			},
		],
		messages: [],
		tasks: [],
		apps: [],
	};

	test("in a group, only the group's own Devs: members' (yours and theirs) are never offered", () => {
		expect(scopeDevs(state, state.chats[0]!).map((x) => x.id)).toEqual([
			"goa",
			"planner",
		]);
		expect(scopeDevs(state, state.chats[1]!).map((x) => x.id)).toEqual([
			"mine",
		]);
	});

	test("the pick while it's offered, else the group's own; a member's Dev picked before falls back", () => {
		const offered = scopeDevs(state, state.chats[0]!);
		expect(infoScope(offered, undefined)).toBe("goa");
		expect(infoScope(offered, "planner")).toBe("planner");
		expect(infoScope(offered, null)).toBeNull();
		expect(infoScope(offered, "sol")).toBe("goa");
		expect(infoScope(scopeDevs(state, state.chats[1]!), "mine")).toBeNull();
	});
});
