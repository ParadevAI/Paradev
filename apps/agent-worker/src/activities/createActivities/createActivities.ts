import { runToolCall } from "@earendil-works/pi-agent-core";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Message,
	Model,
	SimpleStreamOptions,
	ToolCall,
	ToolResultMessage,
} from "@earendil-works/pi-ai";
import {
	type AcpUpdate,
	createRemoteTools,
	type FileChange,
	type HostJobs,
	PiToAcp,
	type RemoteTool,
} from "@superset/agent-harness";
import { Context as ActivityContext } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import type {
	CredentialsProvider,
	TurnCredentials,
} from "../../clients/credentials";
import { hostContext, httpHostJobs } from "../../clients/hostJobs";
import type { SessionStore, TranscriptRow } from "../../clients/sessionStore";
import { httpSessionStore } from "../../clients/sessionStore";
import type { SettleTurnInput, TurnSettler } from "../../clients/settler";
import { routerModel } from "../../model/routerModel";
import { buildSystemPrompt } from "../../systemPrompt";

export type StreamFn = (
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export interface ActivityDeps {
	credentials: CredentialsProvider;
	settler: TurnSettler;
	stream: StreamFn;
	sessionStore?: (
		credentials: TurnCredentials,
		sessionId: string,
	) => SessionStore;
	hostJobs?: (credentials: TurnCredentials) => HostJobs;
	workspaceContext?: (credentials: TurnCredentials) => Promise<{ cwd: string }>;
	readAgentsMd?: (host: HostJobs, cwd: string) => Promise<string | null>;
	now?: () => number;
	flushEveryMs?: number;
}

interface TurnRef {
	sessionId: string;
	turnId: string;
}

const CREDENTIALS_TTL_MS = 5 * 60_000;
/** The router identifies the caller from `model.headers`; the SDK still needs a key. */
const ROUTER_PLACEHOLDER_KEY = "router";

export function createActivities(deps: ActivityDeps) {
	const now = deps.now ?? Date.now;
	const flushEveryMs = deps.flushEveryMs ?? 150;
	const credentialCache = new Map<
		string,
		{ at: number; value: Promise<TurnCredentials> }
	>();
	const promptCache = new Map<
		string,
		Promise<{ cwd: string; systemPrompt: string }>
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
			credentials,
			ref.sessionId,
		);
		const host = (deps.hostJobs ?? ((c) => httpHostJobs(c.host)))(credentials);
		return { credentials, store, host };
	};

	const workspace = (
		ref: TurnRef,
		credentials: TurnCredentials,
		host: HostJobs,
	) => {
		let cached = promptCache.get(ref.turnId);
		if (!cached) {
			cached = (async () => {
				const { cwd } = await (
					deps.workspaceContext ??
					((c) => hostContext(c.host, c.host.workspaceId))
				)(credentials);
				const agentsMd = await (deps.readAgentsMd ?? readAgentsMd)(host, cwd);
				return { cwd, systemPrompt: buildSystemPrompt({ cwd, agentsMd }) };
			})();
			promptCache.set(ref.turnId, cached);
			cached.catch(() => promptCache.delete(ref.turnId));
		}
		return cached;
	};

	const remoteTools = (
		ref: TurnRef,
		credentials: TurnCredentials,
		host: HostJobs,
		cwd: string,
		onFileChange?: (toolCallId: string, change: FileChange) => void,
	) =>
		createRemoteTools({
			host,
			sessionId: ref.sessionId,
			workspaceId: credentials.host.workspaceId,
			cwd,
			...(onFileChange ? { onFileChange } : {}),
		});

	return {
		async beginTurn(
			input: TurnRef & { promptId: string; text: string },
		): Promise<void> {
			const { store } = await handles(input);
			const toAcp = new PiToAcp("/");
			await store.append({
				stepKey: `${input.turnId}/start`,
				turnId: input.turnId,
				turnStart: { startedAtMs: now() },
				acp: [
					toAcp.running(),
					toAcp.userMessage(`user-${input.promptId}`, input.text),
				],
				transcript: [userMessage(input.text, now())],
			});
		},

		async addSteers(
			input: TurnRef & { steers: Array<{ promptId: string; text: string }> },
		): Promise<void> {
			const { store } = await handles(input);
			const toAcp = new PiToAcp("/");
			for (const steer of input.steers) {
				await store.append({
					stepKey: `steer/${steer.promptId}`,
					turnId: input.turnId,
					acp: [toAcp.userMessage(`user-${steer.promptId}`, steer.text)],
					transcript: [userMessage(steer.text, now())],
				});
			}
		},

		async modelStep(
			input: TurnRef & { step: number },
		): Promise<{ toolCalls: Array<{ id: string; name: string }> }> {
			const key = `${input.turnId}/s${input.step}/model`;
			const { credentials, store, host } = await handles(input);
			const done = await store.transcriptStep(key);
			if (done[0])
				return { toolCalls: toolCallsOf(done[0].entry as AssistantMessage) };

			const [rows, { cwd, systemPrompt }] = await Promise.all([
				store.transcript(),
				workspace(input, credentials, host),
			]);
			const tools = remoteTools(input, credentials, host, cwd);
			const toAcp = new PiToAcp(cwd);
			const messageId = `${input.turnId}-s${input.step}`;
			const flusher = createFlusher(
				store,
				input.turnId,
				`${key}/c`,
				flushEveryMs,
				now,
			);

			const stream = deps.stream(
				{
					...routerModel(credentials.model.baseUrl, credentials.model.modelId),
					headers: credentials.model.headers,
				},
				{
					systemPrompt,
					messages: messagesOf(rows),
					tools: tools.map(declaration),
				},
				{
					apiKey: ROUTER_PLACEHOLDER_KEY,
					reasoning: "medium",
					signal: cancellationSignal(),
				},
			);
			for await (const event of stream) {
				flusher.add(toAcp.assistantEvent(event, messageId));
				heartbeat();
			}
			const message = await stream.result();
			await flusher.flush();

			if (message.stopReason === "error" || message.stopReason === "aborted") {
				const text = message.errorMessage ?? "The model request failed.";
				if (/usage limit|quota|insufficient/i.test(text)) {
					throw ApplicationFailure.nonRetryable(text, "UsageLimitError");
				}
				throw new Error(text);
			}
			await store.append({
				stepKey: key,
				turnId: input.turnId,
				acp: toAcp.assistantEnd(message, messageId),
				transcript: [message],
			});
			return { toolCalls: toolCallsOf(message) };
		},

		async toolStep(
			input: TurnRef & { step: number; toolCallId: string },
		): Promise<{ isError: boolean }> {
			const base = `${input.turnId}/s${input.step}/${input.toolCallId}`;
			const { credentials, store, host } = await handles(input);
			const done = await store.transcriptStep(`${base}/end`);
			if (done[0])
				return {
					isError: Boolean((done[0].entry as ToolResultMessage).isError),
				};

			const [modelRow] = await store.transcriptStep(
				`${input.turnId}/s${input.step}/model`,
			);
			const assistant = modelRow?.entry as AssistantMessage | undefined;
			const call = assistant?.content.find(
				(block): block is ToolCall =>
					block.type === "toolCall" && block.id === input.toolCallId,
			);
			if (!assistant || !call) {
				throw ApplicationFailure.nonRetryable(
					`Tool call ${input.toolCallId} is not in step ${input.step}`,
					"MissingToolCall",
				);
			}

			const { cwd } = await workspace(input, credentials, host);
			let fileChange: FileChange | undefined;
			const tools = remoteTools(input, credentials, host, cwd, (id, change) => {
				if (id === call.id) fileChange = change;
			});
			const toAcp = new PiToAcp(cwd);
			await store.append({
				stepKey: `${base}/start`,
				turnId: input.turnId,
				acp: [toAcp.toolStart(call.id, call.name, call.arguments)],
			});

			const flusher = createFlusher(
				store,
				input.turnId,
				`${base}/u`,
				flushEveryMs,
				now,
			);
			const outcome = await runToolCall(call, {
				tools: tools as RemoteTool[],
				assistantMessage: assistant,
				context: { messages: [], tools },
				signal: cancellationSignal(),
				onUpdate: (partial) => {
					flusher.replace([toAcp.toolUpdate(call.id, call.name, partial)]);
					heartbeat();
				},
			});
			await flusher.flush();

			const result: ToolResultMessage = {
				role: "toolResult",
				toolCallId: call.id,
				toolName: call.name,
				content: outcome.result.content,
				details: jsonSafe(outcome.result.details),
				isError: outcome.isError,
				timestamp: now(),
				...(outcome.durationMs !== undefined
					? { durationMs: outcome.durationMs }
					: {}),
			} as ToolResultMessage;
			await store.append({
				stepKey: `${base}/end`,
				turnId: input.turnId,
				acp: [
					toAcp.toolEnd({
						toolCallId: call.id,
						toolName: call.name,
						result: outcome.result,
						isError: outcome.isError,
						...(fileChange ? { fileChange } : {}),
					}),
				],
				transcript: [result],
			});
			return { isError: outcome.isError };
		},

		async settleTurn(
			input: TurnRef & {
				outcome: SettleTurnInput["status"];
				errorMessage?: string;
				steersConsumed: number;
			},
		): Promise<{ steerPending: boolean }> {
			const { store } = await handles(input);
			const rows = (await store.transcript()).filter((row) =>
				row.stepKey.startsWith(`${input.turnId}/`),
			);
			const summary = summarizeTurn(rows);
			const settled = await deps.settler.settle({
				turnId: input.turnId,
				status: input.outcome,
				steersConsumed: input.steersConsumed,
				...summary,
				...(input.outcome === "failed"
					? { errorCode: input.errorMessage ?? "failed" }
					: {}),
			});
			if (settled.steerPending) return { steerPending: true };

			const toAcp = new PiToAcp("/");
			const open: AcpUpdate[] = summary.unfinishedCalls.map((call) =>
				toAcp.toolEnd({
					toolCallId: call.id,
					toolName: call.name,
					result: {
						content: [{ type: "text", text: "Stopped before it finished." }],
					},
					isError: true,
				}),
			);
			const stopReason =
				input.outcome === "completed"
					? "end_turn"
					: input.outcome === "interrupted"
						? "cancelled"
						: "error";
			const started = rows.find(
				(row) => row.stepKey === `${input.turnId}/start`,
			)?.entry as { timestamp?: number } | undefined;
			await store.append({
				stepKey: `${input.turnId}/end`,
				turnId: input.turnId,
				acp: [...open, toAcp.idle(stopReason, input.errorMessage)],
				turnEnd: {
					id: input.turnId,
					status: input.outcome,
					startedAtMs: started?.timestamp ?? now(),
					completedAtMs: now(),
					...(input.errorMessage
						? { error: { message: input.errorMessage } }
						: {}),
				},
			});
			return { steerPending: false };
		},
	};
}

