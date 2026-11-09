import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import type { DeltaChannel, DurableEnvelope } from "@superset/chat/protocol";
import { isDurableEnvelope, parseCursor } from "@superset/chat/protocol";
import type {
	ChatRuntime,
	ChatSessionChange,
	HarnessFactory,
	HarnessRegistry,
	LiveSessionObserver,
	ResolveAttachment,
	WsSinkSocket,
} from "@superset/chat-runtime";
import {
	CHAT_DB_FILENAME,
	CodexAdapter,
	createChatRouter,
	createChatRuntime,
	createClaudeAdapter,
	createWsSink,
	DEFAULT_MIGRATIONS_FOLDER,
} from "@superset/chat-runtime";
import { HOST_CHAT_RESUME_MARKER_FILE } from "@superset/shared/host-version";
import type { Hono, MiddlewareHandler } from "hono";
import type { HostDb } from "../db";
import { reportAttachmentResolveFailure } from "../sentry";
import { storedChatConfig } from "../trpc/router/agents/agents";
import { importCloudAttachments } from "../trpc/router/attachments/attachments";
import type { ApiClient } from "../types";
import { cliFloor } from "./acpCatalogue";
import { acpHarnessEntries } from "./acpHarnesses";
import { resolveAgentCli } from "./agentCli";
import { buildChatAgentEnv } from "./agentEnv";
import type { ChatAgentBridge } from "./chatAgentBridge";
import { type ClosedMidTurnChat, createClosedMidTurn } from "./closedMidTurn";
import { createGitCheckpoints } from "./gitCheckpoints";
import { createAttachmentResolver } from "./resolveAttachment";
import { createResolveCwd } from "./resolveCwd";
import {
	type ClosedChat,
	closedChatsOf,
	recordUnfinishedChats,
	restoreClosedChats,
	resumeUnfinishedChats,
	writeClosedChats,
} from "./resumeAfterUpdate";

const RECORD_DEBOUNCE_MS = 300;

const CLOSED_CHATS_FILE = "chat-closed-mid-turn.json";

export const CHAT_V3_TRPC_PATH = "/chat-v3/trpc";
export const CHAT_V3_STREAM_PATH = "/chat-v3/sessions/:sessionId/stream";

/**
 * `src/db/drizzle/` is a runtime file dependency no bundle inlines: the desktop
 * points here at its copy, and the host-service build emits it next to
 * host-service.js.
 */
function migrationsFolder(): string {
	const fromEnv = process.env.SUPERSET_CHAT_V3_MIGRATIONS?.trim();
	if (fromEnv) return fromEnv;
	const sideBySide = join(
		dirname(fileURLToPath(import.meta.url)),
		"chat-migrations",
	);
	return existsSync(sideBySide) ? sideBySide : DEFAULT_MIGRATIONS_FOLDER;
}

function harnessRegistry(
	db: HostDb,
	agents: ChatAgentBridge | undefined,
	resolveAttachment: ResolveAttachment,
): HarnessRegistry {
	const entries: [string, HarnessFactory][] = [
		[
			"claude-code",
			(options) =>
				createClaudeAdapter({
					resolveAttachment,
					launch: async () => {
						const cli = await resolveAgentCli({
							binary: "claude",
							...cliFloor("claude-acp"),
							env: () =>
								buildChatAgentEnv({
									db,
									cwd: options.cwd,
									workspaceId: options.scopeId,
									terminalId: options.terminalId,
									agentConfigId: options.agentConfigId,
									presetId: "claude",
								}),
						});
						return {
							pathToClaudeCodeExecutable:
								process.env.SUPERSET_CHAT_V3_CLAUDE_BIN ?? cli.command,
							env: cli.env,
						};
					},
				}),
		],
		[
			"codex",
			(options) =>
				new CodexAdapter({
					resolveAttachment,
					launch: async () => {
						const cli = await resolveAgentCli({
							binary: "codex",
							...cliFloor("codex-acp"),
							env: () =>
								buildChatAgentEnv({
									db,
									cwd: options.cwd,
									workspaceId: options.scopeId,
									terminalId: options.terminalId,
									agentConfigId: options.agentConfigId,
									presetId: "codex",
								}),
						});
						return { command: cli.command, env: cli.env };
					},
				}),
		],
		...acpHarnessEntries(db, resolveAttachment, agents),
	];
	return new Map(entries);
}

