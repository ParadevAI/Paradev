import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveTimeline, emptySnapshot, reduceMany } from "@superset/chat/core";
import type { ToolCall } from "@superset/chat/protocol";
import { eq } from "drizzle-orm";
import { chatJournal } from "../../db";
import type { AdapterEvent, HarnessAdapter } from "../../harness";
import { FakeHarness, type ScriptedEvent } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import { createChatRuntime } from "../../index";
import type { HarnessRegistry } from "../../sessions";
import { agentMessage, turn } from "../../testing/fixtures";
import { createBunChatDb, createTestRuntime } from "../../testing/testRuntime";
import {
	FAKE_HARNESS,
	fakeHarnessRegistry,
	journalEnvelopes,
	waitFor,
} from "../../testing/testUtils";

const HARNESS = "recovery-fake";

function explodingRegistry(): HarnessRegistry {
	return new Map([
		[
			HARNESS,
			(): HarnessAdapter => ({
				start: (): AsyncIterable<AdapterEvent> => {
					throw new Error("spawn failed");
				},
				prompt: () => undefined,
				cancelTurn: () => undefined,
				respondToApproval: () => undefined,
				setMode: () => Promise.resolve(true),
				dispose: async () => undefined,
			}),
		],
	]);
}

describe("createSession failure recovery", () => {
	test("an unknown harness never persists a session row", async () => {
		const { harnesses } = fakeHarnessRegistry({ turns: [] });
		const runtime = createTestRuntime({ harnesses });

		expect(() =>
			runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: "nope",
				cwd: "/tmp/workspace",
			}),
		).toThrow(/unknown harness/);
		expect(runtime.sessions.list()).toEqual([]);

		await runtime.dispose();
	});

	test("a harness that fails to start leaves no ghost session or journal rows", async () => {
		const runtime = createTestRuntime({ harnesses: explodingRegistry() });

		expect(() =>
			runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: HARNESS,
				cwd: "/tmp/workspace",
			}),
		).toThrow("spawn failed");

		expect(runtime.sessions.list()).toEqual([]);
		expect(runtime.db.select().from(chatJournal).all()).toEqual([]);

		await runtime.dispose();
	});

	test("a retry after a failed create does not accumulate rows", async () => {
		const runtime = createTestRuntime({ harnesses: explodingRegistry() });
		const input = {
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: HARNESS,
			cwd: "/tmp/workspace",
		};

		expect(() => runtime.commands.createSession(input)).toThrow();
		expect(() => runtime.commands.createSession(input)).toThrow();
		expect(runtime.sessions.list()).toEqual([]);

		await runtime.dispose();
	});

	test("the same commandId on two different commands is not deduped", async () => {
		const { harnesses } = fakeHarnessRegistry({ turns: [[]] });
		const runtime = createTestRuntime({ harnesses });
		const commandId = randomUUID();

		const created = runtime.commands.createSession({
			commandId,
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});

		const prompted = runtime.commands.prompt({
			commandId,
			sessionId: created.sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});

		expect(prompted).toHaveProperty("itemId");
		expect(prompted).not.toHaveProperty("epoch");

		await runtime.dispose();
	});
});

describe("epoch recovery", () => {
	test("a lost journal resets the projection alongside the epoch", async () => {
		const { harnesses } = fakeHarnessRegistry({ turns: [] });
		const runtime = createTestRuntime({ harnesses });
		const { sessionId } = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});

		runtime.journal.append(sessionId, {
			type: "session",
			session: { status: "running", harness: FAKE_HARNESS, title: "My thread" },
		});
		expect(runtime.sessions.get(sessionId)).toMatchObject({
			status: "running",
			title: "My thread",
		});

		const lost = runtime.journal.cursor(sessionId).epoch;
		runtime.db
			.delete(chatJournal)
			.where(eq(chatJournal.sessionId, sessionId))
			.run();

		const reopened = runtime.journal.open({
			sessionId,
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
		});

		expect(reopened.epoch).not.toBe(lost);
		expect(runtime.sessions.get(sessionId)).toMatchObject({
			status: "starting",
			title: null,
			queuedCount: 0,
		});

		await runtime.dispose();
	});
});

