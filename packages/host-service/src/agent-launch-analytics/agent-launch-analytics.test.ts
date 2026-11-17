import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../types";
import {
	agentLaunchProperties,
	commandBaseName,
	isCommandOnBox,
	parseLaunchSource,
	trackAgentLaunched,
	withLaunchSource,
} from "./agent-launch-analytics";

const LOCAL = { source: undefined, runMode: "local", commandFound: true };

const SECRET_COMMAND =
	'OPENAI_API_KEY="sk-secret-1 sk-secret-0" /opt/private-tools/aider --api-key sk-secret-2';

describe("agentLaunchProperties", () => {
	test("a built-in agent reports its id and no command name", () => {
		expect(
			agentLaunchProperties(
				{ presetId: "claude", command: "claude", kind: "chat", resumed: false },
				LOCAL,
			),
		).toEqual({
			agent_id: "claude",
			surface: "chat",
			session_kind: "chat",
			host_kind: "local",
			command_found: true,
			resumed: false,
		});
	});

	test("a custom agent reports only the base name of its command", () => {
		const properties = agentLaunchProperties(
			{
				presetId: "custom",
				command: SECRET_COMMAND,
				kind: "terminal",
				resumed: false,
			},
			LOCAL,
		);
		expect(properties.agent_id).toBe("custom");
		expect(properties.command_name).toBe("aider");
		const sent = JSON.stringify(properties);
		for (const leak of ["sk-secret", "OPENAI_API_KEY", "private-tools"]) {
			expect(sent).not.toContain(leak);
		}
	});

	test("the caller names the surface, and a sandbox is a cloud host", () => {
		const properties = agentLaunchProperties(
			{ presetId: "codex", command: "codex", kind: "terminal", resumed: true },
			{ source: "automation", runMode: "sandbox", commandFound: false },
		);
		expect(properties).toMatchObject({
			surface: "automation",
			session_kind: "terminal",
			host_kind: "cloud",
			command_found: false,
			resumed: true,
		});
	});
});

describe("commandBaseName", () => {
	test("strips paths, quotes and Windows extensions", () => {
		expect(commandBaseName('"C:\\Tools\\Aider.exe" --yes')).toBe("aider");
		expect(commandBaseName("~/bin/goose run")).toBe("goose");
	});

	test("skips quoted assignments whose values hold spaces", () => {
		expect(commandBaseName('API_TOKEN="abc def" my-agent --x')).toBe(
			"my-agent",
		);
		expect(commandBaseName("API_TOKEN='abc def' B=1 aider")).toBe("aider");
		expect(commandBaseName('TOKEN="a \\" b" aider')).toBe("aider");
	});

	test("fails closed when the words before the program are unclear", () => {
		expect(commandBaseName('API_TOKEN="abc def my-agent')).toBeNull();
		expect(commandBaseName("API_TOKEN='abc def my-agent")).toBeNull();
		expect(commandBaseName("TOKEN=$(cat key) aider")).toBeNull();
		expect(commandBaseName("TOKEN=abc;aider")).toBeNull();
		expect(commandBaseName("TOKEN=abc")).toBeNull();
	});

	test("ignores quotes and operators after the program", () => {
		expect(commandBaseName("aider --msg 'unclosed")).toBe("aider");
		expect(commandBaseName("aider | tee log")).toBe("aider");
	});

	test("drops a name that does not look like a program", () => {
		expect(commandBaseName("")).toBeNull();
		expect(commandBaseName("TOKEN=abc")).toBeNull();
		expect(commandBaseName(`/bin/${"x".repeat(80)}`)).toBeNull();
	});
});

test("parseLaunchSource accepts only known callers", () => {
	expect(parseLaunchSource(" CLI ")).toBe("cli");
	expect(parseLaunchSource("automation")).toBe("automation");
	expect(parseLaunchSource("desktop")).toBeUndefined();
	expect(parseLaunchSource(undefined)).toBeUndefined();
});

describe("isCommandOnBox", () => {
	const dir = mkdtempSync(join(tmpdir(), "agent-launch-"));
	const binDir = join(dir, "bin");
	const toolDir = join(dir, "tools");
	for (const [folder, name] of [
		[binDir, "claude"],
		[toolDir, "aider"],
	] as const) {
		const path = join(folder, name);
		mkdirSync(folder, { recursive: true });
		writeFileSync(path, "#!/bin/sh\n");
		chmodSync(path, 0o755);
	}
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	test("finds a program on PATH", () => {
		expect(isCommandOnBox("aider --yes", { PATH: toolDir }, binDir)).toBe(true);
		expect(isCommandOnBox("missing", { PATH: toolDir }, binDir)).toBe(false);
	});

	test("ignores the Superset wrapper, which exists without the agent", () => {
		expect(isCommandOnBox("claude", { PATH: binDir }, binDir)).toBe(false);
	});

	test("checks a command given as a path directly", () => {
		expect(isCommandOnBox(join(toolDir, "aider"), {}, binDir)).toBe(true);
		expect(isCommandOnBox(join(toolDir, "nope"), {}, binDir)).toBe(false);
	});
});

test("trackAgentLaunched sends no custom agent args or env", async () => {
	const sent: unknown[] = [];
	const api = {
		analytics: {
			captureEvent: {
				mutate: async (input: unknown) => {
					sent.push(input);
					return { ok: true };
				},
			},
		},
	} as unknown as ApiClient;

	withLaunchSource("cli", () =>
		trackAgentLaunched(api, {
			presetId: "custom",
			command: SECRET_COMMAND,
			executable: SECRET_COMMAND,
			env: { ANTHROPIC_API_KEY: "sk-secret-3", PATH: "/nowhere" },
			kind: "terminal",
			resumed: false,
			workspaceId: "ws-1",
		}),
	);

	expect(sent).toHaveLength(1);
	expect(sent[0]).toMatchObject({
		source: "host_service",
		event: "agent_launched",
		properties: {
			agent_id: "custom",
			command_name: "aider",
			surface: "cli",
			command_found: false,
			workspace_id: "ws-1",
		},
	});
	const payload = JSON.stringify(sent[0]);
	for (const leak of [
		"sk-secret",
		"OPENAI_API_KEY",
		"ANTHROPIC_API_KEY",
		"private-tools",
		"/nowhere",
	]) {
		expect(payload).not.toContain(leak);
	}
});
