import { describe, expect, test } from "bun:test";
import { type HostCaller, launchAgentSession } from "./hostSession";
import { RelayDispatchError } from "./relay-client";

type Call = { kind: "mutation" | "query"; procedure: string; input: object };

function missing(procedure: string): RelayDispatchError {
	return new RelayDispatchError(
		`${procedure}: No procedure found on path "${procedure}"`,
		404,
		"",
	);
}

function fakeHost(answers: Record<string, unknown>): {
	host: HostCaller;
	calls: Call[];
} {
	const calls: Call[] = [];
	const answer = async (call: Call) => {
		calls.push(call);
		const value = answers[call.procedure];
		if (value instanceof Error) throw value;
		if (value === undefined) throw missing(call.procedure);
		return value as never;
	};
	return {
		calls,
		host: {
			mutation: (procedure, input) =>
				answer({ kind: "mutation", procedure, input }),
			query: (procedure, input) => answer({ kind: "query", procedure, input }),
		},
	};
}

const chatCreated = {
	kind: "chat",
	sessionId: "11111111-1111-4111-8111-111111111111",
	terminalId: "term-chat",
	label: "Claude",
};
const terminalRun = { kind: "terminal", sessionId: "term-1", label: "Claude" };
const base = { workspaceId: "ws-1", agent: "claude", prompt: "do it" };

describe("launchAgentSession", () => {
	test("opens a chat through sessions.create when the host can chat", async () => {
		const { host, calls } = fakeHost({
			"sessions.capabilities": { supported: true },
			"sessions.create": chatCreated,
		});
		const result = await launchAgentSession(host, { ...base, chat: true });
		expect(result).toEqual(chatCreated as never);
		expect(calls.map((call) => call.procedure)).toEqual([
			"sessions.capabilities",
			"sessions.create",
		]);
		expect(calls[1]?.input).toEqual(base);
	});

	test("continues the previous chat by its session id", async () => {
		const { host, calls } = fakeHost({
			"sessions.capabilities": { supported: true },
			"sessions.create": chatCreated,
		});
		await launchAgentSession(host, {
			...base,
			chat: true,
			previous: { chatSessionId: "prev-chat", terminalSessionId: "prev-term" },
		});
		expect(calls[1]?.input).toEqual({
			...base,
			continueSessionId: "prev-chat",
		});
	});

	test("continues a run recorded before chats had a kind through agents.run", async () => {
		const { host, calls } = fakeHost({
			"sessions.capabilities": { supported: true },
			"agents.run": { ...terminalRun, sessionId: "prev-term" },
		});
		const result = await launchAgentSession(host, {
			...base,
			chat: true,
			previous: { chatSessionId: null, terminalSessionId: "prev-term" },
		});
		expect(calls[1]).toEqual({
			kind: "mutation",
			procedure: "agents.run",
			input: { ...base, continueTerminalId: "prev-term", surface: "chat" },
		});
		expect(result).toEqual({
			kind: "terminal",
			sessionId: "prev-term",
			label: "Claude",
		});
	});

	test("launches a terminal for an agent the host cannot chat with", async () => {
		const { host, calls } = fakeHost({
			"sessions.capabilities": { supported: false },
			"agents.run": terminalRun,
		});
		const result = await launchAgentSession(host, {
			...base,
			agent: "custom",
			chat: true,
		});
		expect(calls[1]?.input).toEqual({ ...base, agent: "custom" });
		expect(result.kind).toBe("terminal");
	});

	test("keeps the agents.run chat request for a host without sessions", async () => {
		const { host, calls } = fakeHost({
			"agents.run": { ...terminalRun, chatSessionId: chatCreated.sessionId },
		});
		const result = await launchAgentSession(host, { ...base, chat: true });
		expect(calls[1]?.input).toEqual({ ...base, surface: "chat" });
		expect(result).toEqual({
			kind: "chat",
			sessionId: chatCreated.sessionId,
			terminalId: "term-1",
			label: "Claude",
		});
	});

	test("falls back when only sessions.create is missing", async () => {
		const { host, calls } = fakeHost({
			"sessions.capabilities": { supported: true },
			"agents.run": terminalRun,
		});
		await launchAgentSession(host, { ...base, chat: true });
		expect(calls.map((call) => call.procedure)).toEqual([
			"sessions.capabilities",
			"sessions.create",
			"agents.run",
		]);
	});

	test("rethrows any other failure instead of falling back", async () => {
		const gone = new RelayDispatchError(
			"sessions.create: Workspace ws-1 not found on this host",
			404,
			"",
		);
		const { host, calls } = fakeHost({
			"sessions.capabilities": { supported: true },
			"sessions.create": gone,
		});
		await expect(
			launchAgentSession(host, { ...base, chat: true }),
		).rejects.toBe(gone);
		expect(calls).toHaveLength(2);
	});

	test("with chat off, never asks about chat and continues only a terminal run", async () => {
		const { host, calls } = fakeHost({ "agents.run": terminalRun });
		await launchAgentSession(host, {
			...base,
			chat: false,
			previous: {
				chatSessionId: chatCreated.sessionId,
				terminalSessionId: chatCreated.terminalId,
			},
		});
		await launchAgentSession(host, {
			...base,
			chat: false,
			previous: { chatSessionId: null, terminalSessionId: "prev-term" },
		});
		expect(calls).toEqual([
			{ kind: "mutation", procedure: "agents.run", input: base },
			{
				kind: "mutation",
				procedure: "agents.run",
				input: { ...base, continueTerminalId: "prev-term" },
			},
		]);
	});
});
