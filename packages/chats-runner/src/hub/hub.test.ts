import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type {
	AgentSession,
	AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { Rollover } from "../rollover/rollover.ts";
import {
	finalText,
	HubSession,
	type OpenedSession,
	postsReply,
	REPLY_CHECK,
	type TurnContext,
} from "./hub.ts";

type Message = AgentSession["messages"][number];
const message = (m: Record<string, unknown>) => m as unknown as Message;
const assistant = (text: string, stopReason = "stop") =>
	message({ role: "assistant", content: [{ type: "text", text }], stopReason });

/** A pi stand-in whose turns run until `finish()` or `abort()`, so tests control timing. */
function fakePi() {
	let emit: (e: AgentSessionEvent) => void = () => {};
	let release: (() => void) | null = null;
	let update: (u: SessionUpdate) => void = () => {};
	let cancelledTurns = 0;
	const prompts: string[] = [];
	const turns: TurnContext[] = [];
	const messages: AgentSession["messages"] = [];
	const text = (delta: string) =>
		emit({
			type: "message_update",
			message: {},
			assistantMessageEvent: { type: "text_delta", delta },
		} as unknown as AgentSessionEvent);
	const ends: { failed: boolean }[] = [];
	/** Steered messages pi holds until the run's next step. */
	const steered: string[] = [];
	let rollover: (() => Rollover | null) | null = null;
	const opened: OpenedSession = {
		subscribe: (fn) => {
			emit = fn;
		},
		subscribeUpdates: (fn) => {
			update = fn;
		},
		cancelTurn: () => void cancelledTurns++,
		pi: {
			prompt: async (input: string) => {
				prompts.push(input);
				messages.push(message({ role: "user", content: input }));
				await new Promise<void>((resolve) => (release = resolve));
			},
			abort: async () => release?.(),
			messages,
			steer: (async (input: string) =>
				void steered.push(input)) as unknown as AgentSession["steer"],
			clearQueue: () => ({ steering: steered.splice(0), followUp: [] }),
		},
		model: "test/model",
		startTurn: async (turn, text) => {
			turns.push(turn);
			return text;
		},
		endTurn: async (outcome) => {
			ends.push(outcome);
			return rollover?.() ?? null;
		},
	};
	return {
		opened,
		prompts,
		steered,
		turns,
		ends,
		messages,
		text,
		emit: (e: AgentSessionEvent) => emit(e),
		update: (u: SessionUpdate) => update(u),
		cancelledTurns: () => cancelledTurns,
		/** Ends the running prompt; the model answers "answer to <input>" unless the test already gave it a last message. */
		finish: () => {
			if (messages.at(-1)?.role !== "assistant")
				messages.push(assistant(`answer to ${prompts.at(-1)}`));
			release?.();
		},
		onEnd: (next: () => Rollover | null) => void (rollover = next),
	};
}

const turn = (label: string): TurnContext => ({ env: { TURN: label } });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("background notices", () => {
	test("into the running turn, read before its next step; one it ended without reading goes as a turn of its own", async () => {
		const pi = fakePi();
		const passedOn: string[] = [];
		const session = new HubSession(
			pi.opened,
			[],
			async (text) => void passedOn.push(text),
		);
		expect(
			await session.notify("<task-notification>idle</task-notification>"),
		).toBe(false);

		const done = session.prompt("hi", turn("t1"));
		await tick();
		expect(
			await session.notify("<task-notification>read</task-notification>"),
		).toBe(true);
		expect(
			await session.notify("<task-notification>unread</task-notification>"),
		).toBe(true);
		expect(pi.steered).toHaveLength(2);
		// pi delivered the first as a user message before the model's next step; the run ended before the second.
		pi.messages.push(
			message({
				role: "user",
				content: "<task-notification>read</task-notification>",
			}),
		);
		pi.finish();
		await done;
		expect(passedOn).toEqual(["<task-notification>unread</task-notification>"]);
		expect(pi.steered).toEqual([]);
	});

	test("what was said on a call is passed on as a steer, so the API frames it as the person's words, not a system notice", async () => {
		const pi = fakePi();
		const passedOn: string[] = [];
		const session = new HubSession(
			pi.opened,
			[],
			async (text, kind) => void passedOn.push(`${kind}: ${text}`),
		);
		const done = session.prompt("hi", turn("t1"));
		await tick();
		expect(
			await session.notify(
				"## Said on the call while you were working\nmake it four",
				"steer",
			),
		).toBe(true);
		pi.finish();
		await done;
		expect(passedOn).toEqual([
			"steer: ## Said on the call while you were working\nmake it four",
		]);
	});
});

describe("hub session", () => {
	test("a turn gets its context first, streams to every listener, and returns the final answer", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const a: unknown[] = [];
		const b: unknown[] = [];
		session.attach((u) => a.push(u));
		session.attach((u) => b.push(u));
		const done = session.prompt("hi", turn("t1"));
		await tick();
		pi.text("Hel");
		pi.text("lo");
		pi.finish();
		expect(await done).toEqual({
			stopReason: "end_turn",
			answer: "answer to hi",
		});
		expect(pi.turns).toEqual([turn("t1")]);
		expect(a).toEqual(b);
		expect(a).toHaveLength(3);
	});

	test("a late watcher gets the history replayed, with streamed text merged", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const done = session.prompt("hi", turn("t1"));
		await tick();
		pi.text("Hel");
		pi.text("lo");
		const { replay } = session.attach(() => {});
		expect(replay).toEqual([
			{
				sessionUpdate: "user_message_chunk",
				content: { type: "text", text: "hi" },
			},
			{
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "Hello" },
			},
		]);
		pi.finish();
		await done;
	});

	test("a replay keeps subagents' text apart from the turn's", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const done = session.prompt("hi", turn("t1"));
		await tick();
		const of = (run: string, text: string): SessionUpdate => ({
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text },
			_meta: { "dev/subagent": { parent: "s1", run } },
		});
		pi.text("Delegating.");
		pi.update(of("s1-1", "Plan"));
		pi.update(of("s1-2", "Draft"));
		pi.update(of("s1-2", " two"));
		const { replay } = session.attach(() => {});
		expect(replay.slice(1)).toEqual([
			{
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "Delegating." },
			},
			of("s1-1", "Plan"),
			of("s1-2", "Draft two"),
		]);
		pi.finish();
		await done;
	});

	test("a new prompt during a turn cancels it and runs instead; only the last of several waiting prompts runs", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const first = session.prompt("one", turn("t1"));
		await tick();
		const second = session.prompt("two", turn("t2"));
		const third = session.prompt("three", turn("t3"));
		expect(await first).toEqual({ stopReason: "cancelled", answer: "" });
		expect(await second).toEqual({ stopReason: "cancelled", answer: "" });
		await tick();
		pi.finish();
		expect(await third).toEqual({
			stopReason: "end_turn",
			answer: "answer to three",
		});
		expect(pi.prompts).toEqual(["one", "three"]);
	});

	test("cancel stops the turn; cancelling when idle does nothing", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		await session.cancel();
		const run = session.prompt("one", turn("t1"));
		await tick();
		await session.cancel();
		expect((await run).stopReason).toBe("cancelled");
	});

	test("the turn's first update carries the server's turn id, so watchers can find where it starts in a replay", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const done = session.prompt("hi", { env: {}, turnId: "turn-7" });
		await tick();
		expect(session.attach(() => {}).replay).toEqual([
			{
				sessionUpdate: "user_message_chunk",
				content: { type: "text", text: "hi" },
				_meta: { "dev/turnId": "turn-7" },
			},
		]);
		pi.finish();
		await done;
	});

	test("a finished turn's trace is kept once for its settle callback, without the prompt or secrets", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened, ["s3cret-value"]);
		const done = session.prompt("hi", { env: {}, turnId: "turn-8" });
		await tick();
		pi.text("token is s3cret-");
		pi.text("value");
		pi.finish();
		await done;
		expect(session.takeTrace("turn-8")).toEqual({
			model: "test/model",
			updates: [
				{
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "token is [redacted]" },
				},
			],
		});
		expect(session.takeTrace("turn-8")).toBeUndefined();
	});

	test("a question the session asks streams to watchers and lands in the trace; cancelling the turn stops it waiting", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const seen: SessionUpdate[] = [];
		session.attach((u) => seen.push(u));
		const done = session.prompt("plan dinner", { env: {}, turnId: "turn-q" });
		await tick();
		const asked: SessionUpdate = {
			sessionUpdate: "tool_call",
			toolCallId: "question-1",
			title: "Asked: Which cuisine?",
			kind: "other",
			status: "pending",
		};
		pi.update(asked);
		expect(seen.at(-1)).toEqual(asked);
		await session.cancel();
		expect(pi.cancelledTurns()).toBe(1);
		await done;
		expect(session.takeTrace("turn-q")?.updates[0]).toMatchObject({
			sessionUpdate: "tool_call",
			toolCallId: "question-1",
			title: "Asked: Which cuisine?",
		});
	});

	test("a turn whose model call failed rejects with the model's error instead of ending normally", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const done = session.prompt("hi", turn("t1"));
		await tick();
		pi.messages.push({
			role: "assistant",
			content: [],
			stopReason: "error",
			errorMessage: "overloaded",
		} as unknown as AgentSession["messages"][number]);
		pi.finish();
		await expect(done).rejects.toThrow("overloaded");
		expect(pi.ends).toEqual([{ failed: true }]);
	});

	const ROLLOVER: Rollover = {
		reason: "context",
		tokens: 130_000,
		contextWindow: 1_000_000,
		archived: "archive/old.jsonl",
		handover: true,
	};

	test("after the turn, before it settles, the session may roll over: the answer is the turn's, and watchers see the rollover", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const updates: SessionUpdate[] = [];
		session.attach((u) => updates.push(u));
		// The handover note is the session's last text by the time the rollover is done; the turn's answer came before it.
		pi.onEnd(() => {
			pi.prompts.push("handover");
			return ROLLOVER;
		});
		const done = session.prompt("hi", turn("t1"));
		await tick();
		pi.finish();
		expect(await done).toEqual({
			stopReason: "end_turn",
			answer: "answer to hi",
		});
		expect(updates.at(-1)).toEqual({
			sessionUpdate: "compaction_update",
			compactionId: "rollover-1",
			status: "completed",
			_meta: { "dev/rollover": ROLLOVER },
		});
	});

	test("a turn that overflowed the context runs again, once, in the session that replaced it", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const overflow = {
			role: "assistant",
			content: [],
			stopReason: "error",
			errorMessage: "prompt is too long",
		} as unknown as AgentSession["messages"][number];
		pi.onEnd(() =>
			pi.messages.at(-1) === overflow
				? { ...ROLLOVER, reason: "overflow", handover: false }
				: null,
		);
		const done = session.prompt("hi", turn("t1"));
		await tick();
		pi.messages.push(overflow);
		pi.finish();
		await tick();
		pi.messages.length = 0;
		pi.finish();
		expect(await done).toEqual({
			stopReason: "end_turn",
			answer: "answer to hi",
		});
		expect(pi.prompts).toEqual(["hi", "hi"]);
		expect(pi.turns).toEqual([turn("t1"), turn("t1")]);

		// Overflowing again in the fresh session fails the turn.
		const again = session.prompt("big", turn("t2"));
		for (const _ of [1, 2]) {
			await tick();
			pi.messages.push(overflow);
			pi.finish();
		}
		await expect(again).rejects.toThrow("prompt is too long");
	});

	test("a cancelled turn doesn't roll the session over", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const run = session.prompt("one", turn("t1"));
		await tick();
		await session.cancel();
		expect((await run).stopReason).toBe("cancelled");
		expect(pi.ends).toEqual([]);
	});

	test("a turn's trace keeps the compactions during it and the rollover after it", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		pi.onEnd(() => ROLLOVER);
		const done = session.prompt("hi", { env: {}, turnId: "turn-9" });
		await tick();
		pi.emit({ type: "compaction_start", reason: "threshold" });
		pi.emit({
			type: "compaction_end",
			reason: "threshold",
			result: { summary: "…" },
			aborted: false,
			willRetry: false,
		} as unknown as AgentSessionEvent);
		pi.finish();
		await done;
		expect(session.takeTrace("turn-9")?.updates).toEqual([
			{
				sessionUpdate: "compaction_update",
				compactionId: "compaction-1",
				status: "in_progress",
				_meta: { "dev/compaction": { reason: "threshold" } },
			},
			{
				sessionUpdate: "compaction_update",
				compactionId: "compaction-1",
				status: "completed",
				_meta: { "dev/compaction": { reason: "threshold" } },
			},
			{
				sessionUpdate: "compaction_update",
				compactionId: "rollover-2",
				status: "completed",
				_meta: { "dev/rollover": ROLLOVER },
			},
		]);
	});

	test("pi's compactions reach watchers as compaction updates, numbered", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const updates: SessionUpdate[] = [];
		session.attach((u) => updates.push(u));
		pi.emit({ type: "compaction_start", reason: "threshold" });
		pi.emit({
			type: "compaction_end",
			reason: "threshold",
			result: { summary: "…" },
			aborted: false,
			willRetry: false,
		} as unknown as AgentSessionEvent);
		expect(updates).toEqual([
			{
				sessionUpdate: "compaction_update",
				compactionId: "compaction-1",
				status: "in_progress",
				_meta: { "dev/compaction": { reason: "threshold" } },
			},
			{
				sessionUpdate: "compaction_update",
				compactionId: "compaction-1",
				status: "completed",
				_meta: { "dev/compaction": { reason: "threshold" } },
			},
		]);
	});
});

