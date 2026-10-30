import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type AcpUpdate, acp } from "@superset/agent-harness";
import type { SteerInput } from "@superset/agent-harness/session/definitions";
import { Context as ActivityContext } from "@temporalio/activity";
import { ApplicationFailure, CancelledFailure } from "@temporalio/common";
import type {
	CredentialsProvider,
	TurnCredentials,
} from "../../clients/credentials";
import { hostContext } from "../../clients/hostJobs";
import type { SessionStore, TranscriptRow } from "../../clients/sessionStore";
import { httpSessionStore } from "../../clients/sessionStore";
import type {
	SessionStoreAccess,
	SettleTurnInput,
	TurnSettler,
} from "../../clients/settler";
import { PdevSession } from "../../pdev/pdevSession";
import {
	FILE_STEP,
	linesStepKey,
	type PdevEntry,
	pdevEntriesOf,
	restoreSessionFile,
	SessionFileTail,
} from "../../pdev/sessionFile";

export interface RoomPoster {
	post(input: { body: string; idempotencyKey: string }): Promise<unknown>;
}

export interface PdevLaunch {
	command: string;
	/** Each session gets its own home under here while a turn runs. */
	workRoot: string;
	/** `provider/model`, written as pdev's default model. Unset: the router's default. */
	model?: string;
	/** The model for a Dev's main session, which people wait on; unset uses `model`. */
	mainModel?: string;
	/** Extra environment, for local runs. */
	env?: NodeJS.ProcessEnv;
}

export interface ActivityDeps {
	credentials: CredentialsProvider;
	settler: TurnSettler;
	pdev: PdevLaunch;
	/** Steers the session workflow holds for a turn, in order. */
	turnSteers: (workflowId: string, turnId: string) => Promise<SteerInput[]>;
	sessionStore?: (
		access: SessionStoreAccess,
		sessionId: string,
		freshTicket: () => Promise<string>,
	) => SessionStore;
	workspaceContext?: (credentials: TurnCredentials) => Promise<{ cwd: string }>;
	roomPoster?: (credentials: TurnCredentials) => RoomPoster | null;
	/** Repairs Devs that lost a message; the API does the work. */
	reconcile?: () => Promise<unknown>;
	now?: () => number;
	flushEveryMs?: number;
	heartbeatEveryMs?: number;
	pollEveryMs?: number;
	/** How long pdev must stay idle before the turn ends; a finished background task starts a run by itself. */
	settleIdleMs?: number;
}

interface TurnRef {
	sessionId: string;
	turnId: string;
}

export interface TurnPrompt {
	promptId: string;
	text: string;
	/** Steers are shown in the session when they reach pdev; the turn's own prompt already is. */
	steer?: boolean;
}

const CREDENTIALS_TTL_MS = 5 * 60_000;
const MAX_REPLY_CHARS = 32 * 1024;
const TURN_START = "turn_start";
const RUN_START = "run_start";
/** pdev's own echo of what this worker already wrote to the session. */
const HIDDEN_UPDATES = new Set([
	"user_message",
	"user_message_chunk",
	"state_update",
]);
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const IN_ROOM =
	"People read this conversation in a channel. They see only your final reply, so end each turn with a short, self-contained answer.";
const TOKEN_REFRESH_MS = 4 * 60_000;
const TURN_TOKEN_HEADER = "x-agent-turn-token";
const PROVISIONING_WAIT_MS = 10 * 60_000;
/** A main session has no machine and no subagents, so nothing restarts it once it is idle. */
const MAIN_SETTLE_IDLE_MS = 200;
const PROVISIONING_POLL_MS = 5_000;
const RESUMED =
	"This turn stopped before it finished, because the machine running you restarted or the model request failed. Continue from where it stopped. Check the current state before you repeat any action.";

/** A model error that a later attempt cannot fix: the request itself is wrong. */
const BAD_REQUEST =
	/\b(400|413|422)\b|invalid_request|context (length|window)|prompt is too long/i;

