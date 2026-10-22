import { describe, expect, it } from "bun:test";
import { rehomeClaudeSession } from "./rehome-claude-session";

describe("rehomeClaudeSession", () => {
	it("moves the session's own directory and keeps everything else", () => {
		const content = [
			JSON.stringify({ type: "user", cwd: "/Users/me/repo", n: 1 }),
			"not json",
			JSON.stringify({ type: "summary" }),
			JSON.stringify({ type: "assistant", cwd: "/Users/me/repo/sub", n: 2 }),
			JSON.stringify({ type: "assistant", cwd: "/Users/me/repo", n: 3 }),
			"",
		].join("\n");

		const lines = rehomeClaudeSession(content, "/workspace").split("\n");

		expect(JSON.parse(lines[0] ?? "")).toEqual({
			type: "user",
			cwd: "/workspace",
			n: 1,
		});
		expect(lines[1]).toBe("not json");
		expect(lines[2]).toBe(JSON.stringify({ type: "summary" }));
		expect(JSON.parse(lines[3] ?? "").cwd).toBe("/Users/me/repo/sub");
		expect(JSON.parse(lines[4] ?? "").cwd).toBe("/workspace");
		expect(lines[5]).toBe("");
	});
});
