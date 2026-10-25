import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { buildArgvCommand } from "@superset/shared/agent-prompt-launch";
import { and, eq, isNull, like, ne, or } from "drizzle-orm";
import { getSupervisor } from "../../../daemon";
import {
	terminalAgentBindings,
	terminalSessions,
	workspaces,
} from "../../../db/schema";
import {
	createTerminalSessionInternal,
	readFreshTerminalAdmission,
} from "../../../terminal/terminal";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";
import {
	backgroundAdoptionLaunchId,
	backgroundWorkerBirthHash,
} from "../../../terminal-agents/background-adoption";
import {
	discoverClaudeBackgroundSession,
	liveClaudeAttachmentName,
	supportsLiveClaudeAttachment,
} from "../../../terminal-agents/claude-background-session";
import { findClaudeSessionWriters } from "../../../terminal-agents/claude-session-writers";
import {
	findNativeClaudeTerminalClient,
	observeNativeClaudeProcess,
	resolveTrustedNativeClaudeExecutable,
} from "../../../terminal-agents/native-claude-process";
import type { HostServiceContext } from "../../../types";
import { validateAccountAuthRouting } from "../agents/account-auth-routing";
import {
	accountLaunchUnsupportedReason,
	pinnedAccountCommandPrefix,
	pinnedAccountEnv,
	resolveLaunchAccount,
} from "../agents/launch-account";
import { parsePersistedSessionAccount } from "../usage/session-account/session-account";
import { assertAccountResumeTerminalIdle } from "./account-resume-processes";
import {
	type BackgroundReconnectInput,
	type BackgroundReconnectIO,
	type BackgroundReconnectSource,
	createBackgroundReconnect,
} from "./background-reconnect";

type Context = Pick<
	HostServiceContext,
	"db" | "eventBus" | "terminalAgentStore" | "organizationId"
>;
const execute = promisify(execFile);
const PREFIX = "background-attach:";
const AUTH_OVERRIDES = [
	"CLAUDE_CONFIG_DIR",
	"SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_CUSTOM_HEADERS",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
	"CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
	"CLAUDE_CODE_USE_BEDROCK",
	"CLAUDE_CODE_USE_VERTEX",
	"CLAUDE_CODE_USE_FOUNDRY",
	"CLAUDE_CODE_USE_ANTHROPIC_AWS",
	"CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
];
function refuse(): never {
	throw new Error(
		"The exact background conversation changed or could not be verified. Nothing was restarted.",
	);
}
function hash(value: unknown) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function context(ctx: Context, input: BackgroundReconnectInput) {
	const binding = ctx.db
		.select()
		.from(terminalAgentBindings)
		.where(
			and(
				eq(terminalAgentBindings.terminalId, input.terminalId),
				eq(terminalAgentBindings.workspaceId, input.workspaceId),
			),
		)
		.get();
	if (
		!binding ||
		binding.agentId !== "claude" ||
		!binding.agentSessionId ||
		!binding.launchId
	)
		return null;
	const workspace = ctx.db
		.select({ path: workspaces.worktreePath })
		.from(workspaces)
		.where(
			and(eq(workspaces.id, input.workspaceId), isNull(workspaces.archivedAt)),
		)
		.get();
	const config = resolveHostAgentConfig(
		ctx.db,
		binding.definitionId ?? binding.agentId,
	);
	const account = parsePersistedSessionAccount(binding.accountJson);
	if (
		!workspace ||
		!config ||
		config.presetId !== "claude" ||
		accountLaunchUnsupportedReason(config) ||
		!account?.directory ||
		account.agent !== "claude" ||
		account.conflict ||
		account.credentialKind !== "subscription"
	)
		return refuse();
	const marker = binding.endReason?.startsWith(PREFIX)
		? binding.endReason.slice(PREFIX.length).split(":")
		: null;
	if (binding.endReason === "resumed") return null;
	if (
		marker &&
		(marker.length !== 3 ||
			!["queued", "started"].includes(marker[0] ?? "") ||
			!/^[a-f0-9]{64}$/.test(marker[2] ?? ""))
	)
		return refuse();
	const originalReason = marker
		? marker[1] === "none"
			? null
			: (marker[1] ?? refuse())
		: binding.endReason;
	if (
		originalReason !== null &&
		!["detached", "terminal-exited", "disposed"].includes(originalReason)
	)
		return refuse();
	const original = marker
		? { ...binding, endReason: originalReason, resumedIntoTerminalId: null }
		: binding;
	const expectedRevision = hash([original, workspace, config]);
	if (marker && marker[2] !== expectedRevision) return refuse();
	const source: BackgroundReconnectSource = {
		workspaceId: input.workspaceId,
		terminalId: input.terminalId,
		expectedRevision,
		sessionId: binding.agentSessionId,
		account,
		cwd: workspace.path,
		label: config.label,
		...(marker && binding.resumedIntoTerminalId
			? {
					reservation: {
						terminalId: binding.resumedIntoTerminalId,
						authorized: marker[0] === "started",
					},
				}
			: {}),
	};
	if (marker && !source.reservation) return refuse();
	return { binding, workspace, config, source, originalReason };
}
function selectedEnvironment(source: BackgroundReconnectSource) {
	const env = { ...process.env };
	for (const key of Object.keys(env))
		if (AUTH_OVERRIDES.includes(key) || key.startsWith("CLAUDE_CODE_USE_"))
			delete env[key];
	return { ...env, ...pinnedAccountEnv(source.account) };
}
async function run(
	cli: string,
	args: string[],
	source: BackgroundReconnectSource,
	signal?: AbortSignal,
) {
	return (
		await execute(cli, args, {
			env: selectedEnvironment(source),
			cwd: source.cwd,
			signal,
			timeout: 1_500,
			maxBuffer: 256 * 1024,
			encoding: "utf8",
		})
	).stdout;
}

