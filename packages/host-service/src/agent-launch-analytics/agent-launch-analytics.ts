import { AsyncLocalStorage } from "node:async_hooks";
import { homedir } from "node:os";
import { delimiter } from "node:path";
import { getBinDir } from "@superset/agent-setup";
import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import { isBuiltinAgentId } from "@superset/shared/agent-catalog";
import { getHostId } from "@superset/shared/host-info";
import {
	LAUNCH_SOURCES,
	type LaunchSource,
} from "@superset/shared/host-routing";
import { harnessBinary } from "../chat-v3/acpCatalogue";
import { findOnPath, isExecutableFile } from "../chat-v3/agentCli";
import type { HostDb } from "../db";
import { getTerminalBaseEnv } from "../terminal/env";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../terminal-agents/agent-config";
import type { ApiClient } from "../types";

export const AGENT_LAUNCHED_EVENT = "agent_launched";

export type AgentSessionKind = "chat" | "terminal";

export interface AgentLaunch {
	presetId: string;
	/** The configured command. Only its base name may leave the host. */
	command: string;
	kind: AgentSessionKind;
	resumed: boolean;
}

export interface AgentLaunchProperties {
	agent_id: string;
	surface: AgentSessionKind | LaunchSource;
	session_kind: AgentSessionKind;
	host_kind: "local" | "cloud";
	command_found: boolean;
	resumed: boolean;
	command_name?: string | null;
}

const SAFE_COMMAND_NAME = /^[a-z0-9][a-z0-9._+-]{0,63}$/;

const launchSourceStorage = new AsyncLocalStorage<LaunchSource>();

export function parseLaunchSource(
	value: string | undefined,
): LaunchSource | undefined {
	const normalized = value?.trim().toLowerCase();
	return LAUNCH_SOURCES.find((source) => source === normalized);
}

export function withLaunchSource<T>(
	source: LaunchSource | undefined,
	run: () => T,
): T {
	return source ? launchSourceStorage.run(source, run) : run();
}

const SHELL_OPERATOR = /[;&|<>()`$]/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const DOUBLE_QUOTE_ESCAPES = new Set(["$", "`", '"', "\\"]);

/**
 * The program a command runs, past any leading `NAME=value` assignments, with
 * quotes respected. Null when the words before the program cannot be split
 * for sure: an unclosed quote, or a shell operator outside quotes.
 */
export function commandExecutable(command: string): string | null {
	let word: string | null = null;
	let quote: '"' | "'" | null = null;
	const finish = (): string | null => {
		const done = word;
		word = null;
		return done !== null && !ASSIGNMENT.test(done) ? done : null;
	};
	for (let index = 0; index < command.length; index++) {
		const char = command[index] as string;
		const next = command[index + 1];
		if (quote === "'") {
			if (char === "'") quote = null;
			else word += char;
		} else if (quote === '"') {
			if (char === '"') quote = null;
			else if (char === "\\" && next && DOUBLE_QUOTE_ESCAPES.has(next)) {
				word += next;
				index++;
			} else word += char;
		} else if (/\s/.test(char)) {
			const program = finish();
			if (program !== null) return program;
		} else if (SHELL_OPERATOR.test(char)) {
			return null;
		} else if (char === '"' || char === "'") {
			word ??= "";
			quote = char;
		} else if (char === "\\") {
			if (next === undefined) return null;
			word = (word ?? "") + next;
			index++;
		} else {
			word = (word ?? "") + char;
		}
	}
	return quote ? null : finish();
}

export function commandBaseName(command: string): string | null {
	const executable = commandExecutable(command);
	if (!executable) return null;
	const name = (executable.split(/[\\/]/).pop() ?? "")
		.toLowerCase()
		.replace(/\.(exe|cmd|bat)$/, "");
	return SAFE_COMMAND_NAME.test(name) ? name : null;
}

export function isCommandOnBox(
	command: string,
	env: Record<string, string | undefined>,
	binDir: string,
): boolean {
	const executable = commandExecutable(command);
	if (!executable) return false;
	if (/[\\/]/.test(executable)) {
		return isExecutableFile(executable.replace(/^~(?=[\\/])/, homedir()));
	}
	// The wrapper in the bin dir exists whether or not the agent is installed.
	const pathKey =
		Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
	const path = (env[pathKey] ?? "")
		.split(delimiter)
		.filter((dir) => dir !== binDir)
		.join(delimiter);
	return findOnPath(executable, { PATH: path }) !== null;
}

export function agentLaunchProperties(
	launch: AgentLaunch,
	facts: {
		source: LaunchSource | undefined;
		runMode: string | undefined;
		commandFound: boolean;
	},
): AgentLaunchProperties {
	const builtin = isBuiltinAgentId(launch.presetId);
	return {
		agent_id: builtin ? launch.presetId : "custom",
		surface: facts.source ?? launch.kind,
		session_kind: launch.kind,
		host_kind: facts.runMode === "sandbox" ? "cloud" : "local",
		command_found: facts.commandFound,
		resumed: launch.resumed,
		...(builtin ? {} : { command_name: commandBaseName(launch.command) }),
	};
}

function launchPathEnv(
	overlay: Record<string, string>,
): Record<string, string | undefined> {
	let base: Record<string, string | undefined>;
	try {
		base = getTerminalBaseEnv();
	} catch {
		base = process.env;
	}
	return { ...base, ...overlay };
}

/** Never throws: telemetry must not fail a launch. */
export function trackAgentLaunched(
	api: ApiClient | undefined,
	launch: AgentLaunch & {
		workspaceId: string;
		/** What runs on the box; a chat runs its harness CLI, not the config's command. */
		executable: string;
		env: Record<string, string>;
	},
): void {
	if (!api) return;
	try {
		const properties = agentLaunchProperties(launch, {
			source: launchSourceStorage.getStore(),
			runMode: process.env.SUPERSET_HOST_RUN_MODE,
			commandFound: isCommandOnBox(
				launch.executable,
				launchPathEnv(launch.env),
				getBinDir(),
			),
		});
		void api.analytics.captureEvent
			.mutate({
				source: "host_service",
				event: AGENT_LAUNCHED_EVENT,
				properties: {
					...properties,
					workspace_id: launch.workspaceId,
					host_id: getHostId(),
					host_service_version: hostServicePackageJson.version,
				},
			})
			.catch(() => {});
	} catch (error) {
		console.warn("[agent-launch] could not report the launch", error);
	}
}

export function trackChatAgentLaunched(
	api: ApiClient | undefined,
	db: HostDb,
	session: {
		harness: string;
		scopeId: string;
		agentConfigId?: string;
		resume?: unknown;
	},
): void {
	try {
		const binary = harnessBinary(session.harness);
		const config = session.agentConfigId
			? resolveHostAgentConfig(db, session.agentConfigId)
			: null;
		trackAgentLaunched(api, {
			presetId: config?.presetId ?? binary,
			command: config?.command ?? binary,
			executable: binary,
			env: config ? agentLaunchEnv(db, config) : {},
			kind: "chat",
			resumed: Boolean(session.resume),
			workspaceId: session.scopeId,
		});
	} catch (error) {
		console.warn("[agent-launch] could not report the chat launch", error);
	}
}