export type AgentActivities = ReturnType<typeof createActivities>;

function defaultStore(
	credentials: TurnCredentials,
	sessionId: string,
): SessionStore {
	return httpSessionStore({
		baseUrl: credentials.sessionStore.baseUrl,
		sessionId,
		writeTicket: credentials.sessionStore.writeTicket,
	});
}

async function readAgentsMd(
	host: HostJobs,
	cwd: string,
): Promise<string | null> {
	for (const name of ["AGENTS.md", "CLAUDE.md"]) {
		const path = `${cwd.replace(/\/$/, "")}/${name}`;
		const info = await host.stat({ path });
		if (info.exists && info.isFile && info.size < 256 * 1024) {
			return Buffer.from(
				(await host.readFile({ path })).base64,
				"base64",
			).toString("utf8");
		}
	}
	return null;
}

function userMessage(text: string, timestamp: number): Message {
	return { role: "user", content: text, timestamp };
}

function messagesOf(rows: TranscriptRow[]): Message[] {
	return rows
		.map((row) => row.entry as Message)
		.filter(
			(entry) =>
				entry.role === "user" ||
				entry.role === "assistant" ||
				entry.role === "toolResult",
		);
}

function declaration(tool: RemoteTool) {
	return {
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters,
	};
}

function toolCallsOf(
	message: AssistantMessage,
): Array<{ id: string; name: string }> {
	return message.content
		.filter((block): block is ToolCall => block.type === "toolCall")
		.map((block) => ({ id: block.id, name: block.name }));
}