export function createActivities(deps: ActivityDeps) {
	const now = deps.now ?? Date.now;
	const flushEveryMs = deps.flushEveryMs ?? 150;
	const heartbeatEveryMs = deps.heartbeatEveryMs ?? 5_000;
	const pollEveryMs = deps.pollEveryMs ?? 2_000;
	const settleIdleMs = deps.settleIdleMs ?? 2_000;
	const credentialCache = new Map<
		string,
		{ at: number; value: Promise<TurnCredentials> }
	>();

	const credentialsFor = (ref: TurnRef) => {
		const cached = credentialCache.get(ref.turnId);
		if (cached && now() - cached.at < CREDENTIALS_TTL_MS) return cached.value;
		const value = deps.credentials.forTurn(ref);
		credentialCache.set(ref.turnId, { at: now(), value });
		value.catch(() => credentialCache.delete(ref.turnId));
		return value;
	};

	const handles = async (ref: TurnRef) => {
		const credentials = await credentialsFor(ref);
		const store = (deps.sessionStore ?? defaultStore)(
			credentials.sessionStore,
			ref.sessionId,
			() => credentialsFor(ref).then((c) => c.sessionStore.writeTicket),
		);
		return { credentials, store };
	};

	const posterFor = (credentials: TurnCredentials) =>
		credentials.room ? (deps.roomPoster?.(credentials) ?? null) : null;

	const pdevEnv = async (
		credentials: TurnCredentials,
		home: string,
		agentDir: string,
	): Promise<NodeJS.ProcessEnv> => {
		const base: NodeJS.ProcessEnv = {
			PATH: process.env.PATH,
			HOME: home,
			PARADEV_CODING_AGENT_DIR: agentDir,
			PDEV_GATEWAY_URL: credentials.model.baseUrl,
			PDEV_GATEWAY_HEADERS: JSON.stringify(credentials.model.headers),
			PDEV_PERMISSION_MODE: "bypassPermissions",
			PDEV_SUPERSET: "0",
			...deps.pdev.env,
		};
		if (!credentials.host) return { ...base, PDEV_NO_WORKSPACE: "1" };
		const { cwd } = await (deps.workspaceContext ?? defaultContext)(
			credentials,
		);
		return {
			...base,
			PDEV_REMOTE_HOST_URL: credentials.host.url,
			PDEV_REMOTE_HOST_TOKEN: credentials.host.bearer,
			PDEV_REMOTE_WORKSPACE_ID: credentials.host.workspaceId,
			PDEV_REMOTE_CWD: cwd,
		};
	};

	/** A turn that answered without posting would leave the room silent. */
	const postReply = async (
		ref: TurnRef & {
			outcome: SettleTurnInput["status"];
			repliedWithTool: boolean;
		},
		credentials: TurnCredentials,
		reply: string | undefined,
	) => {
		const poster = posterFor(credentials);
		if (!poster || ref.outcome !== "completed" || !reply?.trim()) return;
		if (ref.repliedWithTool) return;
		await poster.post({ body: reply, idempotencyKey: `${ref.turnId}:reply` });
	};

	const noteRetry = async (turnId: string, error: unknown) => {
		if (isPermanent(error) || error instanceof CancelledFailure) return;
		await deps.settler
			.noteRetry?.({
				turnId,
				attempt: activityInfo()?.attempt ?? 1,
				error: error instanceof Error ? error.message : String(error),
			})
			.catch(() => {});
	};

	const activities = {
		async beginTurn(
			input: TurnRef & { promptId: string; text: string },
		): Promise<void> {
			const { store } = await handles(input);
			await store.append({
				stepKey: `${input.turnId}/start`,
				turnId: input.turnId,
				turnStart: { startedAtMs: now() },
				acp: [
					acp.running(),
					acp.userMessage(`user-${input.promptId}`, input.text, input.promptId),
				],
				transcript: [{ type: TURN_START, turnId: input.turnId, at: now() }],
			});
		},

		async addSteers(
			input: TurnRef & { steers: Array<{ promptId: string; text: string }> },
		): Promise<void> {
			const { store } = await handles(input);
			for (const steer of input.steers) await showSteer(store, input, steer);
		},

		/**
		 * Runs pdev for the turn until it is idle, passing it steers as they
		 * arrive. A retried attempt resumes the saved session and never sends
		 * the prompt again.
		 */
		async runTurn(
			input: TurnRef & { prompts: TurnPrompt[]; steersFrom: number },
		): Promise<{ steersConsumed: number }> {
			if (!SESSION_ID.test(input.sessionId)) {
				throw ApplicationFailure.nonRetryable(
					`Bad session id ${input.sessionId}`,
					"BadSessionId",
				);
			}
			const info = activityInfo();
			const attempt = info?.attempt ?? 1;
			const { credentials, store } = await untilProvisioned(() =>
				handles(input),
			);
			const home = join(deps.pdev.workRoot, input.sessionId);
			const agentDir = join(home, ".paradev", "agent");
			const cwd = join(home, "work");
			await rm(home, { recursive: true, force: true });
			await mkdir(cwd, { recursive: true });
			await mkdir(agentDir, { recursive: true });
			const headersFile = join(home, "dev-tools-headers.json");
			const writeHeaders = async (token: string) =>
				writeFile(headersFile, JSON.stringify({ [TURN_TOKEN_HEADER]: token }), {
					mode: 0o600,
				});
			if (credentials.tools) await writeHeaders(credentials.agentToken ?? "");
			const isMain = credentials.session?.kind === "main";
			const idleFor = isMain
				? Math.min(settleIdleMs, MAIN_SETTLE_IDLE_MS)
				: settleIdleMs;
			const model = isMain
				? (deps.pdev.mainModel ?? deps.pdev.model)
				: deps.pdev.model;
			await writeAgentSettings({
				agentDir,
				model,
				system: systemFor(credentials),
				tools: credentials.tools
					? { mcpUrl: credentials.tools.mcpUrl, headersFile }
					: null,
			});
			let headersAt = now();

			const runKey = `${input.turnId}/run/${input.steersFrom}`;
			let rows = await store.transcript();
			if (!rows.some((row) => row.stepKey === runKey)) {
				await store.append({
					stepKey: runKey,
					turnId: input.turnId,
					transcript: [{ type: RUN_START, turnId: input.turnId }],
				});
				rows = await store.transcript();
			}
			const resumeId = await restoreSessionFile(agentDir, rows);
			const tail = new SessionFileTail(agentDir);
			if (resumeId) await tail.skipExisting();
			const delivery = deliveryLog(
				rows.slice(rows.findIndex((row) => row.stepKey === runKey) + 1),
			);

			const flusher = createFlusher(
				store,
				input.turnId,
				`${input.turnId}/a${attempt}/s${input.steersFrom}/u`,
				flushEveryMs,
				now,
			);
			const session = new PdevSession({
				command: deps.pdev.command,
				cwd,
				...(model ? { model } : {}),
				env: await pdevEnv(credentials, home, agentDir),
				onUpdate: (update) => {
					if (!HIDDEN_UPDATES.has(update.sessionUpdate)) {
						flusher.add([update as unknown as AcpUpdate]);
					}
					heartbeat();
				},
			});
			let fileRecorded = rows.some((row) => row.stepKey === FILE_STEP);
			const syncFile = async () => {
				const entries = await tail.read();
				if (entries.length === 0) return;
				if (!fileRecorded && tail.relativePath) {
					await store.append({
						stepKey: FILE_STEP,
						turnId: input.turnId,
						transcript: [{ path: tail.relativePath }],
					});
					fileRecorded = true;
				}
				await store.append({
					stepKey: linesStepKey(entries),
					turnId: input.turnId,
					transcript: entries,
				});
			};

			const signal = cancellationSignal();
			const stopBeat = keepBeating(heartbeatEveryMs);
			let delivered = input.steersFrom;
			try {
				await session.open(resumeId);
				const unsent = input.prompts.filter(
					(prompt) => !delivery.alreadySent(prompt.text),
				);
				if (attempt > 1 && unsent.length < input.prompts.length) {
					await session.prompt(RESUMED);
				}
				for (const prompt of unsent) {
					if (prompt.steer) await showSteer(store, input, prompt);
					await session.prompt(prompt.text);
				}
				let idleSince: number | null = null;
				for (;;) {
					if (signal?.aborted) {
						const stopped = cancelRequested();
						if (stopped) await session.cancel();
						await flusher.flush();
						await syncFile();
						if (stopped) throw new CancelledFailure("Turn interrupted");
						throw ApplicationFailure.retryable(
							"This worker stopped; another one resumes the turn.",
							"WorkerStopped",
						);
					}
					const steers = info
						? await deps.turnSteers(
								info.workflowExecution?.workflowId ?? "",
								input.turnId,
							)
						: [];
					for (const steer of steers.slice(delivered)) {
						if (!delivery.alreadySent(steer.text)) {
							await showSteer(store, input, steer);
							await session.prompt(steer.text);
						}
						delivered += 1;
						idleSince = null;
					}
					await syncFile();
					if (credentials.tools && now() - headersAt >= TOKEN_REFRESH_MS) {
						headersAt = now();
						const fresh = await credentialsFor(input);
						await writeHeaders(fresh.agentToken ?? "");
					}
					if (session.idle) {
						idleSince ??= now();
						if (now() - idleSince >= idleFor) break;
					} else idleSince = null;
					await session.waitForChange(session.idle ? idleFor : pollEveryMs);
				}
				await flusher.flush();
				await syncFile();
				if (session.lastStopReason === "error") {
					const message =
						lastError(await tailEntries(store, input.turnId)) ??
						"The model request failed.";
					if (BAD_REQUEST.test(message)) {
						throw ApplicationFailure.nonRetryable(message, "PdevTurnError");
					}
					throw ApplicationFailure.retryable(message, "PdevModelError");
				}
				return { steersConsumed: delivered };
			} finally {
				stopBeat();
				await session.close().catch(() => {});
				await syncFile().catch(() => {});
				await rm(home, { recursive: true, force: true }).catch(() => {});
			}
		},

		async settleTurn(
			input: TurnRef & {
				outcome: SettleTurnInput["status"];
				errorMessage?: string;
				steersConsumed: number;
			},
		): Promise<{ steerPending: boolean }> {
			const base = {
				turnId: input.turnId,
				status: input.outcome,
				steersConsumed: input.steersConsumed,
				...(input.outcome === "failed"
					? { errorCode: input.errorMessage ?? "failed" }
					: {}),
			};
			// Settling must not need the workspace: a turn that lost it still has to end.
			const running = await handles(input).catch((error: unknown) => {
				if (isPermanent(error)) return null;
				throw error;
			});
			let rows: TranscriptRow[] | null = null;
			let settled: Awaited<ReturnType<TurnSettler["settle"]>>;
			if (running) {
				rows = await running.store.transcript();
				const summary = summarizeTurn(entriesOfTurn(rows, input.turnId));
				await postReply(
					{
						...input,
						repliedWithTool: summary.toolCalls.some((call) =>
							/(^|__)reply$/.test(call.name),
						),
					},
					running.credentials,
					summary.reply,
				);
				settled = await deps.settler.settle({ ...base, ...summary });
			} else {
				settled = await deps.settler.settle(base);
			}
			if (settled.steerPending) return { steerPending: true };
			credentialCache.delete(input.turnId);
			const access = settled.sessionStore;
			const store = (deps.sessionStore ?? defaultStore)(
				access,
				input.sessionId,
				async () => access.writeTicket,
			);
			rows ??= await store.transcript();
			const summary = summarizeTurn(entriesOfTurn(rows, input.turnId));
			const open: AcpUpdate[] = summary.unfinishedCalls.map((call) =>
				acp.toolStopped(call.id),
			);
			const stopReason =
				input.outcome === "completed"
					? "end_turn"
					: input.outcome === "interrupted"
						? "cancelled"
						: "error";
			const started = turnStartOf(rows, input.turnId);
			await store.append({
				stepKey: `${input.turnId}/end`,
				turnId: input.turnId,
				acp: [...open, acp.idle(stopReason, input.errorMessage)],
				turnEnd: {
					id: input.turnId,
					status: input.outcome,
					startedAtMs: started ?? now(),
					completedAtMs: now(),
					...(input.errorMessage
						? { error: { message: input.errorMessage } }
						: {}),
				},
			});
			return { steerPending: false };
		},
	};

	return {
		...activities,
		async runTurn(input: Parameters<typeof activities.runTurn>[0]) {
			try {
				return await activities.runTurn(input);
			} catch (error) {
				await noteRetry(input.turnId, error);
				throw error;
			}
		},
		async reconcileDevs(): Promise<unknown> {
			return deps.reconcile?.() ?? null;
		},
	};
}

