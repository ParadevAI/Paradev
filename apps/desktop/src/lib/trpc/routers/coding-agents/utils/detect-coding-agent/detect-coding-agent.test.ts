import { describe, expect, test } from "bun:test";
import {
	type DetectCodingAgentDeps,
	detectCodingAgent,
} from "./detect-coding-agent";

function deps(
	executables: string[],
	run: DetectCodingAgentDeps["run"] = async () => ({
		code: 0,
		stdout: "2.1.322 (Claude Code)\n",
	}),
): DetectCodingAgentDeps & { calls: string[][] } {
	const calls: string[][] = [];
	return {
		calls,
		userPath: async () => "/home/u/.paradev/bin:/opt/homebrew/bin:/usr/bin",
		wrapperDirs: ["/home/u/.paradev/bin"],
		managedPath: "/home/u/.local/bin/claude",
		isExecutable: (file) => executables.includes(file),
		run: async (command, args) => {
			calls.push([command, ...args]);
			return run(command, args);
		},
	};
}

describe("detectCodingAgent", () => {
	test("an install on the user's PATH wins over the app's copy", async () => {
		const status = await detectCodingAgent(
			"claude",
			{ signIn: false },
			deps(["/opt/homebrew/bin/claude", "/home/u/.local/bin/claude"]),
		);
		expect(status).toMatchObject({
			installed: true,
			source: "path",
			path: "/opt/homebrew/bin/claude",
			version: "2.1.322",
		});
	});

	test("skips the wrapper dir, then finds the app's own copy", async () => {
		const status = await detectCodingAgent(
			"claude",
			{ signIn: false },
			deps(["/home/u/.paradev/bin/claude", "/home/u/.local/bin/claude"]),
		);
		expect(status.source).toBe("paradev");
		expect(status.path).toBe("/home/u/.local/bin/claude");
	});

	test("runs nothing when the agent is missing", async () => {
		const d = deps([]);
		const status = await detectCodingAgent("codex", { signIn: true }, d);
		expect(status.installed).toBe(false);
		expect(d.calls).toEqual([]);
	});

	test("reads Claude Code's sign-in only when asked", async () => {
		const d = deps(["/usr/bin/claude"], async (_command, args) =>
			args[0] === "auth"
				? {
						code: 0,
						stdout: JSON.stringify({ loggedIn: true, email: "a@b.co" }),
					}
				: { code: 0, stdout: "2.1.322" },
		);
		expect(
			await detectCodingAgent("claude", { signIn: false }, d),
		).toMatchObject({ signedIn: null });
		expect(d.calls.some((call) => call.includes("auth"))).toBe(false);
		expect(
			await detectCodingAgent("claude", { signIn: true }, d),
		).toMatchObject({ signedIn: true, account: "a@b.co" });
	});

	test("reads a non-zero codex login status as signed out", async () => {
		const d = deps(["/usr/bin/codex"], async (_command, args) =>
			args[0] === "login"
				? { code: 1, stdout: "Not logged in" }
				: { code: 0, stdout: "codex-cli 0.167.0" },
		);
		expect(await detectCodingAgent("codex", { signIn: true }, d)).toMatchObject(
			{ installed: true, version: "0.167.0", signedIn: false },
		);
	});
});
