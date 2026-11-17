import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { Hub, HubSession, type TurnContext } from "../hub/hub.ts";
import { DEFAULT_ROLLOVER } from "../rollover/rollover.ts";
import { openPiSession } from "./pi-session.ts";

const CHAT = "33333333-3333-4333-8333-333333333333";
const identity = {
	kind: "personal" as const,
	name: "Juniper",
	ownerName: "alice",
};
const agentDir = mkdtempSync(join(tmpdir(), "runner-session-"));
const sessionDir = join(agentDir, "sessions");
afterAll(() => rmSync(agentDir, { recursive: true, force: true }));

/** A message turn as the server sends it: the header and the message, the chat's latest messages and who's here. */
const said: string[] = [];
function message(text: string): [string, TurnContext] {
	const recent = said.map((line) => ({ line: `- alice: ${line}`, seen: true }));
	said.push(text);
	return [
		`## New message\nChat: your 1:1 with alice\nFrom: alice\nTime: 2026-10-13 14:02 UTC\n\n${text}`,
		{ env: {}, chat: { recent, roster: "alice · person · u1" } },
	];
}

function watch(session: HubSession) {
	const updates: SessionUpdate[] = [];
	session.attach((u) => updates.push(u));
	const inputs = () =>
		updates.flatMap((u) =>
			u.sessionUpdate === "user_message_chunk" && u.content.type === "text"
				? [u.content.text]
				: [],
		);
	return { updates, inputs };
}

const jsonl = (dir: string) =>
	readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
/** The user messages a session file holds, as the agent read them. */
const userTexts = (file: string) =>
	readFileSync(file, "utf8")
		.trim()
		.split("\n")
		.map(
			(l) =>
				JSON.parse(l) as {
					type: string;
					message?: {
						role: string;
						content: { type: string; text?: string }[];
					};
				},
		)
		.flatMap((e) =>
			e.type === "message" && e.message?.role === "user"
				? [e.message.content.map((c) => c.text ?? "").join("")]
				: [],
		);

describe("a chat's session", () => {
	test("is opened once and reused for every turn on the box, resumed after a restart, and rolled over when full", async () => {
		let opens = 0;
		const hub = new Hub((sessionId) => {
			opens++;
			return openPiSession({
				agentDir,
				sessionId,
				apiUrl: "http://127.0.0.1:9",
				faux: true,
				identity,
			});
		});
		const first = await hub.get(CHAT);
		const a = watch(first);
		await first.prompt(...message("one"));
		await first.prompt(...message("two"));
		expect(await hub.get(CHAT)).toBe(first);
		expect(opens).toBe(1);

		// The prompt describes only what a Dev can do in Paradev today.
		const systemPrompt = (first as unknown as { opened: { pi: AgentSession } })
			.opened.pi.systemPrompt;
		expect(systemPrompt).toContain("Write like a text, not a report");
		expect(systemPrompt).toContain("never a wall of text");
		expect(systemPrompt).toContain("Your box reaches the internet");
		expect(systemPrompt).toContain("## Asking another Dev");
		expect(systemPrompt).toContain("Not available yet: tasks and reminders");
		for (const gone of ["dev task", "dev trigger", "dev sketch", "Composio"])
			expect(systemPrompt).not.toContain(gone);

		// The chat's first turn gets who's here; the second runs in the same session, which has that already.
		const [one = "", two = ""] = a.inputs();
		expect(one).toBe(
			"## New message\nChat: your 1:1 with alice\nFrom: alice\nTime: 2026-10-13 14:02 UTC\n\none\n\nIn this chat (names can repeat; use ids with `dev ask`, and `<@dev:id>` / `<@user:id>` to mention exactly):\nalice · person · u1",
		);
		expect(two).toBe(
			"## New message\nChat: your 1:1 with alice\nFrom: alice\nTime: 2026-10-13 14:02 UTC\n\ntwo",
		);
		const [file] = jsonl(sessionDir);
		expect(jsonl(sessionDir)).toHaveLength(1);
		expect(userTexts(join(sessionDir, file!))).toEqual([one, two]);

		// A restart (the box stopped and woke): the session resumes from its JSONL, under a low rollover size.
		const tokens = (
			first as unknown as { opened: { pi: AgentSession } }
		).opened.pi.getContextUsage()!.tokens!;
		const resumed = new HubSession(
			await openPiSession({
				agentDir,
				sessionId: CHAT,
				apiUrl: "http://127.0.0.1:9",
				faux: true,
				identity,
				rollover: { ...DEFAULT_ROLLOVER, tokens: tokens + 1 },
			}),
		);
		const b = watch(resumed);
		expect((await resumed.prompt(...message("three"))).stopReason).toBe(
			"end_turn",
		);
		const [three = ""] = b.inputs();
		expect(three).not.toContain("New session");
		// It doesn't know what roster that session was given before the restart, so it's given again.
		expect(three).toContain("alice · person · u1");

		// That turn passed the size: the old session wrote its handover note and was archived, a fresh one replaced it.
		expect(b.updates.at(-1)).toMatchObject({
			sessionUpdate: "compaction_update",
			status: "completed",
			_meta: {
				"dev/rollover": {
					reason: "context",
					archived: `archive/${file}`,
					handover: true,
				},
			},
		});
		expect(jsonl(sessionDir)).toEqual([]);
		expect(jsonl(join(sessionDir, "archive"))).toEqual([file!]);
		const archived = userTexts(join(sessionDir, "archive", file!));
		expect(archived.at(-1)).toStartWith("[Dev: handover]");
		const note = readFileSync(join(sessionDir, `${CHAT}.handover.md`), "utf8");
		expect(note).toBe(
			'Handover: 3 messages so far. Asked: "one", "two", "three".',
		);

		// The fresh session's first turn opens with what happened, then the note and the chat's recent messages.
		await resumed.prompt(...message("four"));
		const four = b.inputs().at(-1)!;
		expect(four).toContain(
			`\n\nfour\n\nNew session: your last one in this chat filled up and was closed. Its handover note:\n${note}\n`,
		);
		expect(four).toContain(
			"Recent messages here (oldest first):\n- alice: one\n- alice: two\n- alice: three",
		);
		expect(existsSync(join(sessionDir, `${CHAT}.handover.md`))).toBe(false);
		const [fresh] = jsonl(sessionDir);
		const header = JSON.parse(
			readFileSync(join(sessionDir, fresh!), "utf8").split("\n")[0]!,
		) as { id: string; parentSession?: string };
		expect(header).toMatchObject({
			id: CHAT,
			parentSession: join(sessionDir, "archive", file!),
		});
		expect(userTexts(join(sessionDir, fresh!))).toEqual([four]);
	}, 60_000);
});

