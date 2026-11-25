import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { presetForAcpHarness } from "@superset/chat/core";
import type { HarnessFactory } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { ACP_HARNESSES } from "./acpCatalogue";
import { resolveAgentCli } from "./agentCli";
import { buildChatAgentEnv } from "./agentEnv";
import { agentLoginCommand } from "./agentLogin";

function resolveAdapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

export async function resolveAcpLaunch(
	db: HostDb,
	options: Parameters<HarnessFactory>[0],
	projectId?: string,
	signal?: AbortSignal,
) {
	const entry = ACP_HARNESSES[options.harness];
	if (!entry) throw new Error("Unsupported ACP harness");
	const cli = await resolveAgentCli({
		binary: entry.binary,
		signal,
		minVersion: entry.minVersion,
		upgrade: entry.upgrade,
		env: () =>
			buildChatAgentEnv({
				db,
				cwd: options.cwd,
				workspaceId: options.scopeId,
				projectId,
				terminalId: options.terminalId,
				agentConfigId: options.agentConfigId,
				presetId: presetForAcpHarness(options.harness) ?? entry.binary,
			}),
	});
	const loginCommand = agentLoginCommand(entry.binary, cli.env);
	const identity = { command: cli.command, version: cli.version };
	if (!entry.adapter) {
		return {
			...cli,
			args: entry.args,
			loginCommand,
			identity,
			cliVersion: cli.version,
		};
	}
	return {
		identity,
		cliVersion: cli.version,
		command: process.execPath,
		args: [resolveAdapterEntry(entry.adapter), ...entry.args],
		env: {
			...cli.env,
			...entry.adapterEnv,
			ELECTRON_RUN_AS_NODE: "1",
			[entry.executableEnv]: cli.command,
		},
		loginCommand,
	};
}
export type AcpLaunch = Awaited<ReturnType<typeof resolveAcpLaunch>>;