function summarizeTurn(rows: TranscriptRow[]) {
	const assistants = rows
		.map((row) => row.entry as Message)
		.filter((entry): entry is AssistantMessage => entry.role === "assistant");
	const results = new Map(
		rows
			.map((row) => row.entry as Message)
			.filter(
				(entry): entry is ToolResultMessage => entry.role === "toolResult",
			)
			.map((entry) => [entry.toolCallId, entry]),
	);
	const calls = assistants.flatMap((message) =>
		message.content.filter(
			(block): block is ToolCall => block.type === "toolCall",
		),
	);
	const last = assistants.at(-1);
	const reply = last?.content
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("")
		.trim();
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
			(sum, message) => sum + (message.usage?.input ?? 0),
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

function callSummary(call: ToolCall): string {
	const args = call.arguments as Record<string, unknown>;
	const value =
		args.command ?? args.path ?? args.pattern ?? args.description ?? "";
	return String(value).slice(0, 200);
}

function jsonSafe(value: unknown): unknown {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function heartbeat(): void {
	try {
		ActivityContext.current().heartbeat();
	} catch {}
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
	replace(updates: AcpUpdate[]): void;
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
	const maybe = () => {
		if (now() - lastFlush >= everyMs) void flushNow();
	};
	return {
		add(updates) {
			buffer.push(...updates);
			maybe();
		},
		replace(updates) {
			buffer = updates;
			maybe();
		},
		async flush() {
			await flushNow();
			if (failure) throw failure;
		},
	};
}
