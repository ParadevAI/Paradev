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
	terminalId: T,
	sessions: [],
	launchedTerminal: false,
	typed: false,
	sinceMs: 0,
	nowMs: 10,
	timeoutMs: 100,
};

describe("pendingLaunchOutcome", () => {
	it("binds only to the live chat under the promised terminal id", () => {
		const own = chat(T);
		expect(
			pendingLaunchOutcome({
				...base,
				sessions: [chat("someone-else"), chat(T, false), own],
			}),
		).toEqual({ kind: "chat", session: own });
	});

	it("becomes the terminal the launch fell back to, unless the user typed", () => {
		expect(pendingLaunchOutcome({ ...base, launchedTerminal: true })).toEqual({
			kind: "terminal",
		});
		expect(
			pendingLaunchOutcome({ ...base, launchedTerminal: true, typed: true }),
		).toEqual({ kind: "release" });
	});

	it("waits until the deadline, then releases", () => {
		expect(pendingLaunchOutcome(base)).toEqual({ kind: "wait", untilMs: 100 });
		expect(pendingLaunchOutcome({ ...base, nowMs: 100 })).toEqual({
			kind: "release",
		});
	});

	it("releases a pane with no promised terminal id, which nothing can match", () => {
		expect(pendingLaunchOutcome({ ...base, terminalId: undefined })).toEqual({
			kind: "release",
		});
	});
});
