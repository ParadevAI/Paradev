import { describe, expect, it } from "bun:test";
import { resolveAgentCliUpdate } from "./agentCliUpdate";

function update(
	binary: string,
	path: string,
	realPath: string,
	options: { writable?: boolean; exists?: boolean } = {},
) {
	return resolveAgentCliUpdate({
		binary,
		found: { path, realPath },
		exists: () => options.exists ?? true,
		writable: () => options.writable ?? true,
	});
}

describe("resolveAgentCliUpdate", () => {
	it("updates an npm install into the prefix that owns it", () => {
		expect(
			update(
				"codex",
				"/Users/a/.nvm/versions/node/v25.0.0/bin/codex",
				"/Users/a/.nvm/versions/node/v25.0.0/lib/node_modules/@openai/codex/bin/codex.js",
			),
		).toEqual({
			source: "npm",
			command:
				"npm install -g --prefix /Users/a/.nvm/versions/node/v25.0.0 @openai/codex@latest",
			latest: { kind: "npm", name: "@openai/codex", tag: "latest" },
		});
	});

	it("asks for sudo when the npm prefix is not the user's", () => {
		expect(
			update(
				"codex",
				"/usr/local/bin/codex",
				"/usr/local/lib/node_modules/@openai/codex/bin/codex.js",
				{ writable: false },
			)?.command,
		).toBe("sudo npm install -g --prefix /usr/local @openai/codex@latest");
	});

	it("upgrades the Homebrew cask the binary came from, with that prefix's brew", () => {
		expect(
			update(
				"claude",
				"/opt/homebrew/bin/claude",
				"/opt/homebrew/Caskroom/claude-code@latest/2.1.312/claude",
			),
		).toEqual({
			source: "homebrew",
			command: "/opt/homebrew/bin/brew upgrade --cask claude-code@latest",
			latest: {
				kind: "homebrew",
				name: "claude-code@latest",
				homebrewKind: "cask",
			},
		});
	});

	it("lets native Claude Code update itself, checked against the stable channel", () => {
		expect(
			update(
				"claude",
				"/Users/a/.local/bin/claude",
				"/Users/a/.local/share/claude/versions/2.1.300",
			),
		).toEqual({
			source: "native",
			command: "/Users/a/.local/bin/claude update",
			latest: { kind: "npm", name: "@anthropic-ai/claude-code", tag: "stable" },
		});
	});

	it("goes by where ~/.local/bin/claude leads, not where it sits", () => {
		expect(
			update(
				"claude",
				"/Users/a/.local/bin/claude",
				"/opt/homebrew/Caskroom/claude-code/2.1.312/claude",
			)?.command,
		).toBe("/opt/homebrew/bin/brew upgrade --cask claude-code");
	});

	it("offers no command when the install's own brew or bun is missing", () => {
		const missing = { exists: false };
		expect(
			update(
				"codex",
				"/opt/homebrew/bin/codex",
				"/opt/homebrew/Caskroom/codex/0.166.0/codex",
				missing,
			),
		).toMatchObject({ source: "homebrew", command: null });
		expect(
			update(
				"claude",
				"/Users/a/.bun/bin/claude",
				"/Users/a/.bun/install/global/node_modules/@anthropic-ai/claude-code/cli.js",
				missing,
			),
		).toMatchObject({ source: "bun", command: null });
	});

	it("updates a bun global install with that bun", () => {
		expect(
			update(
				"claude",
				"/Users/a/.bun/bin/claude",
				"/Users/a/.bun/install/global/node_modules/@anthropic-ai/claude-code-darwin-arm64/claude",
			)?.command,
		).toBe("/Users/a/.bun/bin/bun add -g @anthropic-ai/claude-code@latest");
	});

	it("quotes a path the shell would split", () => {
		expect(
			update(
				"claude",
				"/Users/a b/.local/bin/claude",
				"/Users/a b/.local/share/claude/versions/2.1.300",
			)?.command,
		).toBe("'/Users/a b/.local/bin/claude' update");
	});

	it.each([
		["an unrecognised location", "/nix/store/x-codex/bin/codex"],
		[
			"another package's binary",
			"/usr/local/lib/node_modules/codex-wrapper/bin/codex",
		],
		[
			"a Homebrew cask of another name",
			"/opt/homebrew/Caskroom/codex-nightly/1/codex",
		],
	])("offers no command for %s", (_case, realPath) => {
		expect(update("codex", "/usr/local/bin/codex", realPath)).toEqual({
			source: "unknown",
			command: null,
			latest: { kind: "npm", name: "@openai/codex", tag: "latest" },
		});
	});

	it("leaves a cloud workspace's CLI to the image that provides it", () => {
		expect(
			resolveAgentCliUpdate({
				binary: "codex",
				found: {
					path: "/usr/local/bin/codex",
					realPath: "/opt/codex/x/bin/codex",
				},
				runMode: "sandbox",
			}),
		).toEqual({ source: "managed", command: null, latest: null });
	});

	it("has nothing to say for a CLI outside the table", () => {
		expect(
			update(
				"gemini",
				"/opt/homebrew/bin/gemini",
				"/opt/homebrew/Cellar/gemini-cli/1/bin/gemini",
			),
		).toBeNull();
	});
});
