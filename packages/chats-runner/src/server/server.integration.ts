import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import type { Server } from "node:http";
import { type AddressInfo, createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import { createWebSocketStream } from "@agentclientprotocol/sdk/experimental/ws-client";
import { generateKeyPair, SignJWT } from "jose";
import { WebSocket } from "ws";
import { createTokenVerifier } from "../auth/auth.ts";
import { Hub } from "../hub/hub.ts";
import { openPiSession } from "../pi/pi-session.ts";
import type { Settlement } from "../turn-http/turn-http.ts";
import { startRunnerServer } from "./server.ts";

const { privateKey, publicKey } = await generateKeyPair("ES256");
const GROUP = "group-1";
let server: Server;
let url: string;
let dir: string;
let fakeBin: string;
/** Every settle callback the runner made: which turn, in which chat, and how it ended. */
const settled: { turnId: string; chatId: string; settlement: Settlement }[] =
	[];
/** What the turns posted with \`send_update\`. */
const updates: string[] = [];
const replies: string[] = [];
/** Whether the test says the box has background work, and how many turns the box reported taking. */
let busy = false;
let turnsTaken = 0;

const token = (scope: string, opts: { sid?: string; aud?: string } = {}) =>
	new SignJWT({ scope, sid: opts.sid ?? GROUP })
		.setProtectedHeader({ alg: "ES256" })
		.setAudience(opts.aud ?? "box-1")
		.setExpirationTime("2m")
		.sign(privateKey);

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), "runner-test-"));
	writeFileSync(join(dir, "AGENTS.md"), "Be brief.");
	// Stands in for the `dev` CLI: the dev model calls `dev chat read …`; this records the call and the turn's env.
	fakeBin = join(dir, "bin");
	mkdirSync(fakeBin);
	writeFileSync(
		join(fakeBin, "dev"),
		'#!/bin/sh\nif [ "$1" = app ]; then echo "Published Budget version 1.\nApp id: 11111111-1111-1111-1111-111111111111"; exit; fi\necho "posted: $* (group $DEV_GROUP_ID, token ${DEV_TOKEN:-none})"\n',
	);
	chmodSync(join(fakeBin, "dev"), 0o755);
	const hub = new Hub((sessionId) =>
		openPiSession({
			agentDir: dir,
			sessionId,
			apiUrl: "http://api.test",
			faux: true,
			updates: async (text) => void updates.push(text),
			replies: async (text) => void replies.push(text),
		}),
	);
	server = await startRunnerServer({
		port: 0,
		hub,
		verify: createTokenVerifier({ publicKey, boxId: "box-1" }),
		settle: async (turnId, chatId, settlement) =>
			void settled.push({ turnId, chatId, settlement }),
		busy: () => busy,
		onTurn: () => void turnsTaken++,
	});
	url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/acp`;
});

afterAll(() => {
	server.close();
	rmSync(dir, { recursive: true, force: true });
});

/** An ACP client over the websocket that records every update it receives. */
function connect(protocols: string[]) {
	const updates: acp.SessionUpdate[] = [];
	const stream = createWebSocketStream(url, {
		WebSocket: WebSocket as never,
		protocols,
	});
	const app = acp
		.client({ name: "test" })
		.onNotification(
			acp.methods.client.session.update,
			({ params }) => void updates.push(params.update),
		);
	const run = <T>(op: (ctx: acp.ClientContext) => Promise<T>) =>
		app.connectWith(stream, async (ctx) => {
			await ctx.request(acp.methods.agent.initialize, {
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {},
			});
			return op(ctx);
		});
	return { updates, run };
}

const load = (ctx: acp.ClientContext, sessionId = GROUP) =>
	ctx.request(acp.methods.agent.session.load, {
		sessionId,
		cwd: "/agent",
		mcpServers: [],
	});

const post = async (path: string, body: unknown, bearer?: string) => {
	const res = await fetch(
		url.replace("ws://", "http://").replace("/acp", path),
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
			},
			body: JSON.stringify(body),
		},
	);
	return res.status;
};
const turn = (turnId: string, text: string) => ({
	sessionId: GROUP,
	text,
	meta: { turnId, env: { PATH: `${fakeBin}:${process.env.PATH}` } },
});
const until = async (check: () => boolean) => {
	for (let i = 0; i < 1000 && !check(); i++) await Bun.sleep(10);
	expect(check()).toBe(true);
};
/** Starts a turn over HTTP and waits for its settle callback. */
async function runTurn(turnId: string, text: string) {
	expect(await post("/turns", turn(turnId, text), await token("control"))).toBe(
		202,
	);
	await until(() => settled.some((s) => s.turnId === turnId));
	return settled.find((s) => s.turnId === turnId)!;
}
/** What someone who opens the chat now is replayed. */
async function replay() {
	const late = connect(["acp", await token("watch")]);
	await late.run(async (ctx) => {
		await load(ctx);
		await Bun.sleep(50);
	});
	return late.updates;
}

/**
 * Whether a websocket upgrade is accepted (101). Read off a raw socket: Bun's `ws` client doesn't expose refusals, and
 * Bun's node:http can't write the 401 on an upgrade socket (Node does), so "no 101 within a moment" means refused.
 */
async function upgrades(protocols: string[]) {
	const { port } = new URL(url);
	return new Promise<boolean>((resolve) => {
		const socket = createConnection(Number(port), "127.0.0.1", () => {
			socket.write(
				[
					"GET /acp HTTP/1.1",
					`Host: 127.0.0.1:${port}`,
					"Connection: Upgrade",
					"Upgrade: websocket",
					"Sec-WebSocket-Version: 13",
					"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
					`Sec-WebSocket-Protocol: ${protocols.join(", ")}`,
					"",
					"",
				].join("\r\n"),
			);
		});
		const done = (accepted: boolean) => {
			clearTimeout(timer);
			socket.destroy();
			resolve(accepted);
		};
		const timer = setTimeout(() => done(false), 500);
		socket.once("data", (data) =>
			done(String(data).startsWith("HTTP/1.1 101")),
		);
		socket.once("close", () => done(false));
		socket.once("error", () => done(false));
	});
}

describe("dev-runner: watching over ACP", () => {
	test("refuses the upgrade without a token, with a bad one, or with one for another box", async () => {
		expect(await upgrades(["acp"])).toBe(false);
		expect(await upgrades(["acp", "garbage"])).toBe(false);
		expect(
			await upgrades(["acp", await token("control", { aud: "box-2" })]),
		).toBe(false);
		expect(await upgrades([await token("control")])).toBe(false);
		expect(await upgrades(["acp", await token("control")])).toBe(true);
	});

	test("a token only opens the session it names", async () => {
		const c = connect(["acp", await token("watch", { sid: "group-2" })]);
		await expect(c.run((ctx) => load(ctx))).rejects.toThrow(/another session/);
	});

	test("a turn runs pi; watchers see the stream, including the tool call and its output", async () => {
		const w = connect(["acp", await token("watch")]);
		let release!: () => void;
		const watching = w.run(async (ctx) => {
			await load(ctx);
			await new Promise<void>((r) => (release = r));
		});
		while (!release) await Bun.sleep(5);

		const { settlement } = await runTurn("turn-1", "hi there");
		// Not a message's turn (no `## New message` header), so the dev model's last words stay its final text.
		expect(settlement).toMatchObject({
			stopReason: "end_turn",
			answer: "hello from Dev",
		});
		// The settle callback carries what the turn did, without the prompt, for the message's details.
		expect(settlement.trace?.model).toBeTruthy();
		expect(settlement.trace?.updates.map((u) => u.sessionUpdate)).toEqual([
			"agent_thought_chunk",
			"agent_message_chunk",
			"tool_call",
			"tool_call_update",
			"agent_thought_chunk",
			"agent_message_chunk",
		]);
		await Bun.sleep(50);
		release();
		await watching;
		const kinds = w.updates.map((u) => u.sessionUpdate);
		expect(w.updates[0]).toMatchObject({
			sessionUpdate: "user_message_chunk",
			_meta: { "dev/turnId": "turn-1" },
		});
		expect(kinds).toContain("agent_thought_chunk");
		const calls = w.updates.filter((u) => u.sessionUpdate === "tool_call");
		expect(calls.map((u) => u.title)).toEqual(["bash dev chat read --limit 5"]);
		expect(calls[0]).toMatchObject({ kind: "execute", status: "in_progress" });
		const done = w.updates.filter(
			(u) => u.sessionUpdate === "tool_call_update",
		);
		expect(done[0]).toMatchObject({
			status: "completed",
			content: [
				{
					content: {
						text: `posted: chat read --limit 5 (group ${GROUP}, token none)\n`,
					},
				},
			],
		});
		const text = w.updates
			.filter((u) => u.sessionUpdate === "agent_message_chunk")
			.map((u) => (u.content as { text: string }).text);
		expect(text.join("")).toEndWith("hello from Dev");

		// Someone who opens the chat afterwards gets the turn replayed.
		expect((await replay()).map((u) => u.sessionUpdate)).toEqual([
			"user_message_chunk",
			"agent_thought_chunk",
			"agent_message_chunk",
			"tool_call",
			"tool_call_update",
			"agent_thought_chunk",
			"agent_message_chunk",
		]);
	}, 20_000);

	test("in a message's turn the dev model replies with the `reply` tool and ends with no final text", async () => {
		const { settlement } = await runTurn(
			"turn-reply",
			"## New message\nChat: your 1:1 with alice\nFrom: alice\n\nhi",
		);
		expect(replies.at(-1)).toBe("hello from Dev");
		expect(settlement).toMatchObject({ stopReason: "end_turn", answer: "" });
		expect(
			(await replay())
				.filter((u) => u.sessionUpdate === "tool_call")
				.map((u) => u.title),
		).toContain("reply");
	}, 20_000);

	test("a new Dev's first turn: the dev model asks what to help with, as its reply", async () => {
		const { settlement } = await runTurn(
			"turn-new",
			"## New Dev\nChat: your 1:1 with alice\n\nYou were just created by alice.",
		);
		expect(replies.at(-1)).toBe(
			"Hi, I'm Dev. What would you like me to help you with?",
		);
		expect(settlement).toMatchObject({ stopReason: "end_turn", answer: "" });
	}, 20_000);

	test("a new group's first turn: the dev model says hello to the group, as its reply", async () => {
		const { settlement } = await runTurn(
			"turn-new-group",
			'## New group\nChat: the group "Goa trip"\nMade by: alice\n\nalice just made this group.',
		);
		expect(replies.at(-1)).toBe(
			"Hi everyone, I'm Dev, this group's Dev. Mention me (@Dev) whenever you need a hand.",
		);
		expect(settlement).toMatchObject({ stopReason: "end_turn", answer: "" });
	}, 20_000);

	test("the dev model greets someone by @name when asked to", async () => {
		const { settlement } = await runTurn("turn-greet", "please greet @alice");
		expect(settlement).toMatchObject({ answer: "hello @alice, from Dev" });
	}, 20_000);

	test("the dev model says it's on it, builds and publishes a budget app, and ends with it live", async () => {
		const { settlement } = await runTurn(
			"turn-budget",
			"@Goa trip make us a budget app that splits costs",
		);
		const calls = (await replay())
			.filter((u) => u.sessionUpdate === "tool_call")
			.map((u) => u.title);
		expect(updates).toEqual(["On it: I'll build a small budget app here."]);
		expect(calls.slice(-3)).toEqual([
			"send_update",
			"read apps/budget/Budget.jsx",
			'bash dev app publish apps/budget/Budget.jsx --title Budget --label "first version"',
		]);
		expect(settlement).toMatchObject({
			answer:
				"Budget is live: open the Budget tab, add what you paid, and it splits the total evenly.",
		});
		const source = readFileSync(
			join(dir, "apps", "budget", "Budget.jsx"),
			"utf8",
		);
		expect(source).toContain("export default function Budget()");
		expect(source).toContain("dev.storage.subscribe(PREFIX");
		// The dev model streams at a watchable pace, so this whole turn takes several seconds.
	}, 20_000);
});

