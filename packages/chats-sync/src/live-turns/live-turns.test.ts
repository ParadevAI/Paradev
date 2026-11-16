import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { RealtimeEvent } from "../api-types/api-types.ts";
import {
	chatTurns,
	EMPTY_LIVE,
	type LiveAction,
	type LiveTurns,
	liveTurnsReducer,
	nestedTurn,
	workingGroupIds,
	workingOnTask,
} from "./live-turns.ts";

const PIP = "6f1c2a4e-1b2c-4d5e-8f90-123456789abc";
/** The chat's Devs, which resolve an ask by name. */
const DEVS = [
	{ id: "jun", name: "Juniper" },
	{ id: PIP, name: "Pip" },
	{ id: "wren", name: "Wren" },
];
const event = (e: RealtimeEvent, at = 100): LiveAction => ({
	type: "event",
	event: e,
	at,
});
const status = (
	devId: string,
	s: "waking" | "running" | "idle" | "stopped",
	groupId = "g1",
) => event({ type: "dev.status", devId, groupId, status: s });
const started = (devId: string, turnId: string, parentTurnId?: string) =>
	event({
		type: "turn.started",
		devId,
		groupId: "g1",
		turnId,
		...(parentTurnId ? { parentTurnId } : {}),
	});
const ended = (devId: string, turnId: string) =>
	event({ type: "turn.ended", devId, groupId: "g1", turnId });
const update = (turnId: string, u: SessionUpdate): LiveAction => ({
	type: "update",
	turnId,
	update: u,
});
const promptOf = (turnId: string) =>
	update(turnId, {
		sessionUpdate: "user_message_chunk",
		content: { type: "text", text: "…" },
		_meta: { "dev/turnId": turnId },
	});
const say = (turnId: string, text: string) =>
	update(turnId, {
		sessionUpdate: "agent_message_chunk",
		content: { type: "text", text },
	});
const ask = (
	turnId: string,
	id: string,
	devId: string,
	status: "in_progress" | "completed" = "in_progress",
) =>
	update(turnId, {
		sessionUpdate: status === "in_progress" ? "tool_call" : "tool_call_update",
		toolCallId: id,
		title: `bash dev ask ${devId}`,
		kind: "execute",
		status,
		rawInput: { command: `dev ask ${devId} "free?"` },
	} as SessionUpdate);

const play = (actions: LiveAction[], from: LiveTurns = EMPTY_LIVE) =>
	actions.reduce(liveTurnsReducer, from);