export type AgentActivities = ReturnType<typeof createActivities>;

async function showSteer(
	store: SessionStore,
	turn: TurnRef,
	steer: { promptId: string; text: string },
): Promise<void> {
	await store.append({
		stepKey: `steer/${steer.promptId}`,
		turnId: turn.turnId,
		acp: [
			acp.userMessage(`user-${steer.promptId}`, steer.text, steer.promptId),
		],
	});
}

async function writeAgentSettings({
	agentDir,
	model,
	system,
	tools,
}: {
	agentDir: string;
	model: string | undefined;
	system: string;
	tools: { mcpUrl: string; headersFile: string } | null;
}): Promise<void> {
	const slash = model?.indexOf("/") ?? -1;
	await writeFile(
		join(agentDir, "settings.json"),
		JSON.stringify({
			...(model && slash > 0
				? {
						defaultProvider: model.slice(0, slash),
						defaultModel: model.slice(slash + 1),
					}
				: {}),
			...(tools ? { permissions: { deny: ["Task"] } } : {}),
		}),
	);
	await writeFile(join(agentDir, "APPEND_SYSTEM.md"), system);
	if (tools) {
		await writeFile(
			join(agentDir, "mcp.json"),
			JSON.stringify({
				mcpServers: {
					dev: {
						url: tools.mcpUrl,
						headersHelper: `cat '${tools.headersFile}'`,
						exposure: "direct",
					},
				},
			}),
		);
	}
}

