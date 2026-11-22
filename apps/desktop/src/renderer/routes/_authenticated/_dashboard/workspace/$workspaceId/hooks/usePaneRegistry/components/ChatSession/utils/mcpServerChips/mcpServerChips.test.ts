import { describe, expect, it } from "bun:test";
import {
	findMcpServerTokens,
	mcpContextLine,
	mcpServerChip,
	mcpServerToken,
	resolveMcpServerName,
} from "./mcpServerChips";

describe("mcpServerToken", () => {
	it("adds the scope only when the same agent has another server of that name", () => {
		const user = { name: "docs", agent: "claude", scope: "user" } as const;
		const local = { name: "docs", agent: "claude", scope: "local" } as const;
		const codex = { name: "linear", agent: "codex", scope: "user" } as const;
		const solo = { name: "linear", agent: "claude", scope: "user" } as const;
		const servers = [user, local, codex, solo];

		expect(mcpServerToken(solo, servers)).toBe("@mcp/linear");
		expect(mcpServerToken(local, servers)).toBe("@mcp/local/docs");
	});
});

describe("findMcpServerTokens", () => {
	it("finds whole tokens and leaves trailing punctuation and lookalikes alone", () => {
		const text = "use @mcp/linear. and @mcp/local/docs, not foo@mcp/x";
		expect(findMcpServerTokens(text)).toEqual([
			{ start: 4, end: 15, token: "@mcp/linear", name: "linear" },
			{ start: 21, end: 36, token: "@mcp/local/docs", name: "docs" },
		]);
	});
});

describe("mcpContextLine", () => {
	it("names each server once and is absent without servers", () => {
		expect(mcpContextLine([])).toBeNull();
		expect(mcpContextLine(["linear", "linear", "docs"])).toBe(
			'MCP context: Use the configured MCP servers "linear", "docs" when relevant to this request.',
		);
	});
});

describe("resolveMcpServerName", () => {
	it("names the server a restored chip points at, not the guess from its token", () => {
		const docs = { name: "My Docs", agent: "claude", scope: "user" } as const;
		const guessed = mcpServerChip("My-Docs", "@mcp/My-Docs");

		expect(resolveMcpServerName(guessed, [docs], "claude")).toBe("My Docs");
		expect(resolveMcpServerName(guessed, [], "claude")).toBe("My-Docs");
		expect(
			resolveMcpServerName(
				{ label: "file", serialized: "@a.ts", data: {} },
				[docs],
				"claude",
			),
		).toBeNull();
	});
});
