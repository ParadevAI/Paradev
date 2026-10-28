import { expect, test } from "bun:test";
import type { BackgroundTask } from "@superset/chat/protocol";
import { collectAgentWork } from "./collectAgentWork";

const task = (
	id: string,
	fields: Partial<BackgroundTask> = {},
): BackgroundTask => ({
	id,
	kind: "subagent",
	name: id,
	canStop: true,
	startedAtMs: 0,
	...fields,
});

test("running work from every chat and agent terminal is listed together", () => {
	const { subagents, shells } = collectAgentWork([
		{
			terminalId: "chat-a",
			chatSessionId: "s-a",
			backgroundTasks: [
				task("explore", { startedAtMs: 2, detail: "rg TODO" }),
				task("bun dev", { kind: "process", startedAtMs: 1 }),
			],
		},
		{
			terminalId: "chat-b",
			chatSessionId: "s-b",
			endedAt: null,
			backgroundTasks: [task("review", { startedAtMs: 3 })],
		},
		{
			terminalId: "term-c",
			subagents: [{ id: "agent-1", agentType: "Explore", startedAt: 4 }],
		},
	]);
	expect(
		subagents.map(({ name, terminalId, step }) => [name, terminalId, step]),
	).toEqual([
		["explore", "chat-a", "rg TODO"],
		["review", "chat-b", undefined],
		["Explore", "term-c", undefined],
	]);
	expect(shells.map(({ name, sessionId }) => [name, sessionId])).toEqual([
		["bun dev", "s-a"],
	]);
});

test("a shell started by a subagent stays a background process", () => {
	const { subagents, shells } = collectAgentWork([
		{
			terminalId: "chat-a",
			chatSessionId: "s-a",
			backgroundTasks: [
				task("explore"),
				task("bun dev", { kind: "process", parentId: "explore" }),
			],
		},
	]);
	expect(subagents.map(({ name, nested }) => [name, nested])).toEqual([
		["explore", 0],
	]);
	expect(shells.map(({ name }) => name)).toEqual(["bun dev"]);
});

test("finished subagents, ended agents and nested subagents are left out", () => {
	const { subagents } = collectAgentWork([
		{
			terminalId: "chat-a",
			chatSessionId: "s-a",
			backgroundTasks: [
				task("outer"),
				task("inner-1", { parentId: "outer" }),
				task("inner-2", { parentId: "inner-1" }),
				task("idle", { subagentStatus: "idle" }),
			],
		},
		{
			terminalId: "chat-gone",
			chatSessionId: "s-gone",
			endedAt: 5,
			backgroundTasks: [task("stale")],
		},
	]);
	expect(subagents.map(({ name, nested }) => [name, nested])).toEqual([
		["outer", 2],
	]);
});

test("nested running subagents still count as running", () => {
	const { subagents, runningKeys } = collectAgentWork([
		{
			terminalId: "chat-a",
			chatSessionId: "s-a",
			backgroundTasks: [task("outer"), task("inner", { parentId: "outer" })],
		},
		{ terminalId: "term-b", subagents: [{ id: "agent-1", startedAt: 0 }] },
	]);
	expect(subagents.map(({ key }) => key)).toEqual([
		"chat-a:outer",
		"term-b:agent-1",
	]);
	expect([...runningKeys].sort()).toEqual([
		"chat-a:inner",
		"chat-a:outer",
		"term-b:agent-1",
	]);
});