describe("live turns", () => {
	test("waking → running → streaming → ended: the turn moves to finished with its stream", () => {
		const waking = play([status("jun", "waking")]);
		expect(waking.active).toMatchObject([
			{ devId: "jun", groupId: "g1", phase: "waking", turnId: null },
		]);
		expect(workingGroupIds(waking)).toEqual(new Set(["g1"]));

		const running = play(
			[
				status("jun", "running"),
				started("jun", "t1"),
				promptOf("t1"),
				say("t1", "Hello"),
			],
			waking,
		);
		expect(running.active).toMatchObject([
			{
				phase: "running",
				turnId: "t1",
				stream: { inTurn: true, blocks: [{ kind: "text", text: "Hello" }] },
			},
		]);

		const done = play([ended("jun", "t1")], running);
		expect(done.active).toEqual([]);
		expect(workingGroupIds(done).size).toBe(0);
		expect(done.finished.at(-1)?.stream.blocks).toEqual([
			{ kind: "text", text: "Hello" },
		]);
	});

	test("a new Dev getting ready shows at once and goes with its first message, though the app never heard the turn start", () => {
		const ready = play([
			{ type: "first-turn", devId: "jun", groupId: "g1", at: 100 },
		]);
		expect(ready.active).toMatchObject([
			{ devId: "jun", groupId: "g1", phase: "waking", turnId: null },
		]);
		// A bootstrap that still finds the Dev at rest (its box not waking yet) leaves it.
		expect(
			liveTurnsReducer(ready, {
				type: "bootstrapped",
				devs: [{ id: "jun", status: "stopped" }],
				requestedAt: 5_000,
			}).active,
		).toHaveLength(1);
		const hello = event({
			type: "message.created",
			message: {
				id: "m1",
				groupId: "g1",
				authorId: null,
				authorDevId: "jun",
				text: "Hi, I'm Juniper",
				taskId: null,
				turnId: "t1",
				clientId: null,
				at: "2026-10-14T10:00:00Z",
			},
			task: null,
			endsTurn: true,
		});
		expect(play([hello], ready).active).toEqual([]);
	});

	test("a Dev's final message ends its turn's live view at once; an interim one doesn't", () => {
		const posted = (turnId: string, endsTurn?: boolean) =>
			event({
				type: "message.created",
				message: {
					id: `m-${turnId}`,
					groupId: "g1",
					authorId: null,
					authorDevId: "jun",
					text: "Hello",
					taskId: null,
					turnId,
					clientId: null,
					at: "2026-10-14T10:00:00Z",
				},
				task: null,
				...(endsTurn ? { endsTurn } : {}),
			});
		const running = play([
			started("jun", "t1"),
			promptOf("t1"),
			say("t1", "Hello"),
		]);
		expect(play([posted("t1")], running).active).toHaveLength(1);
		expect(play([posted("t2", true)], running).active).toHaveLength(1);
		const done = play([posted("t1", true)], running);
		expect(done.active).toEqual([]);
		// `turn.ended` comes after it and finds nothing left to end.
		expect(play([ended("jun", "t1")], done)).toEqual(done);
	});

	test("updates for a turn nobody announced are ignored, and other groups are untouched", () => {
		const state = play([
			started("jun", "t1"),
			say("t-unknown", "x"),
			status("jun", "stopped", "g2"),
		]);
		expect(state.active).toHaveLength(1);
		expect(state.active[0]!.stream.blocks).toEqual([]);
	});

	test("idle or stopped ends a turn even when turn.ended was missed; a turn with nothing streamed isn't kept", () => {
		const state = play([status("jun", "waking"), status("jun", "stopped")]);
		expect(state).toEqual(EMPTY_LIVE);
		const idle = play([
			started("jun", "t1"),
			promptOf("t1"),
			say("t1", "hi"),
			status("jun", "idle"),
		]);
		expect(idle.active).toEqual([]);
		expect(idle.finished).toHaveLength(1);
	});

	test("a restarted turn (newer message) starts with an empty stream", () => {
		const state = play([
			started("jun", "t1"),
			promptOf("t1"),
			say("t1", "old"),
			started("jun", "t2"),
		]);
		expect(state.active).toMatchObject([
			{ turnId: "t2", stream: { inTurn: false, blocks: [] } },
		]);
	});

	test("a bootstrap ends turns of Devs it shows at rest, unless the turn began after it was requested", () => {
		const state = play([
			started("jun", "t1"),
			event(
				{ type: "turn.started", devId: "pip", groupId: "g1", turnId: "t2" },
				500,
			),
		]);
		const after = play(
			[
				{
					type: "bootstrapped",
					devs: [
						{ id: "jun", status: "idle" },
						{ id: "pip", status: "stopped" },
					],
					requestedAt: 300,
				},
			],
			state,
		);
		expect(after.active.map((t) => t.devId)).toEqual(["pip"]);
	});

	test("a `dev ask` turn shows inside the asking turn, not as its own item", () => {
		const asking = play([
			started("jun", "t1"),
			promptOf("t1"),
			ask("t1", "c1", PIP),
		]);
		// The asked Dev wakes before turn.started names its parent: already nested.
		const waking = play([status(PIP, "waking")], asking);
		expect(chatTurns(waking, "g1", DEVS).map((t) => t.devId)).toEqual(["jun"]);
		expect(nestedTurn(waking, waking.active[0]!, PIP)?.phase).toBe("waking");

		const nested = play(
			[started(PIP, "t2", "t1"), promptOf("t2"), say("t2", "Saturday")],
			waking,
		);
		expect(chatTurns(nested, "g1", DEVS).map((t) => t.devId)).toEqual(["jun"]);
		expect(nestedTurn(nested, nested.active[0]!, PIP)?.stream.blocks).toEqual([
			{ kind: "text", text: "Saturday" },
		]);

		// The nested turn ends first; the parent can still show what it did.
		const answered = play(
			[ended(PIP, "t2"), ask("t1", "c1", PIP, "completed")],
			nested,
		);
		expect(
			nestedTurn(answered, answered.active[0]!, PIP)?.stream.blocks,
		).toEqual([{ kind: "text", text: "Saturday" }]);
		expect(workingGroupIds(answered)).toEqual(new Set(["g1"]));
	});

	test("an ask by name nests the turn of the one Dev with that name", () => {
		const state = play([
			started("jun", "t1"),
			promptOf("t1"),
			ask("t1", "c1", '"pip"'),
			status(PIP, "waking"),
		]);
		expect(chatTurns(state, "g1", DEVS).map((t) => t.devId)).toEqual(["jun"]);
		// A name two Devs share asks nobody (the server refuses it), so nothing is hidden as nested.
		const shared = [...DEVS, { id: "pip2", name: "Pip" }];
		expect(chatTurns(state, "g1", shared).map((t) => t.devId)).toEqual([
			"jun",
			PIP,
		]);
	});

	test("a Dev that isn't being asked shows as its own item", () => {
		const state = play([
			started("jun", "t1"),
			promptOf("t1"),
			ask("t1", "c1", PIP),
			started("wren", "t3"),
		]);
		expect(chatTurns(state, "g1", DEVS).map((t) => t.devId)).toEqual([
			"jun",
			"wren",
		]);
	});

	test("a task's Dev works on it while it's in progress and the Dev has a turn in the task's chat", () => {
		const task = {
			chatId: "g1",
			assigneeDevId: "jun",
			status: "in_progress" as const,
		};
		const running = play([started("jun", "t1")]);
		expect(workingOnTask(running, task)).toBe(true);
		expect(workingOnTask(running, { ...task, status: "done" })).toBe(false);
		expect(workingOnTask(running, { ...task, assigneeDevId: "wren" })).toBe(
			false,
		);
		expect(workingOnTask(running, { ...task, chatId: "g2" })).toBe(false);
		expect(workingOnTask(play([ended("jun", "t1")], running), task)).toBe(
			false,
		);
	});
});

