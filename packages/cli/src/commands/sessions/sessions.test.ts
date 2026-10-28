import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { withLocalHostService } from "../../lib/host/test-helpers";
import exportSessionCommand from "./export/command";
import listSessionsCommand from "./list/command";
import openSessionCommand from "./open/command";
import readSessionCommand from "./read/command";
import renameSessionCommand from "./rename/command";
import sendSessionCommand from "./send/command";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "chat-session-1";

let readInput: Record<string, unknown> | undefined;
let sendInput: Record<string, unknown> | undefined;
let renameInput: Record<string, unknown> | undefined;
let procedureError: Error | null = null;

function exportEnvelope(seq: number, event: Record<string, unknown>) {
	return {
		v: 1,
		sessionId: SESSION_ID,
		cursor: { epoch: "epoch-1", seq },
		ts: seq,
		event,
	};
}

const EXPORT_PAGES = {
	newest: {
		ok: true,
		envelopes: [
			exportEnvelope(2, {
				type: "item",
				turnId: "t1",
				item: {
					id: "a1",
					kind: "agent_message",
					startedAtMs: 2000,
					text: "Fixed.",
				},
			}),
		],
		nextBefore: { epoch: "epoch-1", seq: 2 },
	},
	oldest: {
		ok: true,
		envelopes: [
			exportEnvelope(1, {
				type: "item",
				turnId: "t1",
				item: {
					id: "u1",
					kind: "user_message",
					startedAtMs: 1000,
					content: [{ type: "text", text: "Fix the tests" }],
				},
			}),
		],
		nextBefore: null,
	},
};

withLocalHostService("org-1", {
	"workspace.list": () => [{ id: WORKSPACE_ID, name: "ws-1" }],
	"sessions.list": () => {
		if (procedureError) throw procedureError;
		return [];
	},
	"sessions.get": (input) => ({
		session:
			input.sessionId === SESSION_ID
				? {
						sessionId: SESSION_ID,
						scopeId: WORKSPACE_ID,
						harness: "claude-code",
						harnessSessionId: "native-1",
						epoch: "epoch-1",
						status: "idle",
						title: "Fix tests",
						queuedCount: 0,
						updatedAt: 1000,
					}
				: null,
		cursor: null,
		live: input.sessionId === SESSION_ID,
	}),
	"sessions.read": (input) => {
		readInput = input;
		if (input.limit === 500)
			return input.before ? EXPORT_PAGES.oldest : EXPORT_PAGES.newest;
		return { ok: true, envelopes: [], nextBefore: null };
	},
	"sessions.rename": (input) => {
		renameInput = input;
		return { title: (input.title as string | undefined) ?? "Generated title" };
	},
	"sessions.resume": (input) => ({
		kind: "chat",
		sessionId: input.sessionId === SESSION_ID ? SESSION_ID : "chat-resumed",
		terminalId: "term-1",
		label: "claude",
	}),
	"sessions.send": (input) => {
		sendInput = input;
		return { itemId: "item-2", queued: false };
	},
});

function runCommand(
	cmd: { run: (ctx: never) => Promise<unknown> },
	options: Record<string, unknown>,
) {
	return cmd.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		},
		args: {},
		options: {
			workspace: WORKSPACE_ID,
			local: true,
			...options,
		},
		signal: new AbortController().signal,
	} as never);
}

afterEach(() => {
	readInput = undefined;
	sendInput = undefined;
	renameInput = undefined;
	procedureError = null;
});

describe("sessions commands", () => {
	test("read parses a JSON --before cursor and rejects a malformed one before calling the host", async () => {
		for (const before of ["epoch-1:3", '{"epoch":"","seq":3}', '{"seq":-1}'])
			await expect(
				runCommand(readSessionCommand, { session: SESSION_ID, before }),
			).rejects.toThrow(/Invalid --before cursor/);
		expect(readInput).toBeUndefined();

		await runCommand(readSessionCommand, {
			session: SESSION_ID,
			before: '{"epoch":"epoch-1","seq":3}',
		});
		expect(readInput?.before).toEqual({ epoch: "epoch-1", seq: 3 });
	});

	test("send rejects a whitespace-only prompt before calling the host", async () => {
		await expect(
			runCommand(sendSessionCommand, { session: SESSION_ID, prompt: "   " }),
		).rejects.toThrow(/Missing --prompt/);
		expect(sendInput).toBeUndefined();
	});

	test("send resumes a stopped chat and sends to the session it resumed into", async () => {
		const result = (await runCommand(sendSessionCommand, {
			session: "chat-stopped",
			prompt: "Continue",
		})) as { data: { sessionId: string } };
		expect(sendInput?.sessionId).toBe("chat-resumed");
		expect(result.data.sessionId).toBe("chat-resumed");
	});

	test("open prints the session deep link and rejects an unknown session", async () => {
		const result = (await runCommand(openSessionCommand, {
			session: SESSION_ID,
			print: true,
		})) as { message: string };
		expect(result.message).toBe(
			`superset://v2-workspace/${WORKSPACE_ID}?sessionId=${SESSION_ID}`,
		);

		await expect(
			runCommand(openSessionCommand, { session: "missing-id", print: true }),
		).rejects.toThrow(/Session not found/);
	});

	test("export reads every page and writes a zip or a markdown transcript", async () => {
		const dir = mkdtempSync(join(tmpdir(), "sessions-export-"));
		try {
			const zipPath = join(dir, "chat.zip");
			await runCommand(exportSessionCommand, {
				session: SESSION_ID,
				out: zipPath,
			});
			const files = unzipSync(readFileSync(zipPath));
			const chat = JSON.parse(
				strFromU8(files["chat.json"] ?? new Uint8Array()),
			);
			expect(chat.chat.title).toBe("Fix tests");
			expect(
				chat.messages.map((message: { role: string }) => message.role),
			).toEqual(["user", "assistant"]);

			const mdPath = join(dir, "chat.md");
			await runCommand(exportSessionCommand, {
				session: SESSION_ID,
				out: mdPath,
				format: "md",
			});
			expect(readFileSync(mdPath, "utf8")).toContain(
				"## User `1970-01-01T00:00:01.000Z`\n\nFix the tests\n\n## Assistant `1970-01-01T00:00:02.000Z`\n\nFixed.",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("rename sends a trimmed title, nothing to regenerate, and rejects a blank one", async () => {
		await runCommand(renameSessionCommand, {
			session: SESSION_ID,
			title: " Tests ",
		});
		expect(renameInput?.title).toBe("Tests");
		const result = (await runCommand(renameSessionCommand, {
			session: SESSION_ID,
		})) as { data: { title: string } };
		expect(renameInput && "title" in renameInput).toBe(false);
		expect(result.data.title).toBe("Generated title");
		renameInput = undefined;
		await expect(
			runCommand(renameSessionCommand, { session: SESSION_ID, title: "  " }),
		).rejects.toThrow(/Missing --title/);
		expect(renameInput).toBeUndefined();
	});

	test("old host missing sessions procedures surfaces update host-service error", async () => {
		procedureError = new Error('No procedure found on path "sessions.list"');
		await expect(runCommand(listSessionsCommand, {})).rejects.toThrow(
			/update host-service/i,
		);
	});
});
