import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { deriveTimeline, emptySnapshot, reduceMany } from "@superset/chat/core";
import { eq } from "drizzle-orm";
import { chatJournal } from "../../db";
import type { AdapterEvent, HarnessAdapter } from "../../harness";
import { FakeHarness, type ScriptedEvent } from "../../harness/fake";
import type { HarnessRegistry } from "../../sessions";
import { agentMessage, turn } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
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
				setMode: () => undefined,
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
});
