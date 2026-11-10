import { describe, expect, it } from "bun:test";
import {
	getTerminalDisplayTitle,
	getTerminalSessionListRefetchInterval,
	getTerminalSessionListStaleTime,
	shouldQueryTerminalSessionList,
	TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS,
} from "./TerminalSessionDropdown.utils";

describe("TerminalSessionDropdown query policy", () => {
	it("does not query or poll while closed", () => {
		expect(shouldQueryTerminalSessionList(false, false)).toBe(false);
		expect(getTerminalSessionListRefetchInterval(false)).toBe(false);
	});

	it("queries and polls while open", () => {
		expect(shouldQueryTerminalSessionList(true, false)).toBe(true);
		expect(getTerminalSessionListRefetchInterval(true)).toBe(
			TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS,
		);
	});

	it("reads an agent session's name without polling, and keeps it while closed", () => {
		expect(shouldQueryTerminalSessionList(false, true)).toBe(true);
		expect(getTerminalSessionListRefetchInterval(false)).toBe(false);
		expect(getTerminalSessionListStaleTime(false)).toBeGreaterThan(
			getTerminalSessionListStaleTime(true),
		);
	});

	it("keeps closed dropdowns cold under tab churn", () => {
		for (let i = 0; i < 10_000; i++) {
			expect(shouldQueryTerminalSessionList(false, false)).toBe(false);
			expect(getTerminalSessionListRefetchInterval(false)).toBe(false);
		}
	});
});

describe("getTerminalDisplayTitle", () => {
	it("prefers explicit pane title overrides over runtime titles", () => {
		expect(
			getTerminalDisplayTitle({
				titleOverride: "echo sequence",
				runtimeTitle: "Terminal",
				sessionTitle: "zsh",
			}),
		).toBe("echo sequence");
	});

	it("names an agent session after the agent, not its launch command", () => {
		expect(
			getTerminalDisplayTitle({
				agentLabel: "Claude",
				runtimeTitle: "claude --dangerously-skip-permissions -c",
			}),
		).toBe("Claude");
		expect(
			getTerminalDisplayTitle({
				customTitle: "review bot",
				agentLabel: "Claude",
				runtimeTitle: "claude -c",
			}),
		).toBe("review bot");
	});

	it("falls back through runtime, session, and default titles", () => {
		expect(getTerminalDisplayTitle({ runtimeTitle: "vim" })).toBe("vim");
		expect(getTerminalDisplayTitle({ sessionTitle: "zsh" })).toBe("zsh");
		expect(getTerminalDisplayTitle({})).toBe("Terminal");
	});
});
