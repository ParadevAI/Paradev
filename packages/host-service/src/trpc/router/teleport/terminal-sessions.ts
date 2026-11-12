import { TRPCError } from "@trpc/server";
import {
	downloadBundle,
	uploadTransferBundle,
	withStage,
} from "../../../teleport/bundle";
import { teleportProviderForAgent } from "../../../teleport/providers";
import { disposeSessionAndWait } from "../../../terminal/terminal";
import type { TerminalAgentBinding } from "../../../terminal-agents";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../../../terminal-agents/agent-config";
import { terminalHarnessSession } from "../../../terminal-agents/harness-session-ref";
import { markResumeCandidateResumedInto } from "../../../terminal-agents/persistence";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	harnessPlaceSessionTask,
	harnessSessionFileTask,
} from "../../../workers/tasks/harness";
import { runAgentInWorkspace } from "../agents/agents";

const MAX_MOVED_TERMINALS = 20;
const BUSY_EVENT_TYPES = new Set(["Start", "PermissionRequest"]);
const STOPPED_FOR_MOVE_TTL_MS = 60 * 60_000;
const IMPORTED_TTL_MS = 10 * 60_000;

export type MovableTerminal = {
	terminalId: string;
	/** The agent config it ran, which the destination launches when it has one. */
	agent: string;
	agentId: string;
	harnessSessionId: string;
	title: string;
	busy: boolean;
};

export type MovedTerminal = {
	terminalId: string;
	agent: string;
	agentId: string;
	harnessSessionId: string;
	title: string;
	bundle: { fileId: string; sha256: string; byteLength: number };
};

export type SkippedTerminal = {
	terminalId: string;
	title: string;
	reason: "not_started" | "failed";
};

export function movableTerminals(
	bindings: readonly TerminalAgentBinding[],
	labelOf: (agent: string) => string | undefined,
): MovableTerminal[] {
	const movable: MovableTerminal[] = [];
	for (const binding of bindings) {
		if (binding.chatSessionId || binding.endedAt) continue;
		if (!binding.agentSessionId) continue;
		if (!teleportProviderForAgent(binding.agentId)) continue;
		const agent = binding.definitionId ?? binding.agentId;
		movable.push({
			terminalId: binding.terminalId,
			agent,
			agentId: binding.agentId,
			harnessSessionId: binding.agentSessionId,
			title: labelOf(agent) ?? binding.agentId,
			busy: BUSY_EVENT_TYPES.has(binding.lastEventType),
		});
	}
	return movable.slice(0, MAX_MOVED_TERMINALS);
}

export function listMovableTerminals(
	ctx: HostServiceContext,
	workspaceId: string,
): MovableTerminal[] {
	return movableTerminals(
		ctx.terminalAgentStore.listByWorkspace(workspaceId),
		(agent) => resolveHostAgentConfig(ctx.db, agent)?.label,
	);
}

type StoppedTerminal = {
	workspaceId: string;
	agent: string;
	harnessSessionId: string;
	stoppedAt: number;
};

const stoppedForMove = new Map<string, StoppedTerminal>();

function forgetStaleStops(now: number) {
	for (const [terminalId, stopped] of stoppedForMove) {
		if (now - stopped.stoppedAt > STOPPED_FOR_MOVE_TTL_MS) {
			stoppedForMove.delete(terminalId);
		}
	}
}

/**
 * Ends each terminal's agent so its session file stops changing, and
 * returns the session files of those that stopped. A terminal whose agent
 * never wrote a session has nothing to move and keeps running.
 */
export async function stopTerminalsForMove(
	ctx: HostServiceContext,
	workspaceId: string,
	terminals: readonly MovableTerminal[],
): Promise<{
	stopped: { terminal: MovableTerminal; sessionFile: string }[];
	skipped: SkippedTerminal[];
}> {
	const pool = getHostWorkerPool();
	const stopped: { terminal: MovableTerminal; sessionFile: string }[] = [];
	const skipped: SkippedTerminal[] = [];
	forgetStaleStops(Date.now());
	for (const terminal of terminals) {
		const bound = terminalHarnessSession(ctx.db, terminal.terminalId);
		const sessionFile = bound
			? await pool
					.run(harnessSessionFileTask, { ref: bound.ref })
					.catch((error: unknown) => {
						console.warn(
							`[teleport] could not find the session of terminal ${terminal.terminalId}`,
							error,
						);
						return null;
					})
			: null;
		if (!sessionFile) {
			skipped.push({
				terminalId: terminal.terminalId,
				title: terminal.title,
				reason: "not_started",
			});
			continue;
		}
		stoppedForMove.set(terminal.terminalId, {
			workspaceId,
			agent: terminal.agent,
			harnessSessionId: terminal.harnessSessionId,
			stoppedAt: Date.now(),
		});
		// Disposed before the kill: the exit would otherwise make it a resume candidate here.
		ctx.terminalAgentStore.markTerminalDisposed(terminal.terminalId);
		const disposed = await disposeSessionAndWait(
			terminal.terminalId,
			ctx.db,
		).catch((error: unknown) => {
			console.warn(
				`[teleport] could not stop terminal ${terminal.terminalId}`,
				error,
			);
			return null;
		});
		if (!disposed?.daemonCloseSucceeded) {
			stoppedForMove.delete(terminal.terminalId);
			skipped.push({
				terminalId: terminal.terminalId,
				title: terminal.title,
				reason: "failed",
			});
			continue;
		}
		stopped.push({ terminal, sessionFile });
	}
	return { stopped, skipped };
}