export type ChatV3Mount = {
	runtime(): ChatRuntime;
	/** The runtime, without creating chat.db on a host that has never had a chat. */
	existingRuntime(): ChatRuntime | null;
	closeScope(scopeId: string): Promise<void>;
	recordUnfinished(): void;
	resumeAfterUpdate(): void;
	closedMidTurn(): ClosedMidTurnChat[];
	resumeClosedMidTurn(): Promise<number>;
	keepClosedMidTurnPaused(): void;
	dispose(): Promise<void>;
};

/**
 * Lazily built: opening chat.db and running its migrations is work no host
 * should pay for until something actually asks for a chat session.
 */
export function createChatV3Mount(options: {
	db: HostDb;
	api: ApiClient;
	dbPath: string;
	agents?: ChatAgentBridge;
	onSessionChanged?: (change: ChatSessionChange) => void;
	onAppend?: (envelope: DurableEnvelope) => void;
}): ChatV3Mount {
	let built: ChatRuntime | null = null;
	const markerPath = join(
		dirname(options.dbPath),
		HOST_CHAT_RESUME_MARKER_FILE,
	);
	const closedChatsPath = join(dirname(options.dbPath), CLOSED_CHATS_FILE);

	let recordTimer: ReturnType<typeof setTimeout> | null = null;
	/**
	 * The chats the next launch offers to resume: the ones still waiting from
	 * the last launch, and every live one with work left. Kept current as turns
	 * start and end, so a crash or a reboot leaves it behind too.
	 */
	const recordClosed = () => {
		if (recordTimer) clearTimeout(recordTimer);
		recordTimer = null;
		const chats = new Map<string, ClosedChat>();
		for (const chat of closedChats.pending()) chats.set(chat.sessionId, chat);
		for (const chat of built ? closedChatsOf(built) : [])
			chats.set(chat.sessionId, chat);
		try {
			writeClosedChats(closedChatsPath, [...chats.values()]);
		} catch (error) {
			console.warn("[chat-v3] could not record the chats to resume", error);
		}
		return chats.size;
	};
	const recordSoon = () => {
		if (recordTimer) return;
		recordTimer = setTimeout(recordClosed, RECORD_DEBOUNCE_MS);
		recordTimer.unref?.();
	};
	const observer: LiveSessionObserver = {
		started: (session) => options.agents?.started(session),
		published: (envelope, session) => {
			options.agents?.published(envelope, session);
			if (!isDurableEnvelope(envelope)) return;
			const { event } = envelope;
			if (event.type !== "item" || event.item.kind === "user_message") {
				recordSoon();
			}
		},
		stopped: (sessionId) => {
			options.agents?.stopped(sessionId);
			recordSoon();
		},
	};

	const runtime = (): ChatRuntime => {
		if (built) return built;
		built = createChatRuntime({
			dataDir: dirname(options.dbPath),
			migrationsFolder: migrationsFolder(),
			harnesses: harnessRegistry(
				options.db,
				options.agents,
				createAttachmentResolver({
					importCloud: (fileIds) => importCloudAttachments(options, fileIds),
					report: reportAttachmentResolveFailure,
				}),
			),
			observer,
			checkpoints: createGitCheckpoints(),
			onSessionChanged: options.onSessionChanged,
			onAppend: options.onAppend,
		});
		return built;
	};

	const closedChats = createClosedMidTurn({
		runtime,
		resolveCwd: createResolveCwd(options.db),
		onChange: recordSoon,
	});

	return {
		runtime,
		existingRuntime: () =>
			built ??
			(existsSync(join(dirname(options.dbPath), CHAT_DB_FILENAME))
				? runtime()
				: null),
		closeScope: async (scopeId) => {
			await built?.commands.closeScope(scopeId);
		},
		resumeAfterUpdate: () => {
			const update = resumeUnfinishedChats({
				markerPath,
				runtime,
				resolveCwd: createResolveCwd(options.db),
				keepsAccount: (sessionId) => {
					const row = runtime().sessions.get(sessionId);
					return !row?.agentConfigId || storedChatConfig(options.db, row).keeps;
				},
			});
			if (update.resumed > 0) {
				console.log(
					`[chat-v3] resumed ${update.resumed} chat(s) after the update`,
				);
			}
			const waiting = [...restoreClosedChats(closedChatsPath), ...update.offer];
			for (const chat of waiting) {
				closedChats.add(chat);
				options.agents?.closedMidTurn(chat);
			}
			if (waiting.length > 0) {
				console.log(
					`[chat-v3] ${waiting.length} chat(s) the last shutdown cut off wait for the launch prompt`,
				);
			}
			recordClosed();
		},
		closedMidTurn: () => closedChats.list(),
		resumeClosedMidTurn: () => closedChats.resume(),
		keepClosedMidTurnPaused: () => closedChats.keepPaused(),
		recordUnfinished: () => {
			if (!built || !recordUnfinishedChats(built, markerPath)) {
				const recorded = recordClosed();
				console.log(
					`[chat-v3] shutdown: ${recorded} chat(s) to offer on the next launch`,
				);
				return;
			}
			if (recordTimer) clearTimeout(recordTimer);
			recordTimer = null;
			writeClosedChats(closedChatsPath, closedChats.pending());
			console.log(
				`[chat-v3] update restart: ${built.live.unfinished().length} chat(s) to resume`,
			);
			built.live.disposeAll().catch((error: unknown) => {
				console.warn("[chat-v3] could not stop chats for the update", error);
			});
		},
		dispose: async () => {
			if (recordTimer) clearTimeout(recordTimer);
			recordTimer = null;
			const current = built;
			built = null;
			await current?.dispose();
		},
	};
}