/** What pdev is told about who it is in this session, on top of its own prompt. */
export function systemFor(credentials: TurnCredentials): string {
	const dev = credentials.dev;
	const name = dev?.name ?? "the Dev";
	const kind = credentials.session?.kind;
	const title = credentials.session?.title ?? "a task";
	const team = dev?.instructions
		? `\n\nYour team's instructions for you:\n${dev.instructions}`
		: "";
	if (kind === "main") {
		return `You are ${name}, a teammate in this organization${dev?.description ? ` (${dev.description})` : ""}.

Everything sent to you arrives here as <message> blocks that say who sent it, where, and reply_to. People see only what you send with the reply tool: answer each message with reply, passing its reply_to as target. A message from one of your tasks has no reply_to; tell the person who asked for the work.

You have no machine and no subagents. For anything that needs reading or changing code, running commands, or opening a pull request, start a task with start_task and give it complete instructions, since it knows only the task and what you write. Before starting new work, check list_work: to continue something, pass its taskId. When a writer reports a pull request, start a reviewer on the same task (role reviewer, its taskId). Send review findings back to the writer with message_task. Tell people the outcome once it is reviewed.

If a task cannot start or fails, do not start it again unchanged: tell the person what went wrong and what you need.

When someone wants something later, on a schedule, or whenever something happens, set up a routine with routine_update; its runs arrive as <routine> blocks with their own reply_to.

Answer questions about your work from list_work and read_task. Keep notes with remember and recall. Keep each turn short: decide, delegate, reply.${team}`;
	}
	if (credentials.session?.role === "reviewer") {
		return `You are reviewing work for ${name}: ${title}. Check out the pull request, read the change against what was asked, and run the relevant tests. Do not push changes. End with a verdict line, APPROVE or CHANGES REQUESTED, and a short list of concrete problems. Your report goes to ${name}, not to people.${team}`;
	}
	if (kind === "task") {
		return `You are working on a task for ${name}: ${title}. Do the work in this workspace. When the code changes, commit to a new branch, push it, and open a pull request with gh. Then wait for its checks with \`gh pr checks --watch\`; when one fails, fix it and push again until they pass, or say in your report why you cannot. End with a short report: what you did, the pull request URL, and anything you could not do or that needs a decision. Your report goes to ${name}, not to people, so put any question in your report.${team}`;
	}
	return credentials.room ? IN_ROOM : "";
}

