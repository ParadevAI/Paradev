import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { and, eq, isNull } from "drizzle-orm";
import { getSupervisor } from "../../../daemon";
import type { HostDb } from "../../../db";
import {
	terminalAgentBindings,
	terminalSessions,
	workspaces,
} from "../../../db/schema";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";
import { verifyAttributionToken } from "../../../terminal-agents/attribution-token";
import {
	backgroundAdoptionLaunchId,
	backgroundWorkerBirthHash,
	parseBackgroundAdoptionLaunchId,
} from "../../../terminal-agents/background-adoption";
import { discoverClaudeBackgroundSession } from "../../../terminal-agents/claude-background-session";
import { findClaudeSessionWriters } from "../../../terminal-agents/claude-session-writers";
import {
	findNativeClaudeTerminalClient,
	observeNativeClaudeProcess,
	resolveTrustedNativeClaudeExecutable,
} from "../../../terminal-agents/native-claude-process";
import type { HostServiceContext } from "../../../types";
import { validateAccountAuthRouting } from "../agents/account-auth-routing";
import {
	pinnedAccountEnv,
	resolveLaunchAccount,
} from "../agents/launch-account";
import {
	parsePersistedSessionAccount,
	sameSessionAccountContext,
} from "../usage/session-account/session-account";
import {
	type BackgroundSuccessorLineage,
	type BackgroundSuccessorRefreshIO,
	type BackgroundSuccessorTrigger,
	createBackgroundSuccessorRefresh,
} from "./background-successor-refresh";
import { fanOutAgentLifecycle } from "./fan-out-agent-lifecycle";

