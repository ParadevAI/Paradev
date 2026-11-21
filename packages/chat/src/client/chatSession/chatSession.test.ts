import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ChatRuntime, FakeHarnessScript } from "@superset/chat-runtime";
import {
	createChatCallerFactory,
	createChatRouter,
} from "@superset/chat-runtime";
import {
	agentMessage,
	createTestRuntime,
	FAKE_HARNESS,
	fakeHarnessRegistry,
	turn,
	waitFor,
} from "@superset/chat-runtime/testing";
import { emptySnapshot, type SessionSnapshot } from "../../core";
import type { AgentMessage, UserMessage } from "../../protocol/items";
import { createMemoryStreamServer } from "../../testing/memoryStream";
import { createSessionClient, type SessionClient } from "../sessionClient";
import type { ChatTransport } from "../sessionClient/sessionClient";
import { ChatSession, type FrameScheduler } from "./chatSession";

function turnScript(
	turnId: string,
	itemId: string,
): FakeHarnessScript["turns"][number] {
	return [
		{ kind: "turn", turn: turn(turnId) },
		{ kind: "item", item: agentMessage(itemId, "done"), turnId },
		{
			kind: "turn",
			turn: turn(turnId, { status: "completed", completedAtMs: 2 }),
		},
		{ kind: "session", session: { status: "idle" } },
	];
}

const nextMicrotask: FrameScheduler = (flush) => {
	let cancelled = false;
	queueMicrotask(() => {
		if (!cancelled) flush();
	});
	return () => {
		cancelled = true;
	};
};

async function startStack(): Promise<{
	runtime: ChatRuntime;
	sessionId: string;
	makeClient(transport?: ChatTransport): SessionClient;
	transport: ChatTransport;
}> {
	const { harnesses } = fakeHarnessRegistry({
		turns: [turnScript("t1", "a1"), turnScript("t2", "a2")],
	});
	const runtime = createTestRuntime({ harnesses });
	const router = createChatRouter(runtime, {
		resolveCwd: () => "/tmp/workspace",
	});
	const transport: ChatTransport = createChatCallerFactory(router)({});
	const server = createMemoryStreamServer(runtime);
	const created = await transport.createSession({
		commandId: randomUUID(),
		workspaceId: "workspace-1",
		harness: FAKE_HARNESS,
	});
	return {
		runtime,
		transport,
		sessionId: created.sessionId,
		makeClient: (override) =>
			createSessionClient({
				sessionId: created.sessionId,
				transport: override ?? transport,
				streamBaseUrl: "ws://test/chat-v3",
				createSocket: server.createSocket,
			}),
	};
}

function withoutOutline(transport: ChatTransport): ChatTransport {
	return new Proxy(transport, {
		get: (target, prop, receiver) =>
			prop === "getOutline"
				? () => Promise.reject(new Error("No procedure found"))
				: Reflect.get(target, prop, receiver),
	});
}

function open(client: SessionClient, options = {}) {
	const chat = new ChatSession({
		client,
		deltas: [],
		scheduler: nextMicrotask,
		...options,
	});
	chat.start();
	return chat;
}

test("a sent prompt is a turn at once, then the host's turn with its reply", async () => {
	const stack = await startStack();
	const client = stack.makeClient();
	const chat = open(client);
	expect(chat.getState().status).toBe("loading");
	await waitFor(() => chat.getState().status === "ready");

	chat.send([{ type: "text", text: "hello" }]);
	expect(chat.getState().turns.map((each) => each.sending)).toEqual([
		"sending",
	]);

	await waitFor(
		() =>
			chat.getState().status === "ready" &&
			chat.getState().turns.at(-1)?.turn?.status === "completed",
	);
	const turns = chat.getState().turns;
	expect(turns).toHaveLength(1);
	expect(turns[0]?.sending).toBeNull();
	expect(turns[0]?.parts.map((part) => part.kind).sort()).toEqual([
		"agent_message",
		"user_message",
	]);

	chat.stop();
	client.close();
	await stack.runtime.dispose();
});

test("the state is the same object until something in it changes", async () => {
	const stack = await startStack();
	const client = stack.makeClient();
	const chat = open(client);
	await waitFor(() => chat.getState().status === "ready");

	let changes = 0;
	chat.subscribe(() => {
		changes += 1;
	});
	const before = chat.getState();
	chat.requestItemBodies([]);
	chat.setSendEnabled(true);
	expect(chat.getState()).toBe(before);
	expect(changes).toBe(0);

	chat.stop();
	client.close();
	await stack.runtime.dispose();
});

test("a stored copy shows before the host answers and stays in front of its turns", async () => {
	const stack = await startStack();
	const seedClient = stack.makeClient();
	await seedClient.prompt({
		clientId: "client-1",
		content: [{ type: "text", text: "hello" }],
	});
	await waitFor(
		() => stack.runtime.sessions.get(stack.sessionId)?.status === "idle",
	);

	const earlier: UserMessage = {
		id: "stored-user",
		kind: "user_message",
		content: [{ type: "text", text: "from before" }],
		startedAtMs: 0,
	};
	const reply: AgentMessage = {
		id: "stored-reply",
		kind: "agent_message",
		text: "stored",
		startedAtMs: 1,
	};
	const full = await seedClient.getItems({});
	if (!full.ok) throw new Error("expected page");
	const firstLiveId = full.envelopes.find(
		(envelope) => "event" in envelope && envelope.event.type === "item",
	);
	const stored: SessionSnapshot = {
		...emptySnapshot(),
		turns: new Map([
			["t0", { id: "t0", status: "completed", startedAtMs: -1 }],
		]),
		items: new Map([
			[earlier.id, { item: earlier, turnId: "t0" }],
			[reply.id, { item: reply, turnId: "t0" }],
			...(firstLiveId &&
			"event" in firstLiveId &&
			firstLiveId.event.type === "item"
				? ([
						[
							firstLiveId.event.item.id,
							{
								item: firstLiveId.event.item,
								turnId: firstLiveId.event.turnId,
							},
						],
					] as const)
				: []),
		]),
	};

	const client = stack.makeClient();
	const chat = open(client, { loadHistory: async () => stored });
	await waitFor(
		() =>
			chat.getState().status === "ready" && chat.getState().turns.length === 2,
	);
	expect(chat.getState().turns[0]?.id).toBe("t0");
	expect(chat.getState().turns[0]?.parts.map((part) => part.id)).toEqual([
		"stored-user",
		"stored-reply",
	]);

	chat.stop();
	client.close();
	seedClient.close();
	await stack.runtime.dispose();
});

test("older pages load until there are none left", async () => {
	const stack = await startStack();
	const seedClient = stack.makeClient();
	for (const clientId of ["client-1", "client-2"]) {
		await seedClient.prompt({
			clientId,
			content: [{ type: "text", text: "hello" }],
		});
		await waitFor(
			() => stack.runtime.sessions.get(stack.sessionId)?.status === "idle",
		);
	}

	const client = stack.makeClient(withoutOutline(stack.transport));
	const chat = open(client, { pageSize: 2 });
	await waitFor(() => chat.getState().status === "ready");
	expect(chat.getState().older).toBe("more");

	while (chat.getState().older === "more") await chat.loadOlder();
	expect(chat.getState().older).toBe("none");
	expect(chat.getState().turns).toHaveLength(2);

	chat.stop();
	client.close();
	seedClient.close();
	await stack.runtime.dispose();
});
