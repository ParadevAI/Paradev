import { accessSync, constants, statSync } from "node:fs";
import {
	type ManagedCodingAgent,
	managedAgentBinaryPath,
	managedCodexRootDir,
} from "@superset/agent-setup/managed-agent-binaries";
import { getBinDir } from "@superset/agent-setup/paths";
import { observable } from "@trpc/server/observable";
import { net } from "electron";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getProcessEnvWithShellEnv } from "../workspaces/utils/shell-env";
import {
	type AgentSignInEvent,
	type AgentSignInHandle,
	runAgentSignIn,
} from "./utils/agent-sign-in";
import {
	ANTHROPIC_TEAM_ID,
	isSignedByTeam,
	OPENAI_TEAM_ID,
} from "./utils/code-signature";
import {
	type CodingAgentStatus,
	detectCodingAgent,
	parseAgentVersion,
} from "./utils/detect-coding-agent";
import type { AgentInstallEvent } from "./utils/download-verified";
import { installClaudeCode } from "./utils/install-claude-code";
import { installCodex } from "./utils/install-codex";
import { runProcess, spawnLoginProcess } from "./utils/run-process";

const agentInput = z.object({ agent: z.enum(["claude", "codex"]) });

function isExecutable(filePath: string): boolean {
	try {
		if (!statSync(filePath).isFile()) return false;
		accessSync(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function readVersion(binaryPath: string): Promise<string | null> {
	const env = await getProcessEnvWithShellEnv();
	const result = await runProcess(binaryPath, ["--version"], {
		env,
		timeoutMs: 30_000,
	}).catch(() => null);
	return result?.code === 0 ? parseAgentVersion(result.stdout) : null;
}

async function detect(
	agent: ManagedCodingAgent,
	signIn: boolean,
): Promise<CodingAgentStatus> {
	const env = await getProcessEnvWithShellEnv();
	return detectCodingAgent(
		agent,
		{ signIn },
		{
			userPath: async () => env.PATH ?? "",
			wrapperDirs: [getBinDir()],
			managedPath: managedAgentBinaryPath(agent),
			isExecutable,
			run: (command, args) =>
				runProcess(command, args, { env, timeoutMs: 15_000 }),
		},
	);
}

function install(
	agent: ManagedCodingAgent,
	options: {
		signal: AbortSignal;
		onProgress: (event: AgentInstallEvent) => void;
	},
): Promise<AgentInstallEvent> {
	const fetch = (url: string, init?: RequestInit) => net.fetch(url, init);
	if (agent === "claude") {
		return installClaudeCode({
			fetch,
			installedPath: managedAgentBinaryPath("claude"),
			verifySignature: (binaryPath) =>
				isSignedByTeam(binaryPath, ANTHROPIC_TEAM_ID),
			runInstall: async (binaryPath, version) => {
				const env = await getProcessEnvWithShellEnv();
				const result = await runProcess(binaryPath, ["install", version], {
					env,
					timeoutMs: 5 * 60_000,
				});
				if (result.code !== 0) throw new Error("claude install failed");
			},
			readVersion,
			...options,
		});
	}
	return installCodex({
		fetch,
		rootDir: managedCodexRootDir(),
		launcherPath: managedAgentBinaryPath("codex"),
		verifySignature: (binaryPath) => isSignedByTeam(binaryPath, OPENAI_TEAM_ID),
		extractTarball: async (tarballPath, destDir) => {
			const result = await runProcess(
				"/usr/bin/tar",
				["-xzf", tarballPath, "--strip-components=1", "-C", destDir],
				{ env: { PATH: "/usr/bin:/bin" }, timeoutMs: 5 * 60_000 },
			);
			if (result.code !== 0) throw new Error("tar failed");
		},
		readVersion,
		...options,
	});
}

const signIns = new Map<ManagedCodingAgent, AgentSignInHandle>();

export const createCodingAgentsRouter = () => {
	return router({
		status: publicProcedure
			.input(agentInput.extend({ signIn: z.boolean().optional() }))
			.query(({ input }) => detect(input.agent, input.signIn ?? false)),
		install: publicProcedure.input(agentInput).subscription(({ input }) => {
			return observable<AgentInstallEvent>((emit) => {
				if (process.platform !== "darwin") {
					emit.next({ stage: "failed", reason: "unsupported" });
					emit.complete();
					return () => {};
				}
				const controller = new AbortController();
				void install(input.agent, {
					signal: controller.signal,
					onProgress: (event) => {
						if (event.stage === "done" || event.stage === "failed") return;
						if (!controller.signal.aborted) emit.next(event);
					},
				}).then((event) => {
					if (controller.signal.aborted) return;
					emit.next(event);
					emit.complete();
				});
				return () => controller.abort();
			});
		}),
		signIn: publicProcedure.input(agentInput).subscription(({ input }) => {
			return observable<AgentSignInEvent>((emit) => {
				let handle: AgentSignInHandle | null = null;
				let stopped = false;
				void (async () => {
					const status = await detect(input.agent, false);
					const env = await getProcessEnvWithShellEnv();
					if (stopped) return;
					if (!status.path) {
						emit.next({ type: "failed", reason: "exited" });
						emit.complete();
						return;
					}
					const binaryPath = status.path;
					signIns.get(input.agent)?.stop();
					handle = runAgentSignIn({
						agent: input.agent,
						spawn: (args) => spawnLoginProcess(binaryPath, args, env),
						onEvent: (event) => {
							if (stopped) return;
							emit.next(event);
							if (event.type !== "url") emit.complete();
						},
					});
					signIns.set(input.agent, handle);
				})();
				return () => {
					stopped = true;
					handle?.stop();
					if (handle && signIns.get(input.agent) === handle) {
						signIns.delete(input.agent);
					}
				};
			});
		}),
		submitSignInCode: publicProcedure
			.input(agentInput.extend({ code: z.string().min(1).max(4096) }))
			.mutation(({ input }) => {
				signIns.get(input.agent)?.submitCode(input.code);
			}),
	});
};
