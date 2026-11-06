import { describe, expect, test } from "bun:test";
import type {
	TerminalAttention,
	TerminalRowData,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { mergeSessionRows } from "./mergeSessionRows";

function row(
	terminalId: string,
	kind: TerminalRowData["kind"],
	ts: number,
	attention: TerminalAttention | null = null,
): TerminalRowData {
	return {
		kind,
		terminalId,
		workspaceId: "workspace-1",
		title: terminalId,
		customTitle: null,
		ts,
		createdAt: ts,
		lastEventAt: null,
		agentId: null,
		definitionId: null,
		attention,
		stopped: null,
	};
}

describe("mergeSessionRows", () => {
	test("a workspace lists its terminals and chats together, newest first", () => {
		const { rowsByWorkspace } = mergeSessionRows(
			new Map([["workspace-1", [row("shell", "terminal", 1)]]]),
			new Map([["workspace-1", [row("chat", "chat", 2)]]]),
		);
		expect(
			rowsByWorkspace.get("workspace-1")?.map((entry) => entry.terminalId),
		).toEqual(["chat", "shell"]);
	});

	test("the workspace's attention is its most urgent session's, from either list", () => {
		const { attentionByWorkspace } = mergeSessionRows(
			new Map([["workspace-1", [row("shell", "terminal", 1, "working")]]]),
			new Map([["workspace-1", [row("chat", "chat", 2, "permission")]]]),
		);
		expect(attentionByWorkspace.get("workspace-1")).toBe("permission");
	});
});