export function registerChatV3Routes(options: {
	app: Hono;
	db: HostDb;
	mount: ChatV3Mount;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	trpcPath?: string;
	streamPath?: string;
}): void {
	const resolveCwd = createResolveCwd(options.db);

	const endpoint = options.trpcPath ?? CHAT_V3_TRPC_PATH;
	// Built on first request, not at registration: touching `runtime()` here
	// would open chat.db on every gated host at startup.
	let handler: MiddlewareHandler | null = null;
	options.app.use(`${endpoint}/*`, (c, next) => {
		handler ??= trpcServer({
			endpoint,
			router: createChatRouter(options.mount.runtime(), { resolveCwd }),
		});
		return handler(c, next);
	});

	options.app.get(
		options.streamPath ?? CHAT_V3_STREAM_PATH,
		options.upgradeWebSocket((c) => {
			const sessionId = c.req.param("sessionId") ?? "";
			const sinceRaw = c.req.query("since");
			const deltasRaw = c.req.query("deltas");
			const nestedSubagents = c.req.query("nestedSubagents") === "1";
			let unsubscribe: (() => void) | null = null;

			return {
				onOpen: (_event, ws) => {
					const socket = ws as unknown as WsSinkSocket;
					let since: ReturnType<typeof parseCursor> | undefined;
					if (sinceRaw !== undefined) {
						try {
							since = parseCursor(sinceRaw);
						} catch {
							socket.close();
							return;
						}
					}

					const deltas = (deltasRaw ?? "")
						.split(",")
						.map((channel) => channel.trim())
						.filter(
							(channel): channel is DeltaChannel =>
								channel === "text" ||
								channel === "tool_input" ||
								channel === "terminal" ||
								channel === "background",
						);

					const subscription = options.mount
						.runtime()
						.subscribe(
							sessionId,
							{ since, deltas, nestedSubagents },
							createWsSink(socket),
						);
					unsubscribe = () => subscription.unsubscribe();
				},

				onMessage: () => {
					// Server-to-client stream; commands ride the tRPC router.
				},

				onClose: () => {
					unsubscribe?.();
					unsubscribe = null;
				},

				onError: () => {
					unsubscribe?.();
					unsubscribe = null;
				},
			};
		}),
	);
}