function turnStartIndex(rows: TranscriptRow[], turnId: string): number {
	return rows.findIndex(
		(row) =>
			row.stepKey === `${turnId}/start` &&
			(row.entry as { type?: string }).type === TURN_START,
	);
}

function turnStartOf(rows: TranscriptRow[], turnId: string): number | null {
	const index = turnStartIndex(rows, turnId);
	const at =
		index >= 0 ? (rows[index]?.entry as { at?: number }).at : undefined;
	return typeof at === "number" ? at : null;
}

/** pdev's entries written after this turn began. */
function entriesOfTurn(rows: TranscriptRow[], turnId: string): PdevEntry[] {
	const start = turnStartIndex(rows, turnId);
	return start < 0 ? [] : pdevEntriesOf(rows.slice(start + 1));
}

async function tailEntries(
	store: SessionStore,
	turnId: string,
): Promise<PdevEntry[]> {
	return entriesOfTurn(await store.transcript(), turnId);
}

interface PiMessage {
	role?: string;
	content?: unknown;
	toolCallId?: string;
	isError?: boolean;
	stopReason?: string;
	errorMessage?: string;
	usage?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		cost?: { total?: number };
	};
}

interface ToolCallBlock {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

function messagesOf(entries: PdevEntry[]): PiMessage[] {
	return entries
		.filter((entry) => entry.type === "message" && entry.message)
		.map((entry) => entry.message as PiMessage);
}

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block: { type?: string; text?: string }) =>
			block.type === "text" ? (block.text ?? "") : "",
		)
		.join("");
}

