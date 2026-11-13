import { TRPCError } from "@trpc/server";
import {
	downloadBundle,
	uploadTransferBundle,
	withStage,
} from "../../../teleport/bundle";
import { teleportProviderForAgent } from "../../../teleport/providers";
import { disposeSessionAndWait } from "../../../terminal/terminal";
import type {
	TerminalAgentBinding,
	TerminalAgentStore,
} from "../../../terminal-agents";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../../../terminal-agents/agent-config";
import { terminalHarnessSession } from "../../../terminal-agents/harness-session-ref";
import {
	findMoveStoppedBinding,
	markMoveStoppedBindingResumedInto,
} from "../../../terminal-agents/persistence";
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
const AGENT_START_TIMEOUT_MS = 90_000;
const AGENT_START_POLL_MS = 500;

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
	reason: "not_started" | "failed" | "too_many";
	/** Its agent no longer runs at the source, and could not be started again. */
	stopped?: boolean;
};

export type StopState = {
	stopped: { terminal: MovableTerminal; sessionFile: string }[];
	skipped: SkippedTerminal[];
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
	return movable;
}

export function listMovableTerminals(
	ctx: HostServiceContext,
	workspaceId: string,
): { movable: MovableTerminal[]; overflow: MovableTerminal[] } {
	const all = movableTerminals(
		ctx.terminalAgentStore.listByWorkspace(workspaceId),
		(agent) => resolveHostAgentConfig(ctx.db, agent)?.label,
	);
	return {
		movable: all.slice(0, MAX_MOVED_TERMINALS),
		overflow: all.slice(MAX_MOVED_TERMINALS),
	};
}

function reopenBinding(
	store: Pick<TerminalAgentStore, "recordEvent">,
	binding: TerminalAgentBinding,
) {
	store.recordEvent({
		terminalId: binding.terminalId,
		workspaceId: binding.workspaceId,
		eventType: "Attached",
		agentId: binding.agentId,
		agentSessionId: binding.agentSessionId,
		definitionId: binding.definitionId,
		occurredAt: Date.now(),
	});
}

/**
 * Ends each terminal's agent so its session file stops changing, adding the
 * session files of those that stopped to `state` as it goes, so a failure on
 * a later terminal still leaves the earlier ones to restart. A terminal whose
 * agent never wrote a session, changed session since it was listed, or did
 * not close keeps running.
 */
export async function stopTerminalsForMove(
	ctx: HostServiceContext,
	terminals: readonly MovableTerminal[],
	state: StopState,
): Promise<void> {
	const pool = getHostWorkerPool();
	for (const terminal of terminals) {
		const current = ctx.terminalAgentStore.get(terminal.terminalId);
		if (!current || current.agentSessionId !== terminal.harnessSessionId) {
			state.skipped.push({
				terminalId: terminal.terminalId,
				title: terminal.title,
				reason: "failed",
			});
			continue;
		}
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
			state.skipped.push({
				terminalId: terminal.terminalId,
				title: terminal.title,
				reason: "not_started",
			});
			continue;
		}
		// Disposed before the kill: the exit would otherwise make it a resume candidate here.
		ctx.terminalAgentStore.markTerminalDisposed(terminal.terminalId);
		const closed = await disposeSessionAndWait(
			terminal.terminalId,
			ctx.db,
		).then(
			(result) => result.daemonCloseSucceeded,
			(error: unknown) => {
				console.warn(
					`[teleport] could not stop terminal ${terminal.terminalId}`,
					error,
				);
				return false;
			},
		);
		if (!closed) {
			reopenBinding(ctx.terminalAgentStore, current);
			state.skipped.push({
				terminalId: terminal.terminalId,
				title: terminal.title,
				reason: "failed",
			});
			continue;
		}
		state.stopped.push({ terminal, sessionFile });
	}
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
 * each in a new terminal here. Panes on the old terminal follow it. The
 * stopped terminal's binding is the record: it survives a host restart, a
 * failed launch leaves it for another try, and a launch that worked marks it
 * resumed so a second call finds the terminal it became.
 */
export async function resumeStoppedTerminals(
	ctx: HostServiceContext,
	workspaceId: string,
	terminalIds: readonly string[],
): Promise<{ resumed: string[]; failed: string[] }> {
	const resumed: string[] = [];
	const failed: string[] = [];
	const endedSince = Date.now() - STOPPED_FOR_MOVE_TTL_MS;
	for (const terminalId of terminalIds) {
		const found = findMoveStoppedBinding(
			ctx.db,
			workspaceId,
			terminalId,
			endedSince,
		);
		if (found?.kind === "resumed") {
			resumed.push(found.terminalId);
			continue;
		}
		if (!found) {
			failed.push(terminalId);
			continue;
		}
		const { binding } = found;
		try {
			const result = await runAgentInWorkspace(ctx, {
				workspaceId,
				agent: binding.definitionId ?? binding.agentId,
				prompt: "",
				resumeSessionId: binding.agentSessionId,
			});
			markMoveStoppedBindingResumedInto(ctx.db, terminalId, result.sessionId);
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
			failed.push(terminalId);
		}
	}
	return { resumed, failed };
}

/** True once the agent in `terminalId` reports something after `since`, which its launch does by itself. */
export async function waitForAgentStart(
	store: Pick<TerminalAgentStore, "get">,
	terminalId: string,
	since: number,
	{
		timeoutMs = AGENT_START_TIMEOUT_MS,
		pollMs = AGENT_START_POLL_MS,
		sleep = (ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms)),
	}: {
		timeoutMs?: number;
		pollMs?: number;
		sleep?: (ms: number) => Promise<void>;
	} = {},
): Promise<boolean> {
	for (let waited = 0; waited <= timeoutMs; waited += pollMs) {
		if ((store.get(terminalId)?.lastEventAt ?? 0) > since) return true;
		await sleep(pollMs);
	}
	return false;
}

type ImportedTerminal = { terminalId: string; label: string };

const importing = new Map<string, Promise<ImportedTerminal>>();

/**
 * Brings in a terminal agent's session moving here from another host and
 * starts the agent on it in a new terminal. Returns once the agent has
 * reported its start, so the source is only left stopped when it is running
 * here. A repeated call for the same session returns the first terminal.
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
	options: Parameters<typeof waitForAgentStart>[3] = {},
): Promise<ImportedTerminal> {
	const key = `${input.workspaceId}::${input.harnessSessionId}`;
	const pending = importing.get(key);
	if (pending) return pending;
	const run = runImport(ctx, input, options);
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
	options: Parameters<typeof waitForAgentStart>[3],
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
	const launchedAt =
		ctx.terminalAgentStore.get(result.sessionId)?.lastEventAt ?? Date.now();
	const started = await waitForAgentStart(
		ctx.terminalAgentStore,
		result.sessionId,
		launchedAt,
		options,
	);
	if (!started) {
		ctx.terminalAgentStore.markTerminalDisposed(result.sessionId);
		await disposeSessionAndWait(result.sessionId, ctx.db).catch(
			(error: unknown) =>
				console.warn(
					`[teleport] could not remove terminal ${result.sessionId}, whose agent did not start`,
					error,
				),
		);
		throw new TRPCError({
			code: "TIMEOUT",
			message: "The moved terminal's agent did not start",
		});
	}
	return { terminalId: result.sessionId, label: result.label };
}
