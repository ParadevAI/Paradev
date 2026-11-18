import { describe, expect, test } from "bun:test";
import { parseForkTarget, parseSwitch, splitInvocation } from "./commandArgs";

describe("commandArgs", () => {
	test("splits a typed command into its name and the rest", () => {
		expect(splitInvocation("  /Fork  worktree ")).toEqual({
			name: "fork",
			args: "worktree",
		});
		expect(splitInvocation("/automation check CI\nevery morning")).toEqual({
			name: "automation",
			args: "check CI\nevery morning",
		});
		expect(splitInvocation("hello /fork")).toBeNull();
	});

	test("reads on and off, flips on no argument, and refuses anything else", () => {
		expect(parseSwitch("", false)).toBe(true);
		expect(parseSwitch("", true)).toBe(false);
		expect(parseSwitch("ON", false)).toBe(true);
		expect(parseSwitch("off", false)).toBe(false);
		expect(parseSwitch("faster", false)).toBeNull();
	});

	test("maps here and worktree to the targets offered, defaulting to the first", () => {
		expect(parseForkTarget("", ["workspace", "worktree"])).toBe("workspace");
		expect(parseForkTarget("worktree", ["workspace", "worktree"])).toBe(
			"worktree",
		);
		expect(parseForkTarget("worktree", ["workspace"])).toBeNull();
		expect(parseForkTarget("elsewhere", ["workspace", "worktree"])).toBeNull();
	});
});