describe("subagents in a chat's session", () => {
	const chat = "44444444-4444-4444-8444-444444444444";
	const ask = (text: string, turnId: string): [string, TurnContext] => [
		`## New message\nChat: your 1:1 with alice\nFrom: alice\n\n${text}`,
		{ env: {}, turnId },
	];
	const runStates = (updates: SessionUpdate[]) => {
		const latest = new Map<string, { agent: string; status: string }>();
		for (const u of updates) {
			const run = u._meta?.["dev/subagentRun"] as
				| { id: string; agent: string; status: string }
				| undefined;
			if (run) latest.set(run.id, run);
		}
		return [...latest.values()].map((r) => [r.agent, r.status]);
	};

	test("run inside the turn, nested in its trace, and leave only their result in the Dev's session", async () => {
		const session = new HubSession(
			await openPiSession({
				agentDir,
				sessionId: chat,
				apiUrl: "http://127.0.0.1:9",
				faux: true,
				identity,
			}),
		);
		const result = await session.prompt(
			...ask("Plan a Lisbon weekend with subagents", "turn-1"),
		);
		expect(result.stopReason).toBe("end_turn");
		const trace = session.takeTrace("turn-1")!;
		expect(runStates(trace.updates)).toEqual([
			["agent", "completed"],
			["agent", "completed"],
		]);
		const nested = trace.updates.filter((u) => u._meta?.["dev/subagent"]);
		expect(nested.map((u) => u.sessionUpdate)).toEqual([
			"agent_message_chunk",
			"agent_message_chunk",
		]);
		expect(nested[1]).toMatchObject({
			content: {
				text: "Done: Write this plan up for the chat: Done: Plan this: Plan a Lisbon weekend with subagents",
			},
		});

		const file = jsonl(sessionDir).find((f) => f.endsWith(`_${chat}.jsonl`))!;
		const stored = readFileSync(join(sessionDir, file), "utf8");
		expect(stored).toContain("Done: Write this plan up for the chat");
		// The subagents' own prompts and tasks stay out of it.
		expect(stored).not.toContain("You are an agent");
		expect(stored).not.toContain("Task: Plan this");
	}, 60_000);

	test("stop when the turn is cancelled", async () => {
		const session = new HubSession(
			await openPiSession({
				agentDir,
				sessionId: chat,
				apiUrl: "http://127.0.0.1:9",
				faux: true,
				identity,
			}),
		);
		const updates: SessionUpdate[] = [];
		session.attach((u) => updates.push(u));
		const turn = session.prompt(
			...ask("Plan a Porto weekend with subagents", "turn-2"),
		);
		while (!runStates(updates).some(([, status]) => status === "in_progress"))
			await new Promise((r) => setTimeout(r, 20));
		await session.cancel();
		expect((await turn).stopReason).toBe("cancelled");
		expect(runStates(updates)).toEqual([["agent", "cancelled"]]);
	}, 60_000);
});

describe("a trigger's session", () => {
	test("has report_events, which its chat's session doesn't", async () => {
		const tools = async (sessionId: string) => {
			const opened = await openPiSession({
				agentDir,
				sessionId,
				apiUrl: "http://127.0.0.1:9",
				faux: true,
				identity,
			});
			return (opened.pi as AgentSession).getActiveToolNames();
		};
		expect(
			await tools(`${CHAT}.trigger-7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d`),
		).toContain("report_events");
		expect(await tools("44444444-4444-4444-8444-444444444444")).not.toContain(
			"report_events",
		);
	}, 30_000);
});