export async function packStoppedTerminal(
	ctx: HostServiceContext,
	{
		terminal,
		sessionFile,
		worktreePath,
	}: { terminal: MovableTerminal; sessionFile: string; worktreePath: string },
): Promise<MovedTerminal> {
	const provider = teleportProviderForAgent(terminal.agentId);
	if (!provider)
		throw new Error(`No teleport provider for ${terminal.agentId}`);
	const env = terminalHarnessSession(ctx.db, terminal.terminalId)?.ref.env;
	const bundle = await withStage(async (stageDir) => {
		const manifest = await provider.collect({
			harnessSessionId: terminal.harnessSessionId,
			worktreePath,
			env,
			stageDir,
			locate: async () => sessionFile,
		});
		if (!manifest) throw new Error("The terminal's session file is gone");
		return uploadTransferBundle({ api: ctx.api, manifest, stageDir });
	});
	return {
		terminalId: terminal.terminalId,
		agent: terminal.agent,
		agentId: terminal.agentId,
		harnessSessionId: terminal.harnessSessionId,
		title: terminal.title,
		bundle,
	};
}

/**
 * Starts the agents of terminals stopped for a move that did not take them,
 * each in a new terminal here. Panes on the old terminal follow it.
 */
export async function resumeStoppedTerminals(
	ctx: HostServiceContext,
	workspaceId: string,
	terminalIds: readonly string[],
): Promise<string[]> {
	const resumed: string[] = [];
	for (const terminalId of terminalIds) {
		const stopped = stoppedForMove.get(terminalId);
		if (!stopped || stopped.workspaceId !== workspaceId) continue;
		stoppedForMove.delete(terminalId);
		try {
			const result = await runAgentInWorkspace(ctx, {
				workspaceId,
				agent: stopped.agent,
				prompt: "",
				resumeSessionId: stopped.harnessSessionId,
			});
			markResumeCandidateResumedInto(ctx.db, terminalId, result.sessionId);
			ctx.eventBus.broadcastTerminalLifecycle({
				workspaceId,
				terminalId,
				eventType: "resumed",
				resumedTerminalId: result.sessionId,
				label: result.label,
				occurredAt: Date.now(),
			});
			resumed.push(result.sessionId);
		} catch (error) {
			console.warn(
				`[teleport] could not resume terminal ${terminalId} after its move ended`,
				error,
			);
		}
	}
	return resumed;
}

type ImportedTerminal = { terminalId: string; label: string };

const importing = new Map<string, Promise<ImportedTerminal>>();

/**
 * Brings in a terminal agent's session moving here from another host and
 * starts the agent on it in a new terminal. A repeated call for the same
 * session returns the terminal the first one started.
 */
export function importTerminalSession(
	ctx: HostServiceContext,
	input: {
		workspaceId: string;
		worktreePath: string;
		agent: string;
		agentId: string;
		harnessSessionId: string;
		bundle: { url: string; sha256: string; byteLength: number };
	},
): Promise<ImportedTerminal> {
	const key = `${input.workspaceId}::${input.harnessSessionId}`;
	const pending = importing.get(key);
	if (pending) return pending;
	const run = runImport(ctx, input);
	importing.set(key, run);
	run.then(
		() => setTimeout(() => importing.delete(key), IMPORTED_TTL_MS).unref(),
		() => importing.delete(key),
	);
	return run;
}

async function runImport(
	ctx: HostServiceContext,
	input: Parameters<typeof importTerminalSession>[1],
): Promise<ImportedTerminal> {
	const provider = teleportProviderForAgent(input.agentId);
	const config =
		resolveHostAgentConfig(ctx.db, input.agent) ??
		resolveHostAgentConfig(ctx.db, input.agentId);
	if (!provider || !config || config.resumeArgs.length === 0) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "This host cannot continue the moved terminal's agent",
		});
	}
	await withStage(async (stageDir) => {
		const manifest = await downloadBundle({
			bundle: { ...input.bundle, harnessSessionId: input.harnessSessionId },
			stageDir,
		});
		await getHostWorkerPool().run(
			harnessPlaceSessionTask,
			{
				terminalAgent: input.agentId,
				manifest,
				worktreePath: input.worktreePath,
				env: agentLaunchEnv(ctx.db, config),
				stageDir,
			},
			{ timeoutMs: 120_000 },
		);
	});
	const result = await runAgentInWorkspace(ctx, {
		workspaceId: input.workspaceId,
		agent: config.id,
		prompt: "",
		resumeSessionId: input.harnessSessionId,
	});
	return { terminalId: result.sessionId, label: result.label };
}
