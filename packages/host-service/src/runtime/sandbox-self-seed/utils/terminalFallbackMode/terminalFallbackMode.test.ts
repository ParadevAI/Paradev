import { describe, expect, it } from "bun:test";
import { terminalFallbackMode } from "./terminalFallbackMode";

describe("terminalFallbackMode", () => {
	it("drops an unset mode and the full-access default", () => {
		expect(terminalFallbackMode("codex", undefined)).toBeUndefined();
		expect(terminalFallbackMode("codex", "agent-full-access")).toBeUndefined();
		expect(terminalFallbackMode("claude", "bypassPermissions")).toBeUndefined();
	});

	it("refuses a narrower mode instead of widening it", () => {
		expect(() => terminalFallbackMode("codex", "read-only")).toThrow(
			'codex chat mode "read-only" has no terminal equivalent',
		);
		expect(() => terminalFallbackMode("claude", "plan")).toThrow();
	});
});