describe("replacing a chat whose agent died", () => {
	test("the failure that ended it shows after the history the agent replays, and before the turns that follow", async () => {
		const crashed = turn("t1", {
			status: "failed",
			error: { message: "acp agent exited (code 1)", kind: "crashed" },
			completedAtMs: 2,
		});
		const replayStart = Date.now() + 60_000;
		const replayed: ScriptedEvent = {
			kind: "item",
			item: {
				...agentMessage("replayed", "earlier reply"),
				startedAtMs: replayStart,
			},
			turnId: "history",
		};
		const continued = turn("turn-b", { startedAtMs: replayStart });
		const after = turn("turn-a", { startedAtMs: replayStart });
		let agents = 0;
		const harnesses: HarnessRegistry = new Map([
			[
				FAKE_HARNESS,
				() => {
					const replacing = agents++ > 0;
					return new FakeHarness({
						start: [
							...(replacing ? [replayed] : []),
							{ kind: "session", delayMs: 2, session: { status: "idle" } },
						],
						turns: replacing
							? [continued, after].map((next) => [
									{ kind: "turn" as const, turn: next },
									{
										kind: "turn" as const,
										turn: { ...next, status: "completed" as const },
									},
								])
							: [
									[
										{ kind: "turn", turn: turn("t1") },
										{ kind: "turn", turn: crashed },
									],
								],
					});
				},
			],
		]);
		const runtime = createTestRuntime({ harnesses });
		const create = (resume?: {
			harnessSessionId: string;
			replacesSessionId: string;
		}) =>
			runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: FAKE_HARNESS,
				cwd: "/tmp/workspace",
				...(resume ? { resume } : {}),
			});
		const dead = create();
		await waitFor(
			() => runtime.live.get(dead.sessionId)?.state.status === "idle",
		);
		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: dead.sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "build it" }],
		});
		await waitFor(
			() => runtime.live.get(dead.sessionId)?.turn?.status === "failed",
		);

		const replacement = create({
			harnessSessionId: "agent-1",
			replacesSessionId: dead.sessionId,
		});
		await waitFor(() =>
			journalEnvelopes(runtime, replacement.sessionId).some(
				(envelope) =>
					envelope.event.type === "turn" && envelope.event.turn.id === "t1",
			),
		);

		const timeline = () =>
			deriveTimeline(
				reduceMany(
					emptySnapshot(),
					journalEnvelopes(runtime, replacement.sessionId),
				),
			);
		expect(timeline().map((group) => group.turnId)).toEqual(["history", "t1"]);
		expect(timeline().at(-1)?.turn).toMatchObject({
			status: "failed",
			error: { message: "acp agent exited (code 1)", kind: "crashed" },
		});

		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: replacement.sessionId,
			clientId: "client-2",
			content: [{ type: "text", text: "Continue where you left off." }],
		});
		await waitFor(
			() =>
				runtime.live.get(replacement.sessionId)?.turn?.status === "completed",
		);
		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: replacement.sessionId,
			clientId: "client-3",
			content: [{ type: "text", text: "and the tests" }],
		});
		await waitFor(
			() => runtime.live.get(replacement.sessionId)?.turn?.id === "turn-a",
		);
		await waitFor(
			() =>
				runtime.live.get(replacement.sessionId)?.turn?.status === "completed",
		);
		expect(timeline().map((group) => group.turnId)).toEqual([
			"history",
			"t1",
			"turn-b",
			"turn-a",
		]);

		await runtime.dispose();
	});

	test("a turn Paradev's shutdown cut off stays in the chat that replaces it", async () => {
		const runtime = createTestRuntime({ harnesses: hangingRegistry() });
		const cutOff = await startTurn(runtime);

		await runtime.live.disposeAll();
		const replacement = createChat(runtime, cutOff.sessionId);

		await waitFor(() =>
			journalEnvelopes(runtime, replacement.sessionId).some(
				(envelope) => envelope.event.type === "turn",
			),
		);
		expect(lastTurnOf(runtime, replacement.sessionId)).toMatchObject({
			id: "t1",
			status: "interrupted",
			error: { kind: "host_stopped" },
		});
		const replayed = journalEnvelopes(runtime, replacement.sessionId).flatMap(
			(envelope) =>
				envelope.event.type === "item" && envelope.event.item.id === "toolu-1"
					? [envelope.event.item]
					: [],
		);
		expect(replayed.at(-1)).toMatchObject({ status: "canceled" });
		expect(markerOf(runtime, replacement.sessionId)).toMatchObject({
			discarded: true,
		});
		expect(runtime.live.get(replacement.sessionId)?.promptsSent).toBe(0);

		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: replacement.sessionId,
			clientId: "client-2",
			content: [{ type: "text", text: "and the docs" }],
		});
		await waitFor(
			() =>
				runtime.live.get(replacement.sessionId)?.turn?.status === "completed",
		);
		expect(runtime.live.get(replacement.sessionId)?.promptsSent).toBe(1);
		await runtime.live.dispose(replacement.sessionId);
		const reopened = createChat(runtime, replacement.sessionId);
		await waitFor(
			() => runtime.live.get(reopened.sessionId)?.state.status === "idle",
		);
		expect(markerOf(runtime, reopened.sessionId)).toMatchObject({
			discarded: true,
		});
		expect(commandOf(runtime, reopened.sessionId)).toMatchObject({
			status: "canceled",
		});
		await runtime.dispose();
	});

	test("a turn cut off by closing the chat is not carried into the replacement", async () => {
		const runtime = createTestRuntime({ harnesses: hangingRegistry() });
		const stopped = await startTurn(runtime);

		await runtime.live.dispose(stopped.sessionId);
		const replacement = createChat(runtime, stopped.sessionId);
		await waitFor(
			() => runtime.live.get(replacement.sessionId)?.state.status === "idle",
		);

		expect(lastTurnOf(runtime, replacement.sessionId)).toBeUndefined();
		await runtime.dispose();
	});
});

