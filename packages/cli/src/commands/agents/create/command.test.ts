import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import createAgentCommand from "./command";

let runInput: Record<string, unknown> | undefined;
let transcriptInput: Record<string, unknown> | undefined;
let transcriptText = "";
let transcriptFails = false;
let bindings: Array<Record<string, unknown>> = [];
let splitInput: Record<string, unknown> | undefined;
let splitError: Error | null = null;
let killInput: Record<string, unknown> | undefined;
let killError: Error | null = null;
const callerTerminalId = process.env.SUPERSET_TERMINAL_ID;

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

withLocalHostService("org-1", {
	"workspace.list": () => [{ id: WORKSPACE_ID }],
	"terminal.transcript": (input) => {
		transcriptInput = input;
		if (transcriptFails) throw new Error("host unreachable");
		return { text: transcriptText, source: "stream", streamBytes: 42 };
	},
	"terminalAgents.listByWorkspace": () => bindings,
	"settings.agentConfigs.list": () => [
		{ id: "config-1", presetId: "claude", label: "Claude" },
	],
	"panes.list": () => ({
		paneId: null,
		tabId: null,
		layout: {
			activeTabId: "tab-1",
			tabs: [
				{
					id: "tab-1",
					title: null,
					active: true,
					activePaneId: "pane-caller",
					layout: { type: "pane", paneId: "pane-caller" },
					panes: [
						{
							id: "pane-caller",
							kind: "terminal",
							title: null,
							terminalId: "terminal-caller",
							active: true,
						},
					],
				},
			],
		},
	}),
	"panes.split": (input) => {
		splitInput = input;
		if (splitError) throw splitError;
		return {
			paneId: "pane-new",
			tabId: "tab-1",
			layout: { activeTabId: null, tabs: [] },
		};
	},
	"terminal.killSession": (input) => {
		killInput = input;
		if (killError) throw killError;
		return { success: true };
	},
	"agents.run": (input) => {
		runInput = input;
		return { kind: "terminal", sessionId: "terminal-1", label: "Codex" };
	},
});

function invoke(
	effort?: string,
	overrides: Record<string, unknown> = { prompt: "Review this diff" },
) {
	return createAgentCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: {
			workspace: WORKSPACE_ID,
			local: true,
			agent: "codex",
			effort,
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	runInput = undefined;
	transcriptInput = undefined;
	transcriptText = "";
	transcriptFails = false;
	bindings = [];
	splitInput = undefined;
	splitError = null;
	killInput = undefined;
	killError = null;
	if (callerTerminalId === undefined) delete process.env.SUPERSET_TERMINAL_ID;
	else process.env.SUPERSET_TERMINAL_ID = callerTerminalId;
});

