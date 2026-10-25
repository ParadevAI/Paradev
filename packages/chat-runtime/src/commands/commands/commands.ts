import { randomUUID } from "node:crypto";
import {
	deriveQueuedPrompts,
	deriveTimeline,
	emptySnapshot,
	outlineSnapshot,
	reduceMany,
	type SessionOutline,
	type SessionSnapshot,
	type StoredItem,
} from "@superset/chat/core";
import type {
	AgentMessage,
	ApprovalRequest,
	BackgroundSubagentInput,
	CancelTurnInput,
	ChatLaunchContext,
	CloseSessionInput,
	CloseStoppedAccountSessionInput,
	Cursor,
	DiscoverSessionsResult,
	DurableEvent,
	GetItemsInput,
	GetSessionInput,
	PromptInput,
	QueuedPromptInput,
	RecoverAccountSessionInput,
	RespondToApprovalInput,
	ResumeQueueInput,
	SetConfigOptionInput,
	SetModeInput,
	SteerSubagentInput,
	StopBackgroundTaskInput,
} from "@superset/chat/protocol";
import {
	backgroundSubagentInputSchema,
	cancelTurnInputSchema,
	chatLaunchContextSchema,
	closeSessionInputSchema,
	closeStoppedAccountSessionInputSchema,
	createSessionInputSchema,
	discoverSessionsInputSchema,
	forkSessionInputSchema,
	getItemBodiesInputSchema,
	getItemsInputSchema,
	getOutlineInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	queuedPromptInputSchema,
	recoverAccountSessionInputSchema,
	respondToApprovalInputSchema,
	resumeQueueInputSchema,
	rewindSessionInputSchema,
	setConfigOptionInputSchema,
	setModeInputSchema,
	steerSubagentInputSchema,
	stopBackgroundTaskInputSchema,
} from "@superset/chat/protocol";
import { z } from "zod";
import type { ChatDb, ChatSessionRow } from "../../db";
import type { ChatJournal } from "../../journal";
import type { ChatSessionStore } from "../../projection";
import {
	accountSuccessorMatches,
	findAccountCommand,
	findAccountSuccessor,
	readLaunchContext,
} from "../../projection/launchContext";
import type { ChatResetReason, PageResult } from "../../replay";
import { latestSeq, readPage, readSince } from "../../replay";
import type {
	LiveSessionRegistry,
	PromptResult,
	QueueState,
	UnfinishedSession,
} from "../../sessions";
import { SubagentItems } from "../../stream";

export const createSessionCommandSchema = createSessionInputSchema
	.omit({ workspaceId: true })
	.extend({
		scopeId: z.string().min(1),
		cwd: z.string().min(1),
		launchContext: chatLaunchContextSchema.optional(),
		predecessorSessionId: z.string().min(1).optional(),
		resume: z
			.object({
				harnessSessionId: z.string().min(1),
				quiet: z.boolean().optional(),
				requireExact: z.boolean().optional(),
			})
			.optional(),
	});
export type CreateSessionCommandInput = z.input<
	typeof createSessionCommandSchema
>;

export const forkSessionCommandSchema = forkSessionInputSchema.extend({
	cwd: z.string().min(1),
});
export type ForkSessionCommandInput = z.input<typeof forkSessionCommandSchema>;

export const rewindSessionCommandSchema = rewindSessionInputSchema.extend({
	cwd: z.string().min(1),
});
export type RewindSessionCommandInput = z.input<
	typeof rewindSessionCommandSchema
>;

function lastAgentMessageId(events: DurableEvent[]): string | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (
			event?.type !== "item" ||
			event.item.kind !== "agent_message" ||
			event.item.parentItemId
		)
			continue;
		const id = (event.item as AgentMessage).agentMessageId;
		if (id) return id;
	}
	return null;
}

/**
 * The finished turns and items shown before `itemId`, or null when it is not
 * there. `midTurn` is set when `itemId` was sent into a turn already running.
 */
function transcriptBefore(
	snapshot: SessionSnapshot,
	itemId: string,
): { events: DurableEvent[]; midTurn: boolean } | null {
	const events: DurableEvent[] = [];
	for (const group of deriveTimeline(snapshot)) {
		const items = group.entries.flatMap((entry) =>
			entry.kind === "item" ? [entry.item] : entry.items,
		);
		const index = items.findIndex((item) => item.id === itemId);
		const kept = (index === -1 ? items : items.slice(0, index)).filter(
			(item) =>
				item.kind !== "approval_request" ||
				(item as ApprovalRequest).status !== "pending",
		);
		if (kept.length > 0) {
			if (group.turn) events.push({ type: "turn", turn: group.turn });
			for (const item of kept) {
				events.push({ type: "item", item, turnId: group.turnId });
			}
		}
		if (index !== -1) return { events, midTurn: index > 0 };
	}
	return null;
}