describe("trigger turns", () => {
	const quietStart = (devId: string, turnId: string) =>
		event({
			type: "turn.started",
			devId,
			groupId: "g1",
			turnId,
			triggerId: "tr1",
		});
	const quietEnd = (devId: string, turnId: string) =>
		event({
			type: "turn.ended",
			devId,
			groupId: "g1",
			turnId,
			triggerId: "tr1",
		});

	test("never show as working: the waking row goes, and the box running doesn't bring one back", () => {
		const state = play([
			status("jun", "waking"),
			quietStart("jun", "t1"),
			status("jun", "running"),
			say("t1", "Handled"),
		]);
		expect(state.active).toEqual([]);
		expect(chatTurns(state, "g1", DEVS)).toEqual([]);
		expect(workingGroupIds(state).size).toBe(0);
		expect(play([quietEnd("jun", "t1")], state).quiet).toEqual([]);
	});

	test("ending one leaves another Dev's turn in the chat working", () => {
		const state = play([
			started("wren", "t2"),
			quietStart("jun", "t1"),
			quietEnd("jun", "t1"),
		]);
		expect(state.active).toMatchObject([{ devId: "wren", turnId: "t2" }]);
	});

	test("a message turn after it shows as usual, even if its end was missed", () => {
		const state = play([
			quietStart("jun", "t1"),
			status("jun", "running"),
			started("jun", "t2"),
		]);
		expect(state.quiet).toEqual([]);
		expect(state.active).toMatchObject([
			{ devId: "jun", turnId: "t2", phase: "running" },
		]);
	});

	test("the box going idle forgets it", () => {
		const state = play([
			quietStart("jun", "t1"),
			status("jun", "idle"),
			status("jun", "waking"),
		]);
		expect(state.quiet).toEqual([]);
		expect(state.active).toMatchObject([{ devId: "jun", phase: "waking" }]);
	});
});
