import { afterEach, describe, expect, mock, test } from "bun:test";
import { withLocalHostService } from "../../lib/host/test-helpers";
import { desktopWorkspaceLink } from "../../lib/open-url";
import closeSessionCommand from "./close/command";
import listSessionsCommand from "./list/command";
import openSessionCommand from "./open/command";
import readSessionCommand from "./read/command";
import resumeSessionCommand from "./resume/command";
import sendSessionCommand from "./send/command";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "chat-session-1";

let listInput: Record<string, unknown> | undefined;
let getInput: Record<string, unknown> | undefined;
let readInput: Record<string, unknown> | undefined;
let sendInput: Record<string, unknown> | undefined;
let closeInput: Record<string, unknown> | undefined;
let resumeInput: Record<string, unknown> | undefined;
let procedureError: Error | null = null;
let sessionExists = true;

const terminalCall = mock(() => {
	throw new Error("terminal router must not be called by sessions commands");
});
const agentsRun = mock(() => {
	throw new Error("agents.run must not be called by sessions commands");
});

withLocalHostService("org-1", {
	"workspace.list": () => [{ id: WORKSPACE_ID, name: "ws-1" }],
	"sessions.list": (input) => {
		if (procedureError) throw procedureError;
		listInput = input;
		return [
			{
				sessionId: SESSION_ID,
				scopeId: WORKSPACE_ID,
				harness: "claude-code",
				harnessSessionId: "native-1",
				epoch: "epoch-1",
				status: "idle",
				title: "Fix tests",
				queuedCount: 0,
				updatedAt: 1000,
				live: true,
				terminalId: "term-1",
			},
		];
	},
	"sessions.get": (input) => {
		if (procedureError) throw procedureError;
		getInput = input;
		return {
			session: sessionExists
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
			cursor: sessionExists ? { epoch: "epoch-1", seq: 2 } : null,
			live: sessionExists,
		};
	},
	"sessions.read": (input) => {
		if (procedureError) throw procedureError;
		readInput = input;
		return {
			ok: true,
			envelopes: [
				{
					v: 1,
					sessionId: SESSION_ID,
					cursor: { epoch: "epoch-1", seq: 1 },
					ts: 1000,
					event: {
						type: "item",
						turnId: "turn-1",
						item: {
							id: "item-1",
							kind: "agent_message",
							startedAtMs: 1000,
							text: "All tests pass.",
						},
					},
				},
			],
			nextBefore: null,
		};
	},
	"sessions.send": (input) => {
		if (procedureError) throw procedureError;
		sendInput = input;
		return { itemId: "item-2", queued: false };
	},
	"sessions.close": (input) => {
		if (procedureError) throw procedureError;
		closeInput = input;
		return undefined;
	},
	"sessions.resume": (input) => {
		if (procedureError) throw procedureError;
		resumeInput = input;
		return {
			kind: "chat",
			sessionId: SESSION_ID,
			terminalId: "term-2",
			label: "Claude",
		};
	},
	"agents.run": agentsRun,
	"terminal.list": terminalCall,
	"terminal.snapshot": terminalCall,
	"terminal.send": terminalCall,
	"terminal.killSession": terminalCall,
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
	listInput = undefined;
	getInput = undefined;
	readInput = undefined;
	sendInput = undefined;
	closeInput = undefined;
	resumeInput = undefined;
	procedureError = null;
	sessionExists = true;
	terminalCall.mockClear();
	agentsRun.mockClear();
});