export const listSessionsCommandSchema = listSessionsInputSchema
	.omit({ workspaceId: true })
	.extend({ scopeId: z.string().min(1).optional() });
export type ListSessionsCommandInput = z.input<
	typeof listSessionsCommandSchema
>;

export const discoverSessionsCommandSchema = discoverSessionsInputSchema
	.omit({ workspaceId: true })
	.extend({
		scopeId: z.string().min(1),
		cwd: z.string().min(1),
	});
export type DiscoverSessionsCommandInput = z.input<
	typeof discoverSessionsCommandSchema
>;

export type CreateSessionResult = {
	sessionId: string;
	epoch: string;
	terminalId?: string;
};

export type GetSessionResult = {
	accountBound?: true;
	account?: Pick<
		ChatLaunchContext["account"],
		"agent" | "selection" | "identity"
	> | null;
	session: ChatSessionRow | null;
	cursor: Cursor | null;
	/**
	 * Whether a harness process is still behind this session. The stored row
	 * outlives the process — after a host restart it still reads "idle" — so a
	 * caller that wants to prompt has to ask this, not the status.
	 */
	live: boolean;
	/** For a dead session, why it died, when the journal says. */
	lastError?: string;
};

export type ResumeSessionInput = Omit<
	UnfinishedSession,
	"sessionId" | "interrupted"
> & { cwd: string };

type ResumedChat = {
	terminalId: string;
	sessionId: string;
	harness: string;
	harnessSessionId: string;
	pending: Pick<ResumeSessionInput, "prompts" | "pausedPrompts"> | null;
};

export type GetQueueResult = QueueState & { live: boolean };

export type ChatSessionListEntry = ChatSessionRow & {
	accountBound?: true;
	live: boolean;
	terminalId: string | null;
};

export type ChatCommands = {
	createSession(input: CreateSessionCommandInput): CreateSessionResult;
	resumeSession(input: ResumeSessionInput): CreateSessionResult;
	recoverAccountSession(
		input: RecoverAccountSessionInput,
	): Promise<CreateSessionResult & { terminalId: string }>;
	prompt(input: PromptInput): PromptResult;
	removeQueuedPrompt(input: QueuedPromptInput): void;
	steerQueuedPrompt(input: QueuedPromptInput): void;
	resumeQueue(input: ResumeQueueInput): void;
	cancelTurn(input: CancelTurnInput): void;
	stopBackgroundTask(input: StopBackgroundTaskInput): Promise<boolean>;
	steerSubagent(input: SteerSubagentInput): Promise<boolean>;
	backgroundSubagent(input: BackgroundSubagentInput): Promise<boolean>;
	respondToApproval(input: RespondToApprovalInput): void;
	setMode(input: SetModeInput): void;
	setConfigOption(input: SetConfigOptionInput): void;
	closeSession(input: CloseSessionInput): Promise<void>;
	closeStoppedAccountSession(
		input: CloseStoppedAccountSessionInput,
	): Promise<void>;
	closeScope(scopeId: string): Promise<void>;
	forkSession(
		input: ForkSessionCommandInput,
	): Promise<CreateSessionResult | null>;
	rewindSession(input: RewindSessionCommandInput): Promise<CreateSessionResult>;
	getSession(input: GetSessionInput): GetSessionResult;
	getQueue(input: GetSessionInput): GetQueueResult;
	listSessions(input: ListSessionsCommandInput): ChatSessionListEntry[];
	discoverSessions(
		input: DiscoverSessionsCommandInput,
	): Promise<DiscoverSessionsResult>;
	getItems(input: z.input<typeof getItemsInputSchema>): PageResult;
	getOutline(input: z.input<typeof getOutlineInputSchema>): OutlineResult;
	getItemBodies(
		input: z.input<typeof getItemBodiesInputSchema>,
	): ItemBodiesResult;
};

export type OutlineResult =
	| { ok: true; outline: SessionOutline }
	| { ok: false; reset: ChatResetReason };

export type ItemBodiesResult =
	| { ok: true; items: StoredItem[] }
	| { ok: false; reset: ChatResetReason };

