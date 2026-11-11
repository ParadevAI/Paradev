import { parseAgentVersion } from "@superset/agent-setup/agent-binary";
import {
	type ManagedCodingAgent,
	managedAgentBinaryPath,
	managedCodexRootDir,
} from "@superset/agent-setup/managed-agent-binaries";
import { observable } from "@trpc/server/observable";
import { net } from "electron";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { isSignedByTeam, TEAM_IDS } from "../utils/code-signature";
import { macArch } from "../utils/mac-arch";
import { createSingleInstall } from "../utils/single-install";
import { getProcessEnvWithShellEnv } from "../workspaces/utils/shell-env";
import type { AgentInstallEvent } from "./utils/agent-install-event";
import {
	type CodingAgentStatus,
	detectCodingAgent,
} from "./utils/detect-coding-agent";
import { installClaudeCode } from "./utils/install-claude-code";
import { installCodex, removeStaleStaging } from "./utils/install-codex";
import { runProcess } from "./utils/run-process";

const agentInput = z.object({ agent: z.enum(["claude", "codex"]) });

async function readVersion(binaryPath: string): Promise<string | null> {
	const result = await runProcess(binaryPath, ["--version"], {
		env: await getProcessEnvWithShellEnv(),
		timeoutMs: 30_000,
	}).catch(() => null);
	return result?.code === 0 ? parseAgentVersion(result.stdout) : null;
}

async function detect(agent: ManagedCodingAgent): Promise<CodingAgentStatus> {
	const env = await getProcessEnvWithShellEnv();
	return detectCodingAgent(agent, {
		userPath: async () => env.PATH ?? "",
		run: (command, args) =>
			runProcess(command, args, { env, timeoutMs: 15_000 }),
	});
}

async function install(
	agent: ManagedCodingAgent,
	emit: (event: AgentInstallEvent) => void,
	signal: AbortSignal,
): Promise<AgentInstallEvent> {
	if (process.platform !== "darwin") {
		return { stage: "failed", reason: "unsupported" };
	}
	const fetch = (url: string, init?: RequestInit) => net.fetch(url, init);
	const arch = await macArch();
	if (agent === "claude") {
		return installClaudeCode({
			fetch,
			arch,
			installedPath: managedAgentBinaryPath("claude"),
			verifySignature: (binaryPath) =>
				isSignedByTeam(binaryPath, TEAM_IDS.anthropic),
			runInstall: async (binaryPath, args) => {
				const result = await runProcess(binaryPath, args, {
					env: await getProcessEnvWithShellEnv(),
					timeoutMs: 5 * 60_000,
					signal,
				});
				if (result.code !== 0) throw new Error("claude install failed");
			},
			readVersion,
			onProgress: emit,
			signal,
		});
	}
	return installCodex({
		fetch,
		arch,
		rootDir: managedCodexRootDir(),
		launcherPath: managedAgentBinaryPath("codex"),
		verifySignature: (binaryPath) =>
			isSignedByTeam(binaryPath, TEAM_IDS.openai),
		extractTarball: async (tarballPath, destDir) => {
			const result = await runProcess(
				"/usr/bin/tar",
				["-xzf", tarballPath, "--strip-components=1", "-C", destDir],
				{ env: { PATH: "/usr/bin:/bin" }, timeoutMs: 5 * 60_000, signal },
			);
			if (result.code !== 0) throw new Error("tar failed");
		},
		readVersion,
		onProgress: emit,
		signal,
	});
}

const subscribeToInstall = createSingleInstall<AgentInstallEvent>();

export const createCodingAgentsRouter = () => {
	// No install runs yet at startup, so a download a quit app left is stale.
	void removeStaleStaging(managedCodexRootDir());

	return router({
		status: publicProcedure
			.input(agentInput)
			.query(({ input }) => detect(input.agent)),
		install: publicProcedure.input(agentInput).subscription(({ input }) => {
			return observable<AgentInstallEvent>((emit) =>
				subscribeToInstall(
					input.agent,
					(emitProgress, signal) => install(input.agent, emitProgress, signal),
					(event) => {
						emit.next(event);
						if (event.stage === "done" || event.stage === "failed") {
							emit.complete();
						}
					},
				),
			);
		}),
	});
};
