import { afterEach, describe, expect, it } from "bun:test";
import type { TerminalAgentBinding } from "../terminal-agents/types.ts";
import { agentPidSource, chatPortTerminalIds } from "./port-manager.ts";

const store = (launchIds: Record<string, string>) => ({
	get: (terminalId: string) =>
		terminalId in launchIds
			? ({ launchId: launchIds[terminalId] } as TerminalAgentBinding)
			: undefined,
});

afterEach(() => chatPortTerminalIds.clear());

describe("agentPidSource", () => {
	it("reads a terminal agent's wrapper pid from its launch id", () => {
		const source = agentPidSource(store({ t1: "4321-1700000000" }));

		expect(source("t1", 100)).toBe(4321);
		expect(source("t2", 100)).toBeNull();
	});

	it("uses a chat's session pid as its agent", () => {
		chatPortTerminalIds.add("chat1");

		expect(agentPidSource(store({}))("chat1", 777)).toBe(777);
	});
});