describe("agents create", () => {
	test("forwards an explicit model to the host", async () => {
		await invoke(undefined, {
			prompt: "Review this diff",
			model: "gpt-5.6-sol",
		});

		expect(runInput).toEqual({
			workspaceId: WORKSPACE_ID,
			agent: "codex",
			prompt: "Review this diff",
			model: "gpt-5.6-sol",
			effort: undefined,
			attachmentIds: undefined,
		});
	});

	test("forwards an explicit reasoning effort to the host", async () => {
		await invoke("xhigh");

		expect(runInput).toEqual({
			workspaceId: WORKSPACE_ID,
			agent: "codex",
			prompt: "Review this diff",
			model: undefined,
			effort: "xhigh",
			attachmentIds: undefined,
		});
	});

	test("leaves effort unset so the agent uses its own default", async () => {
		await invoke();

		expect(runInput).toEqual({
			workspaceId: WORKSPACE_ID,
			agent: "codex",
			prompt: "Review this diff",
			model: undefined,
			effort: undefined,
			attachmentIds: undefined,
		});
	});

	test("resumes a previous session without a prompt", async () => {
		await invoke(undefined, { resumeSession: "abc-123" });

		expect(runInput).toEqual({
			workspaceId: WORKSPACE_ID,
			agent: "codex",
			prompt: "",
			resumeSessionId: "abc-123",
			model: undefined,
			effort: undefined,
			attachmentIds: undefined,
		});
	});

	test("forks a previous session without a prompt", async () => {
		await invoke(undefined, { forkSession: "thread-source" });

		expect(runInput).toEqual({
			workspaceId: WORKSPACE_ID,
			agent: "codex",
			prompt: "",
			forkSessionId: "thread-source",
			effort: undefined,
			attachmentIds: undefined,
		});
	});

	test("rejects combining resume and fork", async () => {
		await expect(
			invoke(undefined, {
				resumeSession: "thread-source",
				forkSession: "thread-source",
			}),
		).rejects.toThrow(/Choose one session operation/);
		expect(runInput).toBeUndefined();
	});

	test("rejects a launch with no prompt or session operation", async () => {
		await expect(invoke(undefined, {})).rejects.toThrow(/Missing --prompt/);
		expect(runInput).toBeUndefined();
	});

	test("seeds the launch with the source terminal's context", async () => {
		transcriptText = "$ bun test\n42 pass";
		bindings = [
			{
				terminalId: "terminal-source",
				agentId: "claude",
				definitionId: null,
				agentSessionId: "session-1",
			},
		];

		await invoke(undefined, { fromTerminal: "terminal-source" });

		expect(transcriptInput).toEqual({
			workspaceId: WORKSPACE_ID,
			terminalId: "terminal-source",
		});
		const prompt = String(runInput?.prompt);
		expect(prompt).toContain(
			"Continue the work from a previous Claude terminal session.",
		);
		expect(prompt).toContain("Source terminal: terminal-source");
		expect(prompt).toContain("$ bun test\n42 pass");
	});

	test("hands off from a terminal with no agent binding", async () => {
		transcriptText = "some shell output";

		await invoke(undefined, { fromTerminal: "terminal-source" });

		expect(String(runInput?.prompt)).toContain(
			"Continue the work from a previous terminal session.",
		);
	});

	test("fails when the source terminal has no output yet", async () => {
		transcriptText = "";

		await expect(
			invoke(undefined, { fromTerminal: "terminal-source" }),
		).rejects.toThrow(/has no output to hand off yet/);
		expect(runInput).toBeUndefined();
	});

	test("reports a failed read separately from an empty terminal", async () => {
		transcriptFails = true;

		await expect(
			invoke(undefined, { fromTerminal: "terminal-source" }),
		).rejects.toThrow(/Couldn't read terminal terminal-source/);
		expect(runInput).toBeUndefined();
	});

	test("rejects combining a handoff with an explicit prompt", async () => {
		await expect(
			invoke(undefined, {
				fromTerminal: "terminal-source",
				prompt: "do the thing",
			}),
		).rejects.toThrow(/builds its own prompt/);
		expect(runInput).toBeUndefined();
	});

	test("rejects combining a handoff with a fork", async () => {
		await expect(
			invoke(undefined, {
				fromTerminal: "terminal-source",
				forkSession: "thread-source",
			}),
		).rejects.toThrow(/Choose one session operation/);
		expect(runInput).toBeUndefined();
	});

	test("--split shows the agent in a new pane beside the caller's pane", async () => {
		process.env.SUPERSET_TERMINAL_ID = "terminal-caller";
		await invoke(undefined, { prompt: "Review this diff", split: "right" });
		expect(splitInput).toEqual({
			workspaceId: WORKSPACE_ID,
			paneId: "pane-caller",
			direction: "right",
			terminalId: "terminal-1",
		});
	});

	test("--split ends the agent when the desktop rejects the split", async () => {
		process.env.SUPERSET_TERMINAL_ID = "terminal-caller";
		splitError = new Error("pane is gone");
		await expect(
			invoke(undefined, { prompt: "Review this diff", split: "right" }),
		).rejects.toThrow("pane is gone");
		expect(killInput).toEqual({
			workspaceId: WORKSPACE_ID,
			terminalId: "terminal-1",
		});
	});

	test("--split names the agent's terminal when ending it fails too", async () => {
		process.env.SUPERSET_TERMINAL_ID = "terminal-caller";
		splitError = new Error("pane is gone");
		killError = new Error("host busy");
		await expect(
			invoke(undefined, { prompt: "Review this diff", split: "right" }),
		).rejects.toThrow(/terminal terminal-1 is still running/);
	});

	test("--split with an unknown --pane fails before launching the agent", async () => {
		await expect(
			invoke(undefined, {
				prompt: "Review this diff",
				split: "down",
				pane: "pane-gone",
			}),
		).rejects.toThrow("No pane pane-gone");
		expect(runInput).toBeUndefined();
	});
});
