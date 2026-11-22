import { expect, test } from "bun:test";
import type { Item } from "@superset/chat/protocol";
import { collectChatPullRequests } from "./collectChatPullRequests";

test("collects cross-repository PRs and deduplicates repeated links", () => {
	const items = [
		{
			kind: "agent_message",
			text: "[#4554](https://github.com/wix-private/mcp-servers/pull/4554) and https://github.com/wix-private/remote-coding-agents/pull/2952",
		},
		{
			kind: "user_message",
			content: [
				{
					type: "text",
					text: "https://github.com/WIX-PRIVATE/MCP-SERVERS/pull/4554/files",
				},
			],
		},
		{ kind: "tool_call", title: "https://github.com/other/repo/pull/1" },
	] as Item[];
	expect(collectChatPullRequests(items)).toEqual([
		{ repoFullName: "wix-private/mcp-servers", number: 4554 },
		{ repoFullName: "wix-private/remote-coding-agents", number: 2952 },
	]);
});

test("ignores hidden prompts, discarded messages, issues and malformed PR numbers", () => {
	expect(
		collectChatPullRequests([
			{
				kind: "user_message",
				discarded: true,
				content: [{ type: "text", text: "https://github.com/a/b/pull/1" }],
			},
			{
				kind: "user_message",
				content: [
					{ type: "text", hidden: true, text: "https://github.com/a/b/pull/2" },
				],
			},
			{
				kind: "agent_message",
				text: "https://github.com/a/b/issues/3 https://github.com/a/b/pull/4oops",
			},
		] as Item[]),
	).toEqual([]);
});
