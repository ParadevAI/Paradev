import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import createSessionCommand from "./command";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const tempDir = mkdtempSync(join(tmpdir(), "superset-sessions-create-"));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

let createInput: Record<string, unknown> | undefined;
let createError: Error | null = null;
const uploadedFiles: Array<Record<string, unknown>> = [];
const agentsRun = mock(() => ({
	kind: "terminal",
	sessionId: "term-fallback",
	label: "Claude",
}));
const terminalCreate = mock(() => ({ terminalId: "term-1" }));

withLocalHostService("org-1", {
	"workspace.list": () => [{ id: WORKSPACE_ID, name: "ws-1" }],
	"attachments.upload": (input) => {
		uploadedFiles.push(input);
		return { attachmentId: `uploaded-${uploadedFiles.length}` };
	},
	"sessions.create": (input) => {
		if (createError) throw createError;
		createInput = input;
		return {
			kind: "chat",
			sessionId: "chat-1",
			terminalId: "term-chat-1",
			label: "Claude",
		};
	},
	"agents.run": agentsRun,
	"terminal.createSession": terminalCreate,
});

function invoke(overrides: Record<string, unknown> = {}) {
	return createSessionCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: {
			workspace: WORKSPACE_ID,
			local: true,
			agent: "claude",
			prompt: "Review this diff",
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	createInput = undefined;
	createError = null;
	uploadedFiles.length = 0;
	agentsRun.mockClear();
	terminalCreate.mockClear();
});

describe("sessions create", () => {
	test("creates a chat session via sessions.create without calling agents.run or terminal", async () => {
		const result = (await invoke({
			model: "claude-sonnet-5",
			mode: "plan",
		})) as { data: unknown; message: string };

		expect(createInput).toEqual({
			workspaceId: WORKSPACE_ID,
			agent: "claude",
			prompt: "Review this diff",
			model: "claude-sonnet-5",
			mode: "plan",
			resumeSessionId: undefined,
			continueSessionId: undefined,
			attachmentIds: undefined,
		});
		expect(result.data).toEqual({
			kind: "chat",
			sessionId: "chat-1",
			terminalId: "term-chat-1",
			label: "Claude",
		});
		expect(agentsRun).not.toHaveBeenCalled();
		expect(terminalCreate).not.toHaveBeenCalled();
	});

	test("forwards native --resume-session and --continue-session and rejects combining both", async () => {
		await invoke({ prompt: undefined, resumeSession: "native-sess-1" });
		expect(createInput).toEqual({
			workspaceId: WORKSPACE_ID,
			agent: "claude",
			prompt: undefined,
			model: undefined,
			mode: undefined,
			resumeSessionId: "native-sess-1",
			continueSessionId: undefined,
			attachmentIds: undefined,
		});

		await invoke({ prompt: "Follow up", continueSession: "chat-existing" });
		expect(createInput).toEqual({
			workspaceId: WORKSPACE_ID,
			agent: "claude",
			prompt: "Follow up",
			model: undefined,
			mode: undefined,
			resumeSessionId: undefined,
			continueSessionId: "chat-existing",
			attachmentIds: undefined,
		});

		await expect(
			invoke({
				resumeSession: "native-sess-1",
				continueSession: "chat-existing",
			}),
		).rejects.toThrow(/Choose one session operation/);
	});

	test("uploads --attachment files and merges them with --attachment-id", async () => {
		const attachmentPath = join(tempDir, "notes.md");
		writeFileSync(attachmentPath, "# Notes\n");

		await invoke({
			attachmentId: ["pre-1"],
			attachment: [attachmentPath],
		});

		expect(uploadedFiles).toHaveLength(1);
		expect(uploadedFiles[0]).toMatchObject({
			originalFilename: "notes.md",
			mediaType: "text/markdown",
		});
		expect(createInput?.attachmentIds).toEqual(["pre-1", "uploaded-1"]);
	});

	test("surfaces an actionable update host-service error on an old host without falling back to agents.run", async () => {
		createError = new Error('No procedure found on path "sessions.create"');

		await expect(invoke()).rejects.toThrow(/update host-service/i);
		expect(agentsRun).not.toHaveBeenCalled();
		expect(terminalCreate).not.toHaveBeenCalled();
	});
});