export async function supportsBackgroundReconnect(): Promise<boolean> {
	if (process.platform !== "darwin" && process.platform !== "linux")
		return false;
	try {
		const cli = await resolveTrustedNativeClaudeExecutable(
			join(homedir(), ".local/bin/claude"),
		);
		const output = await execute(cli, ["--version"], {
			timeout: 1_500,
			maxBuffer: 4_096,
			encoding: "utf8",
		});
		return supportsLiveClaudeAttachment(output.stdout);
	} catch {
		return false;
	}
}

export function backgroundReconnectSource(
	ctx: Context,
	input: { workspaceId: string; terminalId: string },
) {
	const source = context(ctx, { ...input, expectedRevision: "" })?.source;
	return source
		? { provider: "claude" as const, revision: source.expectedRevision }
		: null;
}

export function backgroundReconnectAdapter(
	ctx: Context,
): BackgroundReconnectIO {
	const requireSource = (source: BackgroundReconnectSource) => {
		const current = context(ctx, source);
		if (!current || !isDeepStrictEqual(current.source, source)) return refuse();
		return current;
	};
	const account = async (source: BackgroundReconnectSource) => {
		const current = requireSource(source);
		const target = await resolveLaunchAccount(current.config, source.account);
		await validateAccountAuthRouting(target, source.cwd);
		if (
			(await realpath(target.directory as string)) !==
			(await realpath(source.account.directory as string))
		)
			return refuse();
		return target;
	};
	const adapter: BackgroundReconnectIO = {
		read: (input) => context(ctx, input)?.source ?? null,
		successor(input) {
			const prior = ctx.db
				.select()
				.from(terminalAgentBindings)
				.where(
					and(
						eq(terminalAgentBindings.terminalId, input.terminalId),
						eq(terminalAgentBindings.workspaceId, input.workspaceId),
					),
				)
				.get();
			if (prior?.endReason !== "resumed" || !prior.resumedIntoTerminalId)
				return null;
			const successor = ctx.db
				.select()
				.from(terminalAgentBindings)
				.where(
					and(
						eq(terminalAgentBindings.terminalId, prior.resumedIntoTerminalId),
						eq(terminalAgentBindings.workspaceId, input.workspaceId),
					),
				)
				.get();
			const priorAccount = parsePersistedSessionAccount(prior.accountJson);
			const successorAccount =
				successor && parsePersistedSessionAccount(successor.accountJson);
			const terminal =
				successor &&
				ctx.db
					.select()
					.from(terminalSessions)
					.where(eq(terminalSessions.id, successor.terminalId))
					.get();
			if (
				!successor ||
				successor.endedAt !== null ||
				!terminal ||
				terminal.originWorkspaceId !== input.workspaceId ||
				terminal.status !== "active" ||
				terminal.disposeRequestedAt !== null ||
				!priorAccount ||
				!successorAccount ||
				successor.agentId !== "claude" ||
				successor.agentSessionId !== prior.agentSessionId ||
				!isDeepStrictEqual(successorAccount, priorAccount)
			)
				return null;
			return {
				reconnected: false,
				attachmentPending: true,
				terminalId: successor.terminalId,
				label: "Claude",
			};
		},
		verifyAccount: account,
		assertIdle: (source) =>
			assertAccountResumeTerminalIdle(
				ctx.db,
				source.terminalId,
				source.workspaceId,
			),
		async prove(source, signal) {
			const profile = await realpath(source.account.directory as string);
			const cwd = await realpath(source.cwd);
			const cli = await resolveTrustedNativeClaudeExecutable(
				join(homedir(), ".local/bin/claude"),
			);
			return discoverClaudeBackgroundSession(
				{ sessionId: source.sessionId, configDir: profile, worktreePath: cwd },
				{
					signal,
					runDiscovery: (request) =>
						run(cli, [...request.args], source, request.signal),
					validateScope: async () => {
						await account(source);
						return isDeepStrictEqual(context(ctx, source)?.source, source);
					},
					verifyWorker: async (expected, signal) => {
						const worker = await observeNativeClaudeProcess(expected.pid, {
							signal,
						});
						if (
							worker.configDir !== profile ||
							worker.cwd !== cwd ||
							!(
								await findClaudeSessionWriters({
									sessionId: source.sessionId,
									directories: [profile],
								})
							).includes(worker.pid)
						)
							return null;
						return {
							pid: worker.pid,
							birth: worker.birth,
							executable: worker.executable,
							configDir: profile,
							worktreePath: cwd,
							sessionId: source.sessionId,
							backgroundId: expected.backgroundId,
						};
					},
				},
			);
		},
		async attachArgs(proof, source, signal) {
			const cli = await resolveTrustedNativeClaudeExecutable(
				proof.workerAfter.executable,
			);
			const env = selectedEnvironment(source);
			const options = {
				env,
				signal,
				cwd: proof.target.worktreePath,
				timeout: 1_500,
				maxBuffer: 256 * 1024,
				encoding: "utf8" as const,
			};
			const version = await execute(cli, ["--version"], options);
			const all = await execute(cli, ["agents", "--json"], options);
			return [
				"attach",
				liveClaudeAttachmentName(all.stdout, proof.candidate, version.stdout),
			];
		},
		reserve(source, terminalId) {
			ctx.db.transaction(() => {
				const current = requireSource(source);
				if (source.reservation) return refuse();
				const other = ctx.db
					.select({ terminalId: terminalAgentBindings.terminalId })
					.from(terminalAgentBindings)
					.where(
						and(
							eq(terminalAgentBindings.agentId, "claude"),
							eq(terminalAgentBindings.agentSessionId, source.sessionId),
							ne(terminalAgentBindings.terminalId, source.terminalId),
							or(
								isNull(terminalAgentBindings.endedAt),
								like(
									terminalAgentBindings.endReason,
									"account-resume-preparing:%",
								),
								like(terminalAgentBindings.endReason, `${PREFIX}%`),
							),
						),
					)
					.get();
				if (other) return refuse();
				ctx.db
					.update(terminalAgentBindings)
					.set({
						endReason: `${PREFIX}queued:${current.originalReason ?? "none"}:${source.expectedRevision}`,
						resumedIntoTerminalId: terminalId,
					})
					.where(eq(terminalAgentBindings.terminalId, source.terminalId))
					.run();
			});
			return context(ctx, source)?.source ?? refuse();
		},
		assertReserved: (source) => {
			if (!requireSource(source).source.reservation) return refuse();
		},
		authorize(source) {
			const current = requireSource(source);
			if (!source.reservation) return refuse();
			ctx.db
				.update(terminalAgentBindings)
				.set({
					endReason: `${PREFIX}started:${current.originalReason ?? "none"}:${source.expectedRevision}`,
				})
				.where(eq(terminalAgentBindings.terminalId, source.terminalId))
				.run();
			return context(ctx, source)?.source ?? refuse();
		},
		unclaim(source) {
			let current: ReturnType<typeof context>;
			try {
				current = context(ctx, source);
			} catch {
				return;
			}
			if (
				!current ||
				!isDeepStrictEqual(current.source, source) ||
				source.reservation?.authorized
			)
				return;
			ctx.db
				.update(terminalAgentBindings)
				.set({ endReason: current.originalReason, resumedIntoTerminalId: null })
				.where(eq(terminalAgentBindings.terminalId, source.terminalId))
				.run();
		},
		async create(input) {
			const result = await createTerminalSessionInternal({
				terminalId: input.terminalId,
				workspaceId: input.source.workspaceId,
				db: ctx.db,
				eventBus: ctx.eventBus,
				initialCommand: `${pinnedAccountCommandPrefix(input.source.account, {})}${buildArgvCommand([input.executable, ...input.args])}`,
				beforeInitialCommand: input.beforeInitialCommand,
				onInitialCommandReady: input.onInitialCommandReady,
			});
			if ("error" in result) throw new Error(result.error);
		},
		async admission(source, terminalId, signal) {
			if (signal?.aborted) return null;
			const sessions = await getSupervisor().listSessions(
				ctx.organizationId,
				1_500,
			);
			if (signal?.aborted) return null;
			if (!sessions) return null;
			const row = sessions.find((item) => item.id === terminalId && item.alive);
			if (!row) return null;
			const client = await findNativeClaudeTerminalClient(row.pid, { signal });
			const bytes = readFreshTerminalAdmission({
				terminalId,
				workspaceId: source.workspaceId,
			});
			return client && bytes ? { rootPid: row.pid, client, bytes } : null;
		},
		commit(source, proof, client) {
			const terminalId = source.reservation?.terminalId;
			if (!terminalId) return refuse();
			const now = Date.now();
			const current = requireSource(source);
			if (!current.binding.launchId) return refuse();
			const launchId = backgroundAdoptionLaunchId({
				source: {
					terminalId: source.terminalId,
					workspaceId: source.workspaceId,
					launchId: current.binding.launchId,
					sessionId: source.sessionId,
					account: source.account,
					definitionId: current.binding.definitionId,
					startedAt: current.binding.startedAt,
				},
				terminalId,
				cwd: proof.target.worktreePath,
				adoptedAt: now,
				worker: {
					pid: proof.workerAfter.pid,
					birthHash: backgroundWorkerBirthHash(proof.workerAfter.birth),
				},
			});
			ctx.db.transaction(() => {
				requireSource(source);
				const terminal = ctx.db
					.select()
					.from(terminalSessions)
					.where(eq(terminalSessions.id, terminalId))
					.get();
				if (
					!terminal ||
					terminal.originWorkspaceId !== source.workspaceId ||
					terminal.status !== "active" ||
					terminal.disposeRequestedAt !== null ||
					client.configDir !== proof.target.configDir ||
					client.cwd !== proof.target.worktreePath
				)
					return refuse();
				ctx.db
					.insert(terminalAgentBindings)
					.values({
						terminalId,
						workspaceId: source.workspaceId,
						agentId: "claude",
						agentSessionId: source.sessionId,
						definitionId: requireSource(source).binding.definitionId,
						launchId,
						accountJson: JSON.stringify(source.account),
						startedAt: now,
						lastEventAt: now,
						lastEventType: "Attached",
					})
					.run();
				ctx.db
					.update(terminalAgentBindings)
					.set({
						endedAt: now,
						endReason: "resumed",
						resumedIntoTerminalId: terminalId,
					})
					.where(eq(terminalAgentBindings.terminalId, source.terminalId))
					.run();
			});
			ctx.terminalAgentStore.recordEvent({
				terminalId: source.terminalId,
				workspaceId: source.workspaceId,
				eventType: "Detached",
				occurredAt: now,
			});
			ctx.terminalAgentStore.recordEvent({
				terminalId,
				workspaceId: source.workspaceId,
				agentId: "claude",
				agentSessionId: source.sessionId,
				account: source.account,
				launchId,
				eventType: "Attached",
				occurredAt: now,
			});
			ctx.eventBus.broadcastTerminalLifecycle({
				workspaceId: source.workspaceId,
				terminalId: source.terminalId,
				eventType: "resumed",
				resumedTerminalId: terminalId,
				label: source.label,
				occurredAt: now,
			});
			return {
				reconnected: true,
				confirmed: true,
				terminalId,
				label: source.label,
			};
		},
		now: Date.now,
		uuid: randomUUID,
		wait: () => new Promise((resolve) => setTimeout(resolve, 75)),
	};
	return adapter;
}

const reconnectors = new WeakMap<
	Context["db"],
	ReturnType<typeof createBackgroundReconnect>
>();
export function reconnectTerminalBackgroundSession(
	ctx: Context,
	input: BackgroundReconnectInput,
) {
	let reconnect = reconnectors.get(ctx.db);
	if (!reconnect) {
		reconnect = createBackgroundReconnect(backgroundReconnectAdapter(ctx));
		reconnectors.set(ctx.db, reconnect);
	}
	return reconnect(input);
}