const execute = promisify(execFile);
type Binding = typeof terminalAgentBindings.$inferSelect;
interface LineageProof {
	chain: Binding[];
	account: NonNullable<ReturnType<typeof parsePersistedSessionAccount>>;
	config: NonNullable<ReturnType<typeof resolveHostAgentConfig>>;
}
function binding(db: HostDb, terminalId: string) {
	return db
		.select()
		.from(terminalAgentBindings)
		.where(eq(terminalAgentBindings.terminalId, terminalId))
		.get();
}
export async function readBackgroundSuccessorLineage(
	ctx: HostServiceContext,
	input: BackgroundSuccessorTrigger,
): Promise<BackgroundSuccessorLineage | null> {
	const first = binding(ctx.db, input.terminalId);
	if (
		!first ||
		first.agentId !== "claude" ||
		first.launchId !== input.launchId ||
		first.agentSessionId !== input.sessionId ||
		!first.launchId ||
		first.endedAt === null ||
		first.endReason !== "resumed"
	)
		return null;
	const account = parsePersistedSessionAccount(first.accountJson);
	if (
		!account?.pinned ||
		account.conflict ||
		account.agent !== "claude" ||
		account.credentialKind !== "subscription" ||
		!account.directory
	)
		return null;
	const workspace = ctx.db
		.select()
		.from(workspaces)
		.where(
			and(eq(workspaces.id, first.workspaceId), isNull(workspaces.archivedAt)),
		)
		.get();
	if (!workspace) return null;
	const [cwd, profile] = await Promise.all([
		realpath(workspace.worktreePath),
		realpath(account.directory),
	]);
	const chain: Binding[] = [first];
	let source = first;
	for (let depth = 0; depth < 8; depth++) {
		if (
			!source.resumedIntoTerminalId ||
			!source.launchId ||
			source.endReason !== "resumed" ||
			source.endedAt === null
		)
			return null;
		const target = binding(ctx.db, source.resumedIntoTerminalId);
		if (
			!target ||
			chain.some((row) => row.terminalId === target.terminalId) ||
			target.agentId !== "claude" ||
			target.workspaceId !== first.workspaceId ||
			target.agentSessionId !== first.agentSessionId ||
			target.definitionId !== source.definitionId ||
			!sameSessionAccountContext(
				parsePersistedSessionAccount(target.accountJson),
				account,
			)
		)
			return null;
		const grant = parseBackgroundAdoptionLaunchId(target.launchId);
		if (
			!grant ||
			target.launchId !==
				backgroundAdoptionLaunchId({
					source: {
						terminalId: source.terminalId,
						workspaceId: source.workspaceId,
						launchId: source.launchId,
						sessionId: first.agentSessionId,
						account,
						definitionId: source.definitionId,
						startedAt: source.startedAt,
					},
					terminalId: target.terminalId,
					cwd,
					adoptedAt: target.startedAt,
					worker: grant,
				})
		)
			return null;
		chain.push(target);
		if (target.endedAt !== null) {
			source = target;
			continue;
		}
		const terminal = ctx.db
			.select()
			.from(terminalSessions)
			.where(eq(terminalSessions.id, target.terminalId))
			.get();
		const config = resolveHostAgentConfig(
			ctx.db,
			target.definitionId ?? target.agentId,
		);
		if (
			!terminal ||
			terminal.originWorkspaceId !== first.workspaceId ||
			terminal.status !== "active" ||
			terminal.disposeRequestedAt !== null ||
			!config ||
			config.presetId !== "claude" ||
			!target.launchId
		)
			return null;
		return {
			key: JSON.stringify([
				target.workspaceId,
				target.terminalId,
				target.launchId,
				first.agentSessionId,
			]),
			terminalId: target.terminalId,
			launchId: target.launchId,
			workspaceId: target.workspaceId,
			sessionId: first.agentSessionId,
			workerPid: grant.pid,
			workerBirthHash: grant.birthHash,
			profile,
			cwd,
			lastEventAt: target.lastEventAt,
			proof: { chain, account, config } satisfies LineageProof,
		};
	}
	return null;
}
function selectedEnvironment(account: LineageProof["account"]) {
	const env = { ...process.env };
	for (const key of Object.keys(env))
		if (
			key === "CLAUDE_CONFIG_DIR" ||
			key === "SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR" ||
			key.startsWith("ANTHROPIC_") ||
			key.startsWith("CLAUDE_CODE_USE_") ||
			key === "CLAUDE_CODE_OAUTH_TOKEN" ||
			key === "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR" ||
			key === "CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR"
		)
			delete env[key];
	return { ...env, ...pinnedAccountEnv(account) };
}
export function backgroundSuccessorRefreshAdapter(
	ctx: HostServiceContext,
): BackgroundSuccessorRefreshIO {
	return {
		read: (input) =>
			readBackgroundSuccessorLineage(ctx, input).catch(() => null),
		async observe(lineage, signal) {
			const facts = lineage.proof as LineageProof;
			const verify = async () => {
				const current = await resolveLaunchAccount(facts.config, facts.account);
				await validateAccountAuthRouting(current, lineage.cwd);
				return (
					sameSessionAccountContext(current, facts.account) &&
					(await realpath(current.directory as string)) === lineage.profile
				);
			};
			const cli = await resolveTrustedNativeClaudeExecutable(
				join(homedir(), ".local/bin/claude"),
				{ signal },
			);
			const proof = await discoverClaudeBackgroundSession(
				{
					sessionId: lineage.sessionId,
					configDir: lineage.profile,
					worktreePath: lineage.cwd,
				},
				{
					signal,
					validateScope: verify,
					runDiscovery: async (request) =>
						(
							await execute(cli, [...request.args], {
								signal: request.signal,
								env: selectedEnvironment(facts.account),
								cwd: lineage.cwd,
								timeout: 1_500,
								maxBuffer: 256 * 1024,
								encoding: "utf8",
							})
						).stdout,
					verifyWorker: async (expected) => {
						if (expected.pid !== lineage.workerPid) return null;
						const worker = await observeNativeClaudeProcess(expected.pid, {
							signal,
						});
						if (
							backgroundWorkerBirthHash(worker.birth) !==
								lineage.workerBirthHash ||
							worker.configDir !== lineage.profile ||
							worker.cwd !== lineage.cwd
						)
							return null;
						const sessions = await getSupervisor().listSessions(
							ctx.organizationId,
							1_500,
						);
						const session = sessions?.find(
							(row) => row.id === lineage.terminalId && row.alive,
						);
						if (!session || signal.aborted) return null;
						const client = await findNativeClaudeTerminalClient(session.pid, {
							signal,
						});
						if (
							!client ||
							client.configDir !== lineage.profile ||
							client.cwd !== lineage.cwd ||
							client.executable !== worker.executable
						)
							return null;
						const writers = await findClaudeSessionWriters({
							sessionId: lineage.sessionId,
							directories: [lineage.profile],
						});
						if (
							!writers.includes(worker.pid) ||
							writers.some((pid) => pid !== worker.pid && pid !== client.pid)
						)
							return null;
						return {
							pid: worker.pid,
							birth: worker.birth,
							executable: worker.executable,
							configDir: worker.configDir,
							worktreePath: worker.cwd,
							sessionId: lineage.sessionId,
							backgroundId: expected.backgroundId,
						};
					},
				},
			);
			return proof && (await verify()) && !signal.aborted ? proof : null;
		},
		publish(lineage, eventType, occurredAt) {
			const proof = lineage.proof as LineageProof;
			const target = binding(ctx.db, lineage.terminalId);
			if (
				!target ||
				!isDeepStrictEqual(target, proof.chain.at(-1)) ||
				target.endedAt !== null ||
				target.launchId !== lineage.launchId ||
				target.lastEventAt >= occurredAt
			)
				return;
			ctx.terminalAgentStore.recordEvent({
				terminalId: lineage.terminalId,
				workspaceId: lineage.workspaceId,
				agentId: "claude",
				agentSessionId: lineage.sessionId,
				launchId: lineage.launchId,
				eventType,
				occurredAt,
			});
			fanOutAgentLifecycle(ctx, {
				terminalId: lineage.terminalId,
				workspaceId: lineage.workspaceId,
				agent: { agentId: "claude", sessionId: lineage.sessionId },
				eventType,
				occurredAt,
			});
		},
		wait: () => new Promise((resolve) => setTimeout(resolve, 250)),
	};
}
const refreshers = new WeakMap<
	HostDb,
	ReturnType<typeof createBackgroundSuccessorRefresh>
>();
export function getBackgroundSuccessorRefresh(ctx: HostServiceContext) {
	let refresh = refreshers.get(ctx.db);
	if (!refresh) {
		refresh = createBackgroundSuccessorRefresh(
			backgroundSuccessorRefreshAdapter(ctx),
		);
		refreshers.set(ctx.db, refresh);
	}
	return refresh;
}
export async function queueBackgroundSuccessorRefresh(
	ctx: HostServiceContext,
	input: BackgroundSuccessorTrigger & { attributionToken?: string },
) {
	if (!verifyAttributionToken(input.terminalId, input.attributionToken))
		return false;
	return getBackgroundSuccessorRefresh(ctx).enqueue(input);
}

export function disposeBackgroundSuccessorRefresh(db: HostDb): void {
	refreshers.get(db)?.dispose();
	refreshers.delete(db);
}