/**
 * What an earlier attempt of this run already gave pdev. Prompts and steers
 * reach pdev one at a time and in order, so they are matched by position,
 * which also tells apart two messages with the same text.
 */
function deliveryLog(runRows: TranscriptRow[]) {
	const recorded = userTexts(pdevEntriesOf(runRows)).filter(
		(text) => text !== RESUMED,
	);
	let next = 0;
	let matching = true;
	return {
		alreadySent(text: string): boolean {
			if (matching && recorded[next] === text.trim()) {
				next += 1;
				return true;
			}
			matching = false;
			return false;
		},
	};
}

function userTexts(entries: PdevEntry[]): string[] {
	return messagesOf(entries)
		.filter((message) => message.role === "user")
		.map((message) => textOf(message.content).trim());
}

function lastError(entries: PdevEntry[]): string | undefined {
	return messagesOf(entries)
		.filter((message) => message.role === "assistant" && message.errorMessage)
		.at(-1)?.errorMessage;
}

export function summarizeTurn(entries: PdevEntry[]) {
	const messages = messagesOf(entries);
	const assistants = messages.filter((message) => message.role === "assistant");
	const results = new Map(
		messages
			.filter((message) => message.role === "toolResult" && message.toolCallId)
			.map((message) => [message.toolCallId as string, message]),
	);
	const calls = assistants.flatMap((message) =>
		Array.isArray(message.content)
			? (message.content as Array<{ type?: string }>).filter(
					(block): block is ToolCallBlock => block.type === "toolCall",
				)
			: [],
	);
	const reply = textOf(
		assistants.filter((message) => textOf(message.content).trim()).at(-1)
			?.content,
	)
		.trim()
		.slice(0, MAX_REPLY_CHARS);
	return {
		...(reply ? { reply } : {}),
		toolCalls: calls
			.filter((call) => results.has(call.id))
			.map((call) => ({
				name: call.name,
				summary: callSummary(call),
				status: results.get(call.id)?.isError
					? ("failed" as const)
					: ("done" as const),
			})),
		unfinishedCalls: calls.filter((call) => !results.has(call.id)),
		inputTokens: assistants.reduce(
			(sum, message) =>
				sum +
				(message.usage?.input ?? 0) +
				(message.usage?.cacheRead ?? 0) +
				(message.usage?.cacheWrite ?? 0),
			0,
		),
		outputTokens: assistants.reduce(
			(sum, message) => sum + (message.usage?.output ?? 0),
			0,
		),
		costMicrosUsd: Math.round(
			assistants.reduce(
				(sum, message) => sum + (message.usage?.cost?.total ?? 0),
				0,
			) * 1_000_000,
		),
	};
}