describe("a 1:1 turn that answers with `reply`", () => {
	const replyStart = (toolName: string, args: unknown) =>
		({
			type: "tool_execution_start",
			toolCallId: "c1",
			toolName,
			args,
		}) as unknown as AgentSessionEvent;
	const checkReply = (label: string): TurnContext => ({
		...turn(label),
		checkReply: true,
	});

	test("is asked once, when it ends with words but no `reply`, whether they were meant for the chat; the model decides", async () => {
		const pi = fakePi();
		const session = new HubSession(pi.opened);
		const done = session.prompt("hi", checkReply("t1"));
		await tick();
		pi.finish();
		await tick();
		expect(pi.prompts).toEqual(["hi", REPLY_CHECK]);
		pi.emit(replyStart("reply", { text: "Hello!" }));
		pi.messages.push(assistant(""));
		pi.finish();
		expect(await done).toEqual({ stopReason: "end_turn", answer: "" });
		expect(pi.prompts).toHaveLength(2);
	});

	test("isn't asked when it replied, ended with nothing, failed, or can't reply", async () => {
		const run = async (
			context: TurnContext,
			last: Message | null,
			reply?: { toolName: string; args: unknown },
		) => {
			const pi = fakePi();
			const session = new HubSession(pi.opened);
			const done = session.prompt("hi", context);
			await tick();
			if (reply) pi.emit(replyStart(reply.toolName, reply.args));
			if (last) pi.messages.push(last);
			pi.finish();
			await done.catch(() => {});
			return pi.prompts;
		};
		expect(
			await run(checkReply("t1"), assistant("Done."), {
				toolName: "reply",
				args: { text: "Booked." },
			}),
		).toEqual(["hi"]);
		expect(
			await run(checkReply("t1"), assistant("Done."), {
				toolName: "bash",
				args: { command: 'dev reply "Booked."' },
			}),
		).toEqual(["hi"]);
		expect(await run(checkReply("t1"), assistant(""))).toEqual(["hi"]);
		expect(await run(checkReply("t1"), assistant("", "error"))).toEqual(["hi"]);
		expect(await run(turn("task"), assistant("Compared three pairs."))).toEqual(
			["hi"],
		);
	});

	test("a reply is the tool or `dev reply` from bash, nothing else", () => {
		expect(postsReply("reply", { text: "hi" })).toBe(true);
		expect(
			postsReply("bash", { command: "cd /agent && dev reply - <<'EOF'" }),
		).toBe(true);
		expect(postsReply("bash", { command: "dev chat read" })).toBe(false);
		expect(postsReply("send_update", { text: "on it" })).toBe(false);
	});
});

