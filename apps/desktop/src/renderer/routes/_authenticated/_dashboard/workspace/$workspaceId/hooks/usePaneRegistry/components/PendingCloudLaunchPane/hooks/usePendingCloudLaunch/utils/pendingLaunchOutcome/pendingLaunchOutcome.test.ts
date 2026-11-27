import { describe, expect, it } from "bun:test";
import { pendingLaunchOutcome } from "./pendingLaunchOutcome";

const T = "promised-terminal";
const chat = (terminalId: string | null, live = true) => ({
	sessionId: `session-${terminalId}`,
	terminalId,
	harnessSessionId: null,
	title: null,
	live,
});
const base = {
	surface: "chat" as const,
	terminalId: T,
	sessions: [],
	terminalListed: false,
	terminalBinding: undefined,
	typed: false,
	sinceMs: 0,
	answeredAtMs: 0,
	nowMs: 10,
	timeoutMs: 100,
	noAnswerTimeoutMs: 1000,
};

describe("pendingLaunchOutcome", () => {
	it("binds to the chat under the promised terminal id, the live one first", () => {
		const own = chat(T);
		expect(
			pendingLaunchOutcome({
				...base,
				sessions: [chat("someone-else"), chat(T, false), own],
			}),
		).toEqual({ kind: "chat", session: own });
	});

	it("binds to the launch's chat after its harness stopped", () => {
		const finished = { ...chat(null, false), launchTerminalId: T };
		expect(
			pendingLaunchOutcome({
				...base,
				sessions: [chat("someone-else"), finished],
			}),
		).toEqual({ kind: "chat", session: finished });
	});

	it("binds through the agent binding when the host lists no terminal", () => {
		const finished = { ...chat(null, false), sessionId: "launched" };
		expect(
			pendingLaunchOutcome({
				...base,
				sessions: [chat(null, false), finished],
				terminalBinding: { chatSessionId: "launched" },
			}),
		).toEqual({ kind: "chat", session: finished });
	});

	it("becomes the terminal the launch fell back to, unless the user typed", () => {
		expect(pendingLaunchOutcome({ ...base, terminalBinding: {} })).toEqual({
			kind: "terminal",
		});
		expect(
			pendingLaunchOutcome({ ...base, terminalBinding: {}, typed: true }),
		).toEqual({ kind: "release" });
	});

	it("waits until the deadline, then releases", () => {
		expect(pendingLaunchOutcome(base)).toEqual({ kind: "wait", untilMs: 100 });
		expect(pendingLaunchOutcome({ ...base, nowMs: 100 })).toEqual({
			kind: "release",
		});
	});

	it("prefers an open chat to a closed one when none is live", () => {
		const open = { ...chat(T, false), sessionId: "open" };
		expect(
			pendingLaunchOutcome({
				...base,
				sessions: [{ ...chat(T, false), closedAt: 5 }, open],
			}),
		).toEqual({ kind: "chat", session: open });
	});

	it("waits for the host's first answer, up to a longer limit", () => {
		expect(
			pendingLaunchOutcome({ ...base, answeredAtMs: null, nowMs: 500 }),
		).toEqual({ kind: "wait", untilMs: 1000 });
		expect(
			pendingLaunchOutcome({ ...base, answeredAtMs: null, nowMs: 1000 }),
		).toEqual({ kind: "release" });
	});

	it("times the wait from the host's first answer when that comes after provisioning", () => {
		expect(
			pendingLaunchOutcome({ ...base, answeredAtMs: 500, nowMs: 550 }),
		).toEqual({ kind: "wait", untilMs: 600 });
	});

	it("releases a pane with no promised terminal id, which nothing can match", () => {
		expect(pendingLaunchOutcome({ ...base, terminalId: undefined })).toEqual({
			kind: "release",
		});
	});

	it("a terminal launch becomes its terminal once the box starts it", () => {
		const terminal = { ...base, surface: "terminal" as const };
		expect(pendingLaunchOutcome(terminal)).toEqual({
			kind: "wait",
			untilMs: 100,
		});
		expect(pendingLaunchOutcome({ ...terminal, terminalBinding: {} })).toEqual({
			kind: "terminal",
		});
	});

	it("a terminal launch that never arrives drops its pane instead of opening a chat", () => {
		const terminal = { ...base, surface: "terminal" as const };
		expect(pendingLaunchOutcome({ ...terminal, nowMs: 100 })).toEqual({
			kind: "drop",
		});
		expect(
			pendingLaunchOutcome({ ...terminal, terminalId: undefined }),
		).toEqual({ kind: "drop" });
	});

	it("a terminal launch attaches as soon as its terminal is listed, before any agent binding", () => {
		const terminal = { ...base, surface: "terminal" as const };
		expect(pendingLaunchOutcome({ ...terminal, terminalListed: true })).toEqual(
			{
				kind: "terminal",
			},
		);
	});

	it("an agent that already ended still attaches instead of waiting out the timeout", () => {
		expect(
			pendingLaunchOutcome({
				...base,
				terminalBinding: { chatSessionId: null },
			}),
		).toEqual({ kind: "terminal" });
	});

	it("a listed terminal does not resolve a chat launch, whose id belongs to the chat runtime", () => {
		expect(pendingLaunchOutcome({ ...base, terminalListed: true })).toEqual({
			kind: "wait",
			untilMs: 100,
		});
	});
});