export type CommandsOptions = {
	journal: ChatJournal;
	db: ChatDb;
	sessions: ChatSessionStore;
	live: LiveSessionRegistry;
	dedupe: { run<T>(commandId: string, execute: () => T): T };
	mintSessionId?: () => string;
	subagentItems?: SubagentItems;
	validateAccountLaunch?: (
		context: ChatLaunchContext,
		harness: string,
		scopeId: string,
	) => Promise<void>;
};

const MAX_CACHED_REPLAY_EVENTS = 20_000;

export function createCommands(options: CommandsOptions): ChatCommands {
	const mintSessionId = options.mintSessionId ?? randomUUID;
	const subagentItems = options.subagentItems ?? new SubagentItems(options.db);
	const accountForks = new Map<
		string,
		{ input: string; promise: Promise<CreateSessionResult | null> }
	>();

	const replays = new Map<
		string,
		{ epoch: string; seq: number; snapshot: SessionSnapshot }
	>();
	const replaySession = (
		sessionId: string,
	):
		| { ok: true; snapshot: SessionSnapshot }
		| { ok: false; reset: ChatResetReason } => {
		const session = options.sessions.get(sessionId);
		if (!session) return { ok: false, reset: "session_not_found" };
		const seq = latestSeq(options.db, sessionId, session.epoch);
		const cached = replays.get(sessionId);
		const base =
			cached && cached.epoch === session.epoch && cached.seq <= seq
				? cached
				: null;
		if (base && base.seq === seq) {
			return { ok: true, snapshot: base.snapshot };
		}
		const replay = readSince(options.db, sessionId, {
			epoch: session.epoch,
			seq: base?.seq ?? 0,
		});
		if (!replay.ok) return replay;
		const snapshot = reduceMany(
			base?.snapshot ?? emptySnapshot(),
			replay.envelopes,
		);
		replays.delete(sessionId);
		replays.set(sessionId, {
			epoch: session.epoch,
			seq: replay.envelopes.at(-1)?.cursor.seq ?? base?.seq ?? 0,
			snapshot,
		});
		let cachedEvents = 0;
		for (const entry of replays.values()) cachedEvents += entry.seq;
		for (const [key, entry] of replays) {
			if (cachedEvents <= MAX_CACHED_REPLAY_EVENTS || key === sessionId) break;
			replays.delete(key);
			cachedEvents -= entry.seq;
		}
		if (cachedEvents > MAX_CACHED_REPLAY_EVENTS) replays.delete(sessionId);
		return { ok: true, snapshot };
	};

	const resumedByTerminal = new Map<string, ResumedChat>();
	const resumedFor = (
		input: z.output<typeof createSessionCommandSchema>,
	): ResumedChat | null => {
		if (!input.terminalId || !input.resume) return null;
		const resumed = resumedByTerminal.get(input.terminalId);
		if (
			!resumed ||
			resumed.harness !== input.harness ||
			resumed.harnessSessionId !== input.resume.harnessSessionId
		) {
			return null;
		}
		return resumed;
	};
	const handOff = (resumed: ResumedChat): CreateSessionResult | null => {
		const row = options.sessions.get(resumed.sessionId);
		const live = options.live.get(resumed.sessionId);
		if (!row || !live || live.state.status === "dead") return null;
		if (!resumed.pending) resumedByTerminal.delete(resumed.terminalId);
		return { sessionId: resumed.sessionId, epoch: row.epoch };
	};
	const sendPending = (resumed: ResumedChat, sessionId: string): void => {
		const pending = resumed.pending;
		if (!pending) {
			resumedByTerminal.delete(resumed.terminalId);
			return;
		}
		resumed.sessionId = sessionId;
		options.live
			.require(sessionId)
			.promptOnceStarted(pending.prompts, pending.pausedPrompts, () => {
				resumed.pending = null;
			});
	};

	const lastErrorNotice = (sessionId: string): string | null => {
		const replay = replaySession(sessionId);
		if (!replay.ok) return null;
		let latest: { at: number; text: string } | null = null;
		for (const { item } of replay.snapshot.items.values()) {
			if (item.kind !== "notice") continue;
			const notice = item as { noticeKind?: string; text?: string };
			if (notice.noticeKind !== "error" || !notice.text) continue;
			if (!latest || item.startedAtMs >= latest.at) {
				latest = { at: item.startedAtMs, text: notice.text };
			}
		}
		return latest?.text ?? null;
	};

	const listSessions = (
		input: ListSessionsCommandInput,
	): ChatSessionListEntry[] => {
		const parsed = listSessionsCommandSchema.parse(input);
		const rows = parsed.scopeId
			? options.sessions.listByScope(parsed.scopeId)
			: options.sessions.list();
		return rows.slice(0, parsed.limit).map((row) => {
			const live = options.live.get(row.sessionId);
			return {
				...row,
				...(row.launchContextJson !== null
					? { accountBound: true as const }
					: {}),
				live: live !== null,
				terminalId: live?.terminalId ?? null,
			};
		});
	};

	return {
		createSession(input) {
			const parsed = createSessionCommandSchema.parse(input);
			if (parsed.launchContext) {
				if (
					parsed.cwd !== parsed.launchContext.cwd ||
					parsed.terminalId !== parsed.launchContext.terminalId
				)
					throw new Error(
						"The saved chat launch context does not match the conversation.",
					);
				const receipt = findAccountCommand(options.db, parsed.commandId);
				if (receipt) {
					if (
						receipt.scopeId !== parsed.scopeId ||
						receipt.harness !== parsed.harness ||
						receipt.launchContextJson !==
							JSON.stringify(parsed.launchContext) ||
						receipt.predecessorSessionId !==
							(parsed.predecessorSessionId ?? null)
					)
						throw new Error(
							"This command already belongs to a different account or conversation.",
						);
					return {
						sessionId: receipt.sessionId,
						epoch: receipt.epoch,
						terminalId: parsed.terminalId,
					};
				}
			} else {
				for (const row of options.sessions.list()) {
					if (row.launchContextJson === null) continue;
					if (
						parsed.resume &&
						row.harnessSessionId === parsed.resume.harnessSessionId
					)
						throw new Error(
							"This conversation has a saved account. Use account-aware recovery.",
						);
					if (parsed.terminalId) {
						let context: ChatLaunchContext | null = null;
						try {
							context = readLaunchContext(row);
						} catch {
							continue;
						}
						if (context?.terminalId === parsed.terminalId)
							throw new Error(
								"This pane has a saved account. Use account-aware recovery.",
							);
					}
				}
			}
			return options.dedupe.run(`createSession:${parsed.commandId}`, () => {
				const resumed = resumedFor(parsed);
				const handedOff = resumed && handOff(resumed);
				if (handedOff) return handedOff;
				if (!options.live.supports(parsed.harness)) {
					throw new Error(`unknown harness ${parsed.harness}`);
				}
				const sessionId = mintSessionId();
				const opened = options.journal.open({
					sessionId,
					scopeId: parsed.scopeId,
					harness: parsed.harness,
					...(parsed.launchContext
						? {
								launchContextJson: JSON.stringify(parsed.launchContext),
								createCommandId: parsed.commandId,
								predecessorSessionId: parsed.predecessorSessionId,
								harnessSessionId: parsed.resume?.harnessSessionId,
							}
						: {}),
				});
				try {
					options.live.create({
						sessionId,
						scopeId: parsed.scopeId,
						harness: parsed.harness,
						cwd: parsed.cwd,
						modeId: parsed.modeId,
						modelId: parsed.modelId,
						resume: parsed.resume,
						terminalId: parsed.terminalId,
						launchContext: parsed.launchContext,
					});
				} catch (error) {
					options.journal.discard(sessionId);
					throw error;
				}
				if (resumed) sendPending(resumed, sessionId);
				return {
					sessionId,
					epoch: opened.epoch,
					...(parsed.launchContext ? { terminalId: parsed.terminalId } : {}),
				};
			});
		},

		resumeSession(input) {
			const created = this.createSession({
				commandId: randomUUID(),
				scopeId: input.scopeId,
				cwd: input.cwd,
				harness: input.harness,
				modeId: input.modeId,
				modelId: input.modelId,
				terminalId: input.terminalId,
				resume: { harnessSessionId: input.harnessSessionId },
			});
			const pending = {
				prompts: input.prompts,
				pausedPrompts: input.pausedPrompts,
			};
			if (!input.terminalId) {
				options.live
					.require(created.sessionId)
					.promptOnceStarted(pending.prompts, pending.pausedPrompts);
				return created;
			}
			const resumed: ResumedChat = {
				terminalId: input.terminalId,
				sessionId: created.sessionId,
				harness: input.harness,
				harnessSessionId: input.harnessSessionId,
				pending,
			};
			resumedByTerminal.set(input.terminalId, resumed);
			sendPending(resumed, created.sessionId);
			return created;
		},

		async recoverAccountSession(input) {
			const parsed = recoverAccountSessionInputSchema.parse(input);
			let source = options.sessions.get(parsed.sessionId);
			if (!source) throw new Error("The saved conversation was not found.");
			const visited = new Set<string>();
			for (;;) {
				if (visited.has(source.sessionId) || visited.size >= 100)
					throw new Error("The saved conversation recovery chain is invalid.");
				visited.add(source.sessionId);
				const next = findAccountSuccessor(options.db, source.sessionId);
				if (!next) break;
				if (!accountSuccessorMatches(source, next))
					throw new Error("The saved conversation recovery account changed.");
				source = next;
			}
			const context = readLaunchContext(source);
			if (!context || !options.validateAccountLaunch)
				throw new Error(
					"This conversation does not have a recoverable saved account.",
				);
			const receipt = findAccountCommand(options.db, parsed.commandId);
			if (receipt && !visited.has(receipt.sessionId))
				throw new Error(
					"This command already belongs to another conversation.",
				);
			if (options.live.isClosing(source.sessionId))
				throw new Error(
					"The previous agent is still closing. Wait for it to stop before recovering.",
				);
			const registered = options.live.get(source.sessionId);
			if (registered?.state.status === "dead")
				throw new Error(
					"The stopped agent is still registered. Close the stopped agent before retrying recovery.",
				);
			if (registered || receipt)
				return {
					sessionId: source.sessionId,
					epoch: source.epoch,
					terminalId: context.terminalId,
				};
			// Reading the journal repairs the native-id projection after a host restart.
			options.journal.cursor(source.sessionId);
			source = options.sessions.get(source.sessionId) as ChatSessionRow;
			if (source.queuedCount > 0)
				throw new Error(
					"This conversation has unsent queued messages. Review and remove them before resuming.",
				);
			if (!source.harnessSessionId)
				throw new Error(
					"The saved conversation has no confirmed native session ID.",
				);
			const unchanged = JSON.stringify(source);
			await options.validateAccountLaunch(
				context,
				source.harness,
				source.scopeId,
			);
			if (
				JSON.stringify(options.sessions.get(source.sessionId)) !== unchanged ||
				findAccountSuccessor(options.db, source.sessionId) ||
				options.live.isClosing(source.sessionId) ||
				options.live.get(source.sessionId)
			)
				throw new Error(
					"The conversation changed or was already resumed. Refresh it before trying again.",
				);
			if (
				options.sessions
					.list()
					.some(
						(row) =>
							row.sessionId !== source.sessionId &&
							(options.live.get(row.sessionId) ||
								options.live.isClosing(row.sessionId)) &&
							row.launchContextJson !== null &&
							readLaunchContext(row)?.terminalId === context.terminalId,
					)
			)
				throw new Error("This pane already has a running conversation.");
			const created = this.createSession({
				commandId: parsed.commandId,
				scopeId: source.scopeId,
				harness: source.harness,
				cwd: context.cwd,
				terminalId: context.terminalId,
				launchContext: context,
				predecessorSessionId: source.sessionId,
				resume: {
					harnessSessionId: source.harnessSessionId,
					requireExact: true,
				},
			});
			return { ...created, terminalId: context.terminalId };
		},

		prompt(input) {
			const parsed: PromptInput = promptInputSchema.parse(input);
			return options.dedupe.run(`prompt:${parsed.commandId}`, () =>
				options.live
					.require(parsed.sessionId)
					.prompt(
						parsed.content,
						parsed.clientId,
						parsed.steer?.expectedTurnId,
					),
			);
		},

		removeQueuedPrompt(input) {
			const parsed: QueuedPromptInput = queuedPromptInputSchema.parse(input);
			options.dedupe.run(`removeQueuedPrompt:${parsed.commandId}`, () => {
				const live = options.live.get(parsed.sessionId);
				if (live) {
					live.removeQueued(parsed.itemId);
					return;
				}
				const row = options.sessions.get(parsed.sessionId);
				if (row?.launchContextJson == null)
					throw new Error("The conversation is not live.");
				const replayed = replaySession(parsed.sessionId);
				if (!replayed.ok) throw new Error("The saved queue could not be read.");
				const stored = replayed.snapshot.items.get(parsed.itemId);
				const queued = deriveQueuedPrompts(replayed.snapshot).find(
					(item) => item.id === parsed.itemId,
				);
				if (!stored || !queued)
					throw new Error("The queued message was not found.");
				const item = { ...queued, discarded: true };
				delete item.queued;
				options.journal.append(parsed.sessionId, {
					type: "item",
					item,
					turnId: stored.turnId,
				});
			});
		},

		steerQueuedPrompt(input) {
			const parsed: QueuedPromptInput = queuedPromptInputSchema.parse(input);
			options.dedupe.run(`steerQueuedPrompt:${parsed.commandId}`, () => {
				options.live.require(parsed.sessionId).steerQueued(parsed.itemId);
			});
		},

		resumeQueue(input) {
			const parsed: ResumeQueueInput = resumeQueueInputSchema.parse(input);
			options.dedupe.run(`resumeQueue:${parsed.commandId}`, () => {
				options.live.require(parsed.sessionId).resumeQueue();
			});
		},

		stopBackgroundTask(input) {
			const parsed: StopBackgroundTaskInput =
				stopBackgroundTaskInputSchema.parse(input);
			return options.dedupe.run(`stopBackgroundTask:${parsed.commandId}`, () =>
				options.live
					.require(parsed.sessionId)
					.stopBackgroundTask(parsed.taskId),
			);
		},

		steerSubagent(input) {
			const parsed: SteerSubagentInput = steerSubagentInputSchema.parse(input);
			return options.dedupe.run(`steerSubagent:${parsed.commandId}`, () =>
				options.live
					.require(parsed.sessionId)
					.steerSubagent(parsed.taskId, parsed.content),
			);
		},

		backgroundSubagent(input) {
			const parsed: BackgroundSubagentInput =
				backgroundSubagentInputSchema.parse(input);
			return options.dedupe.run(`backgroundSubagent:${parsed.commandId}`, () =>
				options.live
					.require(parsed.sessionId)
					.backgroundSubagent(parsed.taskId),
			);
		},

		cancelTurn(input) {
			const parsed: CancelTurnInput = cancelTurnInputSchema.parse(input);
			options.dedupe.run(`cancelTurn:${parsed.commandId}`, () => {
				options.live
					.require(parsed.sessionId)
					.cancelTurn(parsed.turnId, parsed.pauseQueue);
			});
		},

		respondToApproval(input) {
			const parsed: RespondToApprovalInput =
				respondToApprovalInputSchema.parse(input);
			options.dedupe.run(`respondToApproval:${parsed.commandId}`, () => {
				options.live
					.require(parsed.sessionId)
					.respondToApproval(parsed.approvalId, parsed.decision);
			});
		},

		setMode(input) {
			const parsed: SetModeInput = setModeInputSchema.parse(input);
			options.dedupe.run(`setMode:${parsed.commandId}`, () => {
				options.live.require(parsed.sessionId).setMode(parsed.modeId);
			});
		},

		setConfigOption(input) {
			const parsed: SetConfigOptionInput =
				setConfigOptionInputSchema.parse(input);
			options.dedupe.run(`setConfigOption:${parsed.commandId}`, () => {
				options.live
					.require(parsed.sessionId)
					.setConfigOption(parsed.configId, parsed.value);
			});
		},

		/**
		 * Branching is two steps: the agent copies its own session, and a new
		 * chat is opened onto the copy. Null when the harness cannot fork — the
		 * caller shows the conversation it already has rather than a dead one.
		 */
		async forkSession(input) {
			const parsed = forkSessionCommandSchema.parse(input);
			const original = options.sessions.get(parsed.sessionId);
			const context = original ? readLaunchContext(original) : null;
			if (context && original) {
				const pending = accountForks.get(parsed.commandId);
				if (pending) {
					if (pending.input !== JSON.stringify(parsed))
						throw new Error(
							"This command already belongs to another conversation.",
						);
					return pending.promise;
				}
			}
			const execute = async () => {
				if (context && original) {
					const receipt = findAccountCommand(options.db, parsed.commandId);
					if (receipt) {
						const prior = readLaunchContext(receipt);
						if (
							prior?.forkOfSessionId !== parsed.sessionId ||
							receipt.scopeId !== original.scopeId ||
							receipt.harness !== (parsed.harness ?? original.harness)
						)
							throw new Error(
								"This command already belongs to another conversation.",
							);
						return {
							sessionId: receipt.sessionId,
							epoch: receipt.epoch,
							terminalId: prior.terminalId,
						};
					}
					if (
						parsed.cwd !== context.cwd ||
						(parsed.harness && parsed.harness !== original?.harness) ||
						!options.validateAccountLaunch
					)
						throw new Error(
							"An account-bound branch must keep its original agent and working folder.",
						);
					await options.validateAccountLaunch(
						context,
						original.harness,
						original.scopeId,
					);
				}
				const live = options.live.require(parsed.sessionId);
				const forked = await live.fork();
				if (!forked) return null;
				const source = options.sessions.get(parsed.sessionId);
				if (!source) return null;
				if (context) {
					if (source.launchContextJson !== original?.launchContextJson)
						throw new Error("The original conversation account changed.");
					await options.validateAccountLaunch?.(
						context,
						source.harness,
						source.scopeId,
					);
				}
				return this.createSession({
					commandId: parsed.commandId,
					scopeId: source.scopeId,
					cwd: parsed.cwd,
					harness: parsed.harness ?? source.harness,
					resume: {
						harnessSessionId: forked,
						...(context ? { requireExact: true } : {}),
					},
					terminalId: parsed.terminalId ?? live.terminalId,
					...(context
						? {
								launchContext: {
									...context,
									forkOfSessionId: source.sessionId,
								},
							}
						: {}),
				});
			};
			if (!context) return execute();
			const promise = execute();
			accountForks.set(parsed.commandId, {
				input: JSON.stringify(parsed),
				promise,
			});
			try {
				return await promise;
			} finally {
				accountForks.delete(parsed.commandId);
			}
		},

		async closeStoppedAccountSession(input) {
			const { sessionId } = closeStoppedAccountSessionInputSchema.parse(input);
			const row = options.sessions.get(sessionId);
			if (!row || !readLaunchContext(row))
				throw new Error(
					"This action requires a saved account-bound conversation.",
				);
			if (options.live.isClosing(sessionId))
				throw new Error(
					"This agent is still closing. Wait before trying again.",
				);
			const live = options.live.get(sessionId);
			if (!live || live.state.status !== "dead")
				throw new Error(
					"Only a failed registered account agent can be stopped here.",
				);
			const replayed = replaySession(sessionId);
			if (!replayed.ok)
				throw new Error(
					"The saved queue could not be read. Nothing was stopped.",
				);
			if (
				live.queueState.prompts.length > 0 ||
				deriveQueuedPrompts(replayed.snapshot).length > 0
			)
				throw new Error(
					"This conversation has unsent queued messages. Review and remove them before stopping the agent.",
				);
			// No await between queue validation and registry removal: a prompt cannot
			// enter the agent after the user confirmed this bounded stop action.
			replays.delete(sessionId);
			try {
				await options.live.dispose(sessionId);
			} finally {
				options.journal.announce(sessionId);
			}
		},

		/**
		 * A rewind continues in a new session with the transcript before the
		 * chosen message copied in, so the chat reads the same. An agent that can
		 * fork at a message resumes its own history cut there; any other is told
		 * that conversation in a hidden part of the edited prompt.
		 */
		async rewindSession(input) {
			const parsed = rewindSessionCommandSchema.parse(input);
			return options.dedupe.run(
				`rewindSession:${parsed.commandId}`,
				async () => {
					const source = options.sessions.get(parsed.sessionId);
					const replay = replaySession(parsed.sessionId);
					if (!source || !replay.ok) {
						throw new Error(`chat session ${parsed.sessionId} is not running`);
					}
					const before = transcriptBefore(replay.snapshot, parsed.itemId);
					if (!before) {
						throw new Error(
							`message ${parsed.itemId} is not in chat session ${parsed.sessionId}`,
						);
					}
					const sourceLive = options.live.get(parsed.sessionId);
					// Some agents fork a whole turn, so a cut inside one would keep what came after it.
					const cutAt = before.midTurn
						? null
						: lastAgentMessageId(before.events);
					const forked =
						cutAt && sourceLive
							? await sourceLive
									.fork({ upToMessageId: cutAt })
									.catch((error: unknown) => {
										console.warn(
											"[chat-runtime] could not fork the agent at the rewind point",
											error,
										);
										return null;
									})
							: null;
					const created = this.createSession({
						commandId: parsed.commandId,
						scopeId: source.scopeId,
						cwd: parsed.cwd,
						harness: source.harness,
						modeId: sourceLive?.state.modeId ?? parsed.modeId,
						modelId: parsed.modelId,
						terminalId: sourceLive?.terminalId,
						...(forked
							? { resume: { harnessSessionId: forked, quiet: true } }
							: {}),
					});
					try {
						const live = options.live.require(created.sessionId);
						live.seed(before.events);
						live.prompt(
							[
								...(parsed.handoffPrompt && !forked
									? [
											{
												type: "text" as const,
												text: parsed.handoffPrompt,
												hidden: true,
											},
										]
									: []),
								{ type: "text", text: parsed.prompt },
							],
							`rewind-${parsed.commandId}`,
						);
					} catch (error) {
						await this.closeSession({ sessionId: created.sessionId }).catch(
							() => undefined,
						);
						throw error;
					}
					return created;
				},
			);
		},

		async closeSession(input) {
			const parsed: CloseSessionInput = closeSessionInputSchema.parse(input);
			const wasLive = options.live.get(parsed.sessionId) !== null;
			replays.delete(parsed.sessionId);
			subagentItems.forget(parsed.sessionId);
			try {
				await options.live.dispose(parsed.sessionId);
			} finally {
				if (wasLive) options.journal.announce(parsed.sessionId);
			}
		},

		async closeScope(scopeId) {
			const closed = await options.live.disposeScope(scopeId);
			for (const sessionId of closed) {
				replays.delete(sessionId);
				subagentItems.forget(sessionId);
				options.journal.announce(sessionId);
			}
		},

		getSession(input) {
			const parsed: GetSessionInput = getSessionInputSchema.parse(input);
			const seq = options.sessions.get(parsed.sessionId)
				? options.journal.cursor(parsed.sessionId).seq
				: null;
			// Reading the cursor can backfill the row, so read the row after it.
			const session = options.sessions.get(parsed.sessionId);
			const lastError =
				session?.status === "dead" ? lastErrorNotice(parsed.sessionId) : null;
			let account: GetSessionResult["account"] = null;
			try {
				const context = session ? readLaunchContext(session) : null;
				if (context) {
					const { agent, selection, identity } = context.account;
					account = { agent, selection, identity };
				}
			} catch {}
			return {
				...(session?.launchContextJson != null
					? { accountBound: true as const, account }
					: {}),
				live: options.live.get(parsed.sessionId) !== null,
				session,
				cursor: session && seq !== null ? { epoch: session.epoch, seq } : null,
				...(lastError ? { lastError } : {}),
			};
		},

		getQueue(input) {
			const parsed: GetSessionInput = getSessionInputSchema.parse(input);
			const session = options.live.get(parsed.sessionId);
			if (!session) {
				const row = options.sessions.get(parsed.sessionId);
				if (row?.launchContextJson == null)
					return { live: false, paused: false, prompts: [] };
				const replayed = replaySession(parsed.sessionId);
				if (!replayed.ok) throw new Error("The saved queue could not be read.");
				return {
					live: false,
					paused: true,
					prompts: deriveQueuedPrompts(replayed.snapshot).map((item) => ({
						itemId: item.id,
						clientId: item.clientId,
						content: item.content,
						queuedAtMs: item.startedAtMs,
					})),
				};
			}
			return { live: true, ...session.queueState };
		},

		listSessions,

		discoverSessions(input) {
			const parsed = discoverSessionsCommandSchema.parse(input);
			return options.live.discoverSessions({
				harness: parsed.harness,
				scopeId: parsed.scopeId,
				cwd: parsed.cwd,
				...(parsed.cursor ? { cursor: parsed.cursor } : {}),
			});
		},

		getItems(input) {
			const parsed: GetItemsInput = getItemsInputSchema.parse(input);
			const page = readPage(options.db, parsed.sessionId, {
				before: parsed.before,
				limit: parsed.limit,
			});
			if (!page.ok || parsed.nestedSubagents) return page;
			return {
				...page,
				envelopes: page.envelopes.filter(
					(envelope) => !subagentItems.hiddenFromFlatView(envelope),
				),
			};
		},

		getOutline(input) {
			const { sessionId, nestedSubagents } = getOutlineInputSchema.parse(input);
			const replayed = replaySession(sessionId);
			if (!replayed.ok) return replayed;
			const outline = outlineSnapshot(replayed.snapshot);
			if (nestedSubagents) return { ok: true, outline };
			return {
				ok: true,
				outline: {
					...outline,
					items: outline.items.filter(
						(stored) => !subagentItems.hides(sessionId, stored.item),
					),
				},
			};
		},

		getItemBodies(input) {
			const { sessionId, itemIds, nestedSubagents } =
				getItemBodiesInputSchema.parse(input);
			const replayed = replaySession(sessionId);
			if (!replayed.ok) return replayed;
			return {
				ok: true,
				items: itemIds.flatMap((id) => {
					const stored = replayed.snapshot.items.get(id);
					if (
						!stored ||
						(!nestedSubagents && subagentItems.hides(sessionId, stored.item))
					)
						return [];
					return [stored];
				}),
			};
		},
	};
}
