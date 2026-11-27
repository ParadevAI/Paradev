import { describe, expect, it, mock } from "bun:test";
import { TerminalAgentStore } from "../../../terminal-agents/store";
import type { HostServiceContext } from "../../../types";
import { terminalAgentsRouter } from "./terminal-agents";

function setup() {
	const store = new TerminalAgentStore();
	const prompt = mock(() => undefined);
	const caller = terminalAgentsRouter.createCaller({
		isAuthenticated: true,
		terminalAgentStore: store,
		runtime: {
			chat: () => ({
				commands: { prompt },
				live: { get: () => ({ state: { status: "idle" } }) },
			}),
		},
	} as unknown as HostServiceContext);
	const record = (
		terminalId: string,
		eventType: "Start" | "Stop" | "PermissionRequest" | "Attached",
	) =>
		store.recordChatEvent({
			workspaceId: "ws",
			terminalId,
			agentId: "codex",
			chatSessionId: terminalId,
			eventType,
			occurredAt: 1,
		});
	const send = (selected?: { terminalId: string; startedAt: number }) =>
		caller.handOffPrompt({
			workspaceId: "ws",
			prompt: "Resolve conflicts",
			selected,
		});
	return { record, send, prompt, store };
}
describe("conflict prompt handoff", () => {
	it("leaves launching to the caller when the workspace is empty", async () => {
		const { send } = setup();
		expect(await send()).toEqual({ kind: "empty" });
	});
	it("delivers to the single idle chat", async () => {
		const { record, send, prompt } = setup();
		record("chat", "Stop");
		expect(await send()).toMatchObject({ kind: "sent", chatSessionId: "chat" });
		expect(prompt).toHaveBeenCalledTimes(1);
	});
	it.each([
		"Start",
		"PermissionRequest",
		"Attached",
	] as const)("asks before sending on %s", async (event) => {
		const { record, send, prompt } = setup();
		record("chat", event);
		expect(await send()).toMatchObject({ kind: "choose" });
		expect(prompt).not.toHaveBeenCalled();
	});
	it("offers both sessions and sends only to the chosen one", async () => {
		const { record, send, prompt } = setup();
		record("one", "Stop");
		record("two", "Start");
		expect(await send()).toMatchObject({ kind: "choose" });
		expect(prompt).not.toHaveBeenCalled();
		expect(await send({ terminalId: "two", startedAt: 1 })).toMatchObject({
			kind: "sent",
			chatSessionId: "two",
		});
		expect(prompt).toHaveBeenCalledTimes(1);
	});
	it("rejects a picked session that has since ended", async () => {
		const { record, send, store, prompt } = setup();
		record("chat", "Start");
		store.endChat("chat");
		await expect(send({ terminalId: "chat", startedAt: 1 })).rejects.toThrow(
			"ended",
		);
		expect(prompt).not.toHaveBeenCalled();
	});
	it("asks before sending while another prompt is queued", async () => {
		const { record, send, store } = setup();
		record("chat", "Stop");
		store.updateChat("chat", { queuedPrompts: 1 });
		expect(await send()).toMatchObject({ kind: "choose" });
	});
});
