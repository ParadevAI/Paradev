import { expect, test } from "bun:test";
import type { TerminalAgentBinding } from "../../terminal-agents/types";
import { bindingNeedsKeepAwake } from "./policy";

const binding: TerminalAgentBinding = {
	terminalId: "terminal",
	workspaceId: "workspace",
	agentId: "claude",
	startedAt: 1,
	lastEventAt: 1,
	lastEventType: "Start",
};

test.each([
	"Attached",
	"Stop",
	"Failed",
	"PermissionRequest",
	"Detached",
])("%s without other work does not prevent sleep", (lastEventType) => {
	expect(bindingNeedsKeepAwake({ ...binding, lastEventType })).toBe(false);
});

test("a quiet working agent has no arbitrary age cutoff", () => {
	expect(bindingNeedsKeepAwake(binding)).toBe(true);
});

test("ended sessions cannot hold the computer awake", () => {
	expect(bindingNeedsKeepAwake({ ...binding, endedAt: 2 })).toBe(false);
});

test("a waiting agent does not hide another working agent", () => {
	expect(
		[binding, { ...binding, lastEventType: "PermissionRequest" }].some(
			bindingNeedsKeepAwake,
		),
	).toBe(true);
});

test("a live terminal subagent can work while its parent waits", () => {
	expect(
		bindingNeedsKeepAwake({
			...binding,
			lastEventType: "PermissionRequest",
			subagents: [{ id: "child", startedAt: 1, lastEventAt: 1 }],
		}),
	).toBe(true);
});

test.each([
	"running",
	"idle",
	"stopped",
	"failed",
] as const)("background subagent status %s is evaluated independently of its idle parent", (subagentStatus) => {
	expect(
		bindingNeedsKeepAwake({
			...binding,
			chatSessionId: "chat",
			lastEventType: "Stop",
			backgroundTasks: [
				{
					id: "task",
					kind: "subagent",
					name: "Research",
					canStop: true,
					startedAtMs: 1,
					subagentStatus,
				},
			],
		}),
	).toBe(subagentStatus === "running");
});

test("queued prompts alone do not hold the computer awake", () => {
	expect(
		bindingNeedsKeepAwake({
			...binding,
			lastEventType: "Stop",
			queuedPrompts: 2,
		}),
	).toBe(false);
});

test("an agent-owned background process can outlive its completed turn", () => {
	expect(
		bindingNeedsKeepAwake({
			...binding,
			lastEventType: "Stop",
			backgroundTasks: [
				{
					id: "build",
					kind: "process",
					name: "Build",
					canStop: true,
					startedAtMs: 1,
				},
			],
		}),
	).toBe(true);
});