describe("finalText", () => {
	const user = (text: string) => message({ role: "user", content: text });
	const toolResult = (text: string) =>
		message({ role: "toolResult", content: [{ type: "text", text }] });

	test("is the Dev's last message in the turn, without its thinking or tool calls, trimmed", () => {
		const last = message({
			role: "assistant",
			stopReason: "stop",
			content: [
				{ type: "thinking", thinking: "They want a plan." },
				{ type: "text", text: "\n Here's the plan:\n\n- **Fly** Friday \n" },
			],
		});
		expect(
			finalText([
				user("plan it"),
				assistant("Looking."),
				toolResult("Done: the plan"),
				last,
			]),
		).toBe("Here's the plan:\n\n- **Fly** Friday");
	});

	test("a subagent's result is tool output, not the Dev's words", () => {
		const delegated = message({
			role: "assistant",
			stopReason: "toolUse",
			content: [
				{ type: "toolCall", id: "c1", name: "subagent", arguments: {} },
			],
		});
		expect(
			finalText([
				user("draft it"),
				delegated,
				toolResult("The writer's draft"),
			]),
		).toBe("");
		expect(
			finalText([
				user("draft it"),
				delegated,
				toolResult("The writer's draft"),
				assistant("Draft's in the doc."),
			]),
		).toBe("Draft's in the doc.");
	});

	test("is empty when the turn only acted, was aborted or failed, and never an earlier turn's", () => {
		const acted = message({
			role: "assistant",
			stopReason: "stop",
			content: [],
		});
		expect(
			finalText([
				user("one"),
				assistant("an earlier answer"),
				user("two"),
				acted,
			]),
		).toBe("");
		expect(
			finalText([user("one"), assistant("an earlier answer"), user("two")]),
		).toBe("");
		expect(finalText([user("two"), assistant("half a sent", "aborted")])).toBe(
			"",
		);
		expect(finalText([user("two"), assistant("", "error")])).toBe("");
	});

	test("after a compaction mid-turn took the input, what's left is the turn's", () => {
		expect(
			finalText([
				message({ role: "compactionSummary", summary: "…" }),
				assistant("Done."),
			]),
		).toBe("Done.");
	});
});