describe("sessions commands", () => {
	test("list queries sessions.list with workspaceId and limit", async () => {
		const result = (await runCommand(listSessionsCommand, { limit: 25 })) as {
			data: unknown[];
		};

		expect(listInput).toEqual({
			workspaceId: WORKSPACE_ID,
			limit: 25,
		});
		expect(result.data).toHaveLength(1);
		expect(terminalCall).not.toHaveBeenCalled();
	});

	test("read queries sessions.read and returns raw PageResult in data", async () => {
		const result = (await runCommand(readSessionCommand, {
			session: SESSION_ID,
			limit: 50,
		})) as { data: { ok: boolean; envelopes: unknown[] }; message: string };

		expect(readInput).toEqual({
			workspaceId: WORKSPACE_ID,
			sessionId: SESSION_ID,
			limit: 50,
		});
		expect(result.data.ok).toBe(true);
		expect(result.data.envelopes).toHaveLength(1);
		expect(result.message).toContain("[agent] All tests pass.");
		expect(terminalCall).not.toHaveBeenCalled();
	});

	test("send mutates sessions.send and rejects empty prompts", async () => {
		await expect(
			runCommand(sendSessionCommand, { session: SESSION_ID, prompt: "   " }),
		).rejects.toThrow(/Missing --prompt/);
		expect(sendInput).toBeUndefined();

		const result = (await runCommand(sendSessionCommand, {
			session: SESSION_ID,
			prompt: "Run the test suite",
		})) as { data: unknown };

		expect(sendInput).toEqual({
			workspaceId: WORKSPACE_ID,
			sessionId: SESSION_ID,
			prompt: "Run the test suite",
		});
		expect(result.data).toEqual({ itemId: "item-2", queued: false });
		expect(terminalCall).not.toHaveBeenCalled();
	});

	test("close mutates sessions.close without calling terminal.killSession", async () => {
		const result = (await runCommand(closeSessionCommand, {
			session: SESSION_ID,
		})) as { data: unknown };

		expect(closeInput).toEqual({
			workspaceId: WORKSPACE_ID,
			sessionId: SESSION_ID,
		});
		expect(result.data).toEqual({ sessionId: SESSION_ID, closed: true });
		expect(terminalCall).not.toHaveBeenCalled();
	});

	test("resume mutates sessions.resume without calling agents.run", async () => {
		const result = (await runCommand(resumeSessionCommand, {
			session: SESSION_ID,
		})) as { data: unknown };

		expect(resumeInput).toEqual({
			workspaceId: WORKSPACE_ID,
			sessionId: SESSION_ID,
		});
		expect(result.data).toEqual({
			kind: "chat",
			sessionId: SESSION_ID,
			terminalId: "term-2",
			label: "Claude",
		});
		expect(agentsRun).not.toHaveBeenCalled();
	});

	test("open validates sessions.get and prints the session deep link", async () => {
		expect(desktopWorkspaceLink(WORKSPACE_ID)).toBe(
			`superset://v2-workspace/${WORKSPACE_ID}`,
		);

		const result = (await runCommand(openSessionCommand, {
			session: SESSION_ID,
			print: true,
		})) as {
			data: { url: string; workspaceId: string; sessionId: string };
			message: string;
		};

		expect(getInput).toEqual({
			workspaceId: WORKSPACE_ID,
			sessionId: SESSION_ID,
		});
		const expectedUrl = `superset://v2-workspace/${WORKSPACE_ID}?sessionId=${SESSION_ID}`;
		expect(result.data).toEqual({
			workspaceId: WORKSPACE_ID,
			sessionId: SESSION_ID,
			url: expectedUrl,
		});
		expect(result.message).toBe(expectedUrl);

		sessionExists = false;
		await expect(
			runCommand(openSessionCommand, { session: "missing-id", print: true }),
		).rejects.toThrow(/Session not found/);
	});

	test("old host missing sessions procedures surfaces update host-service error", async () => {
		procedureError = new Error('No procedure found on path "sessions.list"');
		await expect(runCommand(listSessionsCommand, {})).rejects.toThrow(
			/update host-service/i,
		);

		procedureError = new Error('No procedure found on path "sessions.send"');
		await expect(
			runCommand(sendSessionCommand, {
				session: SESSION_ID,
				prompt: "Hello",
			}),
		).rejects.toThrow(/update host-service/i);
	});
});
