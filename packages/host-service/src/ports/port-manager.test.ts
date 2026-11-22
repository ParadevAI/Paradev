import { afterEach, describe, expect, it } from "bun:test";
import type { TerminalAgentBinding } from "../terminal-agents/types.ts";
import { agentPidSource, chatPortTerminals } from "./port-manager.ts";

const store = (launchIds: Record<string, string>) => ({
	get: (terminalId: string) =>
		terminalId in launchIds
			? ({ launchId: launchIds[terminalId] } as TerminalAgentBinding)
			: undefined,
});

afterEach(() => chatPortTerminals.clear());

describe("agentPidSource", () => {
	it("reads a terminal agent's wrapper pid from its launch id", () => {
		const source = agentPidSource(store({ t1: "4321-1700000000" }));

		expect(source("t1", 100)).toEqual({ pid: 4321, agentIsChild: false });
		expect(source("t2", 100)).toBeNull();
	});

	it("uses a chat's session pid, whose child is the agent when it is an ACP adapter", () => {
		chatPortTerminals.set("chat1", { agentIsChild: true });

		expect(agentPidSource(store({}))("chat1", 777)).toEqual({
			pid: 777,
			agentIsChild: true,
		});
	});
});