function callSummary(call: ToolCallBlock): string {
	const args = call.arguments ?? {};
	const value =
		args.command ??
		args.path ??
		args.pattern ??
		args.shell_id ??
		args.description ??
		(call.name === "ls" ? "." : "");
	return String(value).slice(0, 200);
}

function defaultStore(
	access: SessionStoreAccess,
	sessionId: string,
	freshTicket: () => Promise<string>,
): SessionStore {
	return httpSessionStore({
		baseUrl: access.baseUrl,
		sessionId,
		writeTicket: freshTicket,
	});
}

function defaultContext(credentials: TurnCredentials) {
	if (!credentials.host) throw new Error("Turn has no workspace");
	return hostContext(credentials.host, credentials.host.workspaceId);
}

function isPermanent(error: unknown): boolean {
	return error instanceof ApplicationFailure && error.nonRetryable === true;
}

/** A task's box is still being made when its first turn starts; wait for it, beating. */
async function untilProvisioned<T>(load: () => Promise<T>): Promise<T> {
	const deadline = Date.now() + PROVISIONING_WAIT_MS;
	for (;;) {
		try {
			return await load();
		} catch (error) {
			const provisioning =
				error instanceof Error && /still provisioning/i.test(error.message);
			if (!provisioning || Date.now() > deadline) throw error;
			heartbeat();
			await new Promise((resolve) => setTimeout(resolve, PROVISIONING_POLL_MS));
		}
	}
}

function activityInfo() {
	try {
		return ActivityContext.current().info;
	} catch {
		return undefined;
	}
}

/** A stop someone asked for, as opposed to this worker shutting down or the activity timing out. */
function cancelRequested(): boolean {
	try {
		return (
			ActivityContext.current().cancellationDetails?.cancelRequested ?? true
		);
	} catch {
		return true;
	}
}

function heartbeat(): void {
	try {
		ActivityContext.current().heartbeat();
	} catch {}
}

/** Temporal delivers a cancel only on a heartbeat, so a quiet turn must still beat. */
function keepBeating(everyMs: number): () => void {
	const timer = setInterval(heartbeat, everyMs);
	return () => clearInterval(timer);
}

function cancellationSignal(): AbortSignal | undefined {
	try {
		return ActivityContext.current().cancellationSignal;
	} catch {
		return undefined;
	}
}

interface Flusher {
	add(updates: AcpUpdate[]): void;
	flush(): Promise<void>;
}

/** Batches live updates so a token stream is a few writes a second, not one per token. */
function createFlusher(
	store: SessionStore,
	turnId: string,
	keyPrefix: string,
	everyMs: number,
	now: () => number,
): Flusher {
	let buffer: AcpUpdate[] = [];
	let n = 0;
	let lastFlush = now();
	let inFlight: Promise<void> = Promise.resolve();
	let failure: unknown = null;
	const flushNow = () => {
		if (buffer.length > 0) {
			const batch = buffer;
			buffer = [];
			lastFlush = now();
			const stepKey = `${keyPrefix}${n++}`;
			inFlight = inFlight
				.then(() => store.append({ stepKey, turnId, acp: batch }))
				.then(
					() => {},
					(error) => {
						failure ??= error;
					},
				);
		}
		return inFlight;
	};
	return {
		add(updates) {
			buffer.push(...updates);
			if (now() - lastFlush >= everyMs) void flushNow();
		},
		async flush() {
			await flushNow();
			if (failure) throw failure;
		},
	};
}