describe("a queue a quit cut off", () => {
	const FOLLOW_UP = [{ type: "text" as const, text: "and the docs" }];

	async function quitWithQueue() {
		const dataDir = mkdtempSync(join(tmpdir(), "chat-runtime-"));
		const replays: FakeHarness[] = [];
		const harnesses = hangingRegistry(replays);
		const quit = createChatRuntime({
			dataDir,
			openDatabase: createBunChatDb,
			harnesses,
		});
		const cutOff = await startTurn(quit);
		quit.commands.prompt({
			commandId: randomUUID(),
			sessionId: cutOff.sessionId,
			clientId: "client-2",
			content: FOLLOW_UP,
		});
		expect(quit.live.get(cutOff.sessionId)?.queuedCount).toBe(1);
		const relaunched = createChatRuntime({
			dataDir,
			openDatabase: createBunChatDb,
			harnesses,
		});
		const replacement = createChat(relaunched, cutOff.sessionId);
		await waitFor(
			() => relaunched.live.get(replacement.sessionId)?.state.status === "idle",
		);
		const live = relaunched.live.require(replacement.sessionId);
		const followUps = () =>
			journalEnvelopes(relaunched, replacement.sessionId).filter(
				(envelope) =>
					envelope.event.type === "item" &&
					envelope.event.item.kind === "user_message" &&
					JSON.stringify(envelope.event.item.content) ===
						JSON.stringify(FOLLOW_UP),
			);
		const close = async () => {
			await relaunched.dispose();
			await quit.dispose();
		};
		return { live, replays, followUps, close };
	}

	test("waits, paused, in the chat that replaces it", async () => {
		const { live, close } = await quitWithQueue();

		expect(live.queueState).toMatchObject({
			paused: true,
			prompts: [{ content: FOLLOW_UP }],
		});
		expect(live.state.queuePausedByShutdown).toBe(true);
		expect(live.promptsSent).toBe(0);
		await close();
	});

	test("runs once after the continue when the chat is resumed", async () => {
		const { live, replays, followUps, close } = await quitWithQueue();

		live.promptOnceStarted(
			[[{ type: "text", text: "Continue" }], FOLLOW_UP],
			[],
		);

		expect(live.queueState.paused).toBe(false);
		expect(live.queueState.prompts.map((prompt) => prompt.content)).toEqual([
			FOLLOW_UP,
		]);
		expect(replays.at(-1)?.prompted).toEqual([
			[{ type: "text", text: "Continue" }],
		]);
		expect(
			new Set(
				followUps().map((e) => e.event.type === "item" && e.event.item.id),
			).size,
		).toBe(1);
		await close();
	});
});

const COMMAND: ToolCall = {
	id: "toolu-1",
	kind: "tool_call",
	title: "Run tests",
	toolKind: "execute",
	toolName: "Bash",
	status: "running",
	content: [],
	startedAtMs: 2,
};

/** Stop notes count only in a harness that writes them. */
const CLAUDE_HARNESS = "claude-acp";

