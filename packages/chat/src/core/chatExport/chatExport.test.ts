import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import type { DurableEnvelope, DurableEvent } from "../../protocol/envelope";
import {
	buildChatExport,
	chatExportFilename,
	chatExportMarkdown,
	chatExportZip,
	readAllEnvelopes,
} from "./chatExport";

const T0 = Date.UTC(2026, 9, 27, 9, 0, 0);

function fixtureEnvelopes(): DurableEnvelope[] {
	const events: DurableEvent[] = [
		{
			type: "session",
			session: {
				status: "idle",
				harness: "claude-acp",
				title: "Fix the login bug",
				modelId: "opus",
				harnessSessionId: "agent-1",
			},
		},
		{
			type: "item",
			turnId: "t1",
			item: {
				id: "u1",
				kind: "user_message",
				startedAtMs: T0,
				content: [
					{ type: "text", text: "Fix the login redirect" },
					{ type: "text", text: "hidden context", hidden: true },
				],
			},
		},
		{
			type: "item",
			turnId: "t1",
			item: {
				id: "c1",
				kind: "tool_call",
				startedAtMs: T0 + 1_000,
				title: "Edit src/login.ts",
				toolKind: "edit",
				toolName: "Edit",
				status: "completed",
				content: [
					{
						type: "diff",
						path: "src/login.ts",
						oldText: "a\nredirect('/')\nc",
						newText: "a\nredirect(next)\nc",
					},
				],
			},
		},
		{
			type: "item",
			turnId: "t1",
			item: {
				id: "a1",
				kind: "agent_message",
				startedAtMs: T0 + 2_000,
				text: "Done: it now redirects to `next`.",
			},
		},
	];
	return events.map((event, index) => ({
		v: 1,
		sessionId: "chat-1",
		cursor: { epoch: "e1", seq: index + 1 },
		ts: T0 + index,
		event,
	}));
}

describe("chat export", () => {
	test("the transcript has a heading per message, one-line tool calls and fenced diffs", () => {
		const exported = buildChatExport(
			{
				sessionId: "chat-1",
				title: null,
				harness: "claude-acp",
				harnessSessionId: null,
			},
			fixtureEnvelopes(),
			new Date(T0 + 60_000),
		);

		expect(chatExportMarkdown(exported)).toBe(
			[
				"# Fix the login bug",
				"",
				"- Agent: claude\n- Model: opus\n- Exported: `2026-10-27T09:01:00.000Z`",
				"",
				"## User `2026-10-27T09:00:00.000Z`",
				"",
				"Fix the login redirect",
				"",
				"## Assistant `2026-10-27T09:00:01.000Z`",
				"",
				"- Tool: Edit src/login.ts (completed)",
				"",
				"```diff\n--- src/login.ts\n+++ src/login.ts\n@@ -2,1 +2,1 @@\n-redirect('/')\n+redirect(next)\n```",
				"",
				"## Assistant `2026-10-27T09:00:02.000Z`",
				"",
				"Done: it now redirects to `next`.",
				"",
			].join("\n"),
		);
		const files = unzipSync(chatExportZip(exported));
		expect(Object.keys(files).sort()).toEqual(["chat.json", "transcript.md"]);
		expect(
			JSON.parse(strFromU8(files["chat.json"] ?? new Uint8Array())),
		).toEqual(JSON.parse(JSON.stringify(exported)));
	});

	test("the filename slugs the title and falls back for an empty one", () => {
		const date = new Date(T0);
		expect(chatExportFilename("  Fix: Café login / redirect! ", date)).toBe(
			"superset-chat-fix-cafe-login-redirect-2026-10-27.zip",
		);
		expect(chatExportFilename("ログインを直す", date, "md")).toBe(
			"superset-chat-ログインを直す-2026-10-27.md",
		);
		expect(chatExportFilename("", date)).toBe(
			"superset-chat-untitled-2026-10-27.zip",
		);
	});

	test("reading pages backwards returns the history oldest first", async () => {
		const envelopes = fixtureEnvelopes();
		const read = await readAllEnvelopes(async (before) =>
			before
				? { ok: true, envelopes: envelopes.slice(0, 2), nextBefore: null }
				: {
						ok: true,
						envelopes: envelopes.slice(2),
						nextBefore: { epoch: "e1", seq: 3 },
					},
		);
		expect(read.map((envelope) => envelope.cursor.seq)).toEqual([1, 2, 3, 4]);
	});
});