describe("turns over HTTP (how the Dev API runs them)", () => {
	test("only a control token for this box and session may start or cancel a turn", async () => {
		const before = settled.length;
		expect(await post("/turns", turn("t0", "hi"))).toBe(401);
		expect(await post("/turns", turn("t0", "hi"), "garbage")).toBe(401);
		expect(
			await post(
				"/turns",
				turn("t0", "hi"),
				await token("control", { aud: "box-2" }),
			),
		).toBe(401);
		expect(await post("/turns", turn("t0", "hi"), await token("watch"))).toBe(
			403,
		);
		expect(
			await post(
				"/turns",
				turn("t0", "hi"),
				await token("control", { sid: "group-2" }),
			),
		).toBe(403);
		expect(
			await post("/turns/cancel", { sessionId: GROUP }, await token("watch")),
		).toBe(403);
		expect(
			await post(
				"/turns",
				{ sessionId: GROUP, text: "hi", meta: { token: "x" } },
				await token("control"),
			),
		).toBe(400);
		expect(settled).toHaveLength(before);
	});

	test("GET /status says whether background work keeps the box busy, to a control token for this box", async () => {
		const status = async (bearer?: string) => {
			const res = await fetch(
				url.replace("ws://", "http://").replace("/acp", "/status"),
				{ headers: bearer ? { authorization: `Bearer ${bearer}` } : {} },
			);
			return {
				code: res.status,
				body: res.status === 200 ? await res.json() : null,
			};
		};
		expect(await status(await token("control", { sid: "status" }))).toEqual({
			code: 200,
			body: { busy: false },
		});
		busy = true;
		expect((await status(await token("control"))).body).toEqual({ busy: true });
		busy = false;
		expect((await status()).code).toBe(401);
		expect((await status(await token("watch"))).code).toBe(403);
		expect((await status(await token("control", { aud: "box-2" }))).code).toBe(
			401,
		);
	});

	test("a turn is accepted at once and reported to the API when it settles, with its own token", async () => {
		const taken = turnsTaken;
		const watcher = connect(["acp", await token("watch")]);
		let release!: () => void;
		const watching = watcher.run(async (ctx) => {
			await load(ctx);
			await new Promise<void>((r) => (release = r));
		});
		while (!release) await Bun.sleep(5);

		expect(
			await post("/turns", turn("t1", "hi there"), await token("control")),
		).toBe(202);
		// The box tells its notices the API has registered it.
		expect(turnsTaken).toBe(taken + 1);
		expect(settled.find((s) => s.turnId === "t1")).toBeUndefined();
		await until(() => settled.some((s) => s.turnId === "t1"));
		expect(settled.find((s) => s.turnId === "t1")).toMatchObject({
			turnId: "t1",
			chatId: GROUP,
			settlement: { stopReason: "end_turn", answer: "hello from Dev" },
		});
		// Watchers see the turn as before.
		release();
		await watching;
		expect(
			watcher.updates.findLast((u) => u.sessionUpdate === "user_message_chunk"),
		).toMatchObject({ _meta: { "dev/turnId": "t1" } });
	}, 20_000);

	test("cancel stops the running turn, which settles as cancelled; a model failure settles with its error", async () => {
		expect(
			await post("/turns", turn("t2", "hi again"), await token("control")),
		).toBe(202);
		await Bun.sleep(100);
		expect(
			await post("/turns/cancel", { sessionId: GROUP }, await token("control")),
		).toBe(204);
		await until(() => settled.some((s) => s.turnId === "t2"));
		expect(settled.find((s) => s.turnId === "t2")!.settlement).toMatchObject({
			stopReason: "cancelled",
			answer: "",
		});

		expect(
			await post(
				"/turns",
				turn("t3", "please [faux:error]"),
				await token("control"),
			),
		).toBe(202);
		await until(() => settled.some((s) => s.turnId === "t3"));
		expect(settled.find((s) => s.turnId === "t3")!.settlement).toMatchObject({
			error: expect.stringMatching(/scripted dev failure/),
		});
	}, 20_000);

	test("steer tells the running turn more (what was said on a call); with no turn running it says so", async () => {
		const steer = async (text: string) => {
			const res = await fetch(
				url.replace("ws://", "http://").replace("/acp", "/turns/steer"),
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${await token("control")}`,
					},
					body: JSON.stringify({ sessionId: GROUP, text }),
				},
			);
			return {
				code: res.status,
				body: res.status === 200 ? await res.json() : null,
			};
		};
		expect(await steer("nobody's listening")).toEqual({
			code: 200,
			body: { steered: false },
		});
		expect(
			await post("/turns", turn("t4", "hi once more"), await token("control")),
		).toBe(202);
		await Bun.sleep(100);
		expect(
			await steer(
				"## Said on the call while you worked\nactually make it four",
			),
		).toEqual({ code: 200, body: { steered: true } });
		await until(() => settled.some((s) => s.turnId === "t4"));
		expect((await steer("")).code).toBe(400);
		expect(
			await post(
				"/turns/steer",
				{ sessionId: GROUP, text: "hi" },
				await token("watch"),
			),
		).toBe(403);
	}, 20_000);

	test("the turn's chat context reaches the input: messages the session hasn't seen, and who's here when it changed", async () => {
		const control = await token("control");
		const chat = {
			recent: [
				{ line: "- alice: seen before", seen: true },
				{ line: "- bob: new since", seen: false },
			],
			roster: "alice · person · u1\nbob · person · u2",
		};
		const body = {
			...turn("t5", "## New message\nChat: the group\nFrom: bob\n\nhello"),
			meta: { ...turn("t5", "").meta, chat },
		};
		expect(await post("/turns", body, control)).toBe(202);
		await until(() => settled.some((s) => s.turnId === "t5"));
		const input = (await replay()).findLast(
			(u) => u.sessionUpdate === "user_message_chunk",
		);
		expect(input).toMatchObject({
			content: {
				text: `## New message\nChat: the group\nFrom: bob\n\nhello\n\nSince your last turn here, not in your history above (oldest first):\n- bob: new since (latest)\n\nA short message like "this", "that" or "it" is about the newest message here, the one marked (latest), unless it names something else.\n\nIn this chat (names can repeat; use ids with \`dev ask\`, and \`<@dev:id>\` / \`<@user:id>\` to mention exactly):\n${chat.roster}`,
			},
		});
	}, 20_000);

	test("a trigger's turn runs in the trigger's own session but names its chat", async () => {
		const sessionId = `${GROUP}.trigger-trg_1`;
		const control = await token("control", { sid: sessionId });
		const body = {
			sessionId,
			text: "hi there",
			meta: {
				turnId: "t6",
				chatId: GROUP,
				triggerId: "trg_1",
				env: { PATH: `${fakeBin}:${process.env.PATH}` },
			},
		};
		expect(
			await post(
				"/turns",
				{ ...body, meta: { ...body.meta, chatId: "group-2" } },
				control,
			),
		).toBe(400);
		expect(await post("/turns", body, control)).toBe(202);
		await until(() => settled.some((s) => s.turnId === "t6"));
		expect(settled.find((s) => s.turnId === "t6")).toMatchObject({
			chatId: GROUP,
			settlement: { answer: "hello from Dev" },
		});
		// Its commands act in the chat; its history isn't the chat's session's.
		const watched = connect(["acp", await token("watch", { sid: sessionId })]);
		await watched.run(async (ctx) => {
			await load(ctx, sessionId);
			await Bun.sleep(50);
		});
		const output = watched.updates.find(
			(u) => u.sessionUpdate === "tool_call_update",
		);
		expect(output).toMatchObject({
			content: [
				{
					content: {
						text: `posted: chat read --limit 5 (group ${GROUP}, token none)\n`,
					},
				},
			],
		});
		expect(
			watched.updates.filter((u) => u.sessionUpdate === "user_message_chunk"),
		).toHaveLength(1);
	}, 20_000);

	test("a turn sent again (a retried workflow step) runs once and settles once", async () => {
		const control = await token("control");
		expect(await post("/turns", turn("t4", "hi once"), control)).toBe(202);
		expect(await post("/turns", turn("t4", "hi once"), control)).toBe(202);
		await until(() => settled.some((s) => s.turnId === "t4"));
		await Bun.sleep(200);
		expect(settled.filter((s) => s.turnId === "t4")).toMatchObject([
			{
				turnId: "t4",
				chatId: GROUP,
				settlement: { stopReason: "end_turn", answer: "hello from Dev" },
			},
		]);
	}, 20_000);
});