function hangingRegistry(replays: FakeHarness[] = []): HarnessRegistry {
	let agents = 0;
	return new Map([
		[
			CLAUDE_HARNESS,
			(): HarnessAdapter => {
				const generation = agents++;
				if (generation > 0) {
					const replay = new FakeHarness({
						start: [
							{
								kind: "item",
								turnId: "history",
								item: { ...COMMAND, status: "failed" },
							},
							{
								kind: "item",
								turnId: "history",
								item: {
									id: `user_message:replay-${generation}:marker-1`,
									kind: "user_message",
									startedAtMs: 3,
									content: [
										{
											type: "text",
											text: "[Request interrupted by user for tool use]",
										},
									],
								},
							},
							{ kind: "session", session: { status: "idle" } },
						],
						turns: [
							[
								{ kind: "turn", turn: turn(`later-${generation}`) },
								{
									kind: "turn",
									turn: turn(`later-${generation}`, { status: "completed" }),
								},
							],
						],
					});
					replays.push(replay);
					return replay;
				}
				let release = () => {};
				const done = new Promise<void>((resolve) => {
					release = resolve;
				});
				let prompted = () => {};
				const promptArrived = new Promise<void>((resolve) => {
					prompted = resolve;
				});
				return {
					start: () => ({
						async *[Symbol.asyncIterator]() {
							yield { kind: "session", session: { status: "idle" } };
							await promptArrived;
							yield { kind: "turn", turn: turn("t1") };
							yield { kind: "item", turnId: "t1", item: COMMAND };
							await done;
						},
					}),
					prompt: () => prompted(),
					cancelTurn: () => undefined,
					respondToApproval: () => undefined,
					setMode: async () => true,
					dispose: async () => release(),
				};
			},
		],
	]);
}

async function startTurn(runtime: ChatRuntime) {
	const chat = createChat(runtime);
	await waitFor(
		() => runtime.live.get(chat.sessionId)?.state.status === "idle",
	);
	runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId: chat.sessionId,
		clientId: "client-1",
		content: [{ type: "text", text: "build it" }],
	});
	await waitFor(
		() => runtime.live.get(chat.sessionId)?.turn?.status === "running",
	);
	return chat;
}

function createChat(runtime: ChatRuntime, replacesSessionId?: string) {
	return runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: CLAUDE_HARNESS,
		cwd: "/tmp/workspace",
		...(replacesSessionId
			? { resume: { harnessSessionId: "agent-1", replacesSessionId } }
			: {}),
	});
}

function lastTurnOf(
	runtime: ReturnType<typeof createTestRuntime>,
	sessionId: string,
) {
	return journalEnvelopes(runtime, sessionId)
		.flatMap((envelope) =>
			envelope.event.type === "turn" ? [envelope.event.turn] : [],
		)
		.at(-1);
}

function markerOf(
	runtime: ReturnType<typeof createTestRuntime>,
	sessionId: string,
) {
	return journalEnvelopes(runtime, sessionId)
		.flatMap((envelope) =>
			envelope.event.type === "item" &&
			envelope.event.item.id.endsWith(":marker-1")
				? [envelope.event.item]
				: [],
		)
		.at(-1);
}

function commandOf(
	runtime: ReturnType<typeof createTestRuntime>,
	sessionId: string,
) {
	return journalEnvelopes(runtime, sessionId)
		.flatMap((envelope) =>
			envelope.event.type === "item" && envelope.event.item.id === "toolu-1"
				? [envelope.event.item]
				: [],
		)
		.at(-1);
}

describe("replacing a chat keeps its mode", () => {
	function modeRecordingRuntime() {
		const startModes: (string | undefined)[] = [];
		class RecordingHarness extends FakeHarness {
			override start(options: Parameters<FakeHarness["start"]>[0]) {
				startModes.push(options.modeId);
				return super.start(options);
			}
		}
		const harness = () =>
			new RecordingHarness({
				start: [
					{
						kind: "session",
						session: { status: "idle", modeId: "bypassPermissions" },
					},
				],
				turns: [],
			});
		const runtime = createTestRuntime({
			harnesses: new Map([
				[FAKE_HARNESS, harness],
				[HARNESS, harness],
			]),
		});
		const create = (
			harnessId: string,
			extra: { modeId?: string; replacesSessionId?: string } = {},
		) =>
			runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: harnessId,
				cwd: "/tmp/workspace",
				...(extra.modeId ? { modeId: extra.modeId } : {}),
				...(extra.replacesSessionId
					? {
							resume: {
								harnessSessionId: "agent-1",
								replacesSessionId: extra.replacesSessionId,
							},
						}
					: {}),
			});
		return { runtime, startModes, create };
	}

	test("a replacement that asks for no mode resumes in the mode the chat it replaces was in", async () => {
		const { runtime, startModes, create } = modeRecordingRuntime();
		const source = create(FAKE_HARNESS);
		await waitFor(
			() => runtime.live.get(source.sessionId)?.state.status === "idle",
		);
		await runtime.commands.closeSession({ sessionId: source.sessionId });

		create(FAKE_HARNESS, { replacesSessionId: source.sessionId });
		create(FAKE_HARNESS, {
			replacesSessionId: source.sessionId,
			modeId: "default",
		});
		create(HARNESS, { replacesSessionId: source.sessionId });

		expect(startModes).toEqual([
			undefined,
			"bypassPermissions",
			"default",
			undefined,
		]);
		await runtime.dispose();
	});
});
