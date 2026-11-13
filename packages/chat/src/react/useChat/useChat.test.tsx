import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
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
} from "@superset/chat-runtime/testing";
import type { ChatTransport } from "../../client";
import { createMemoryStreamServer } from "../../testing/memoryStream";
import { registerDom } from "../../testing/registerDom";
import { type ChatHost, ChatProvider } from "../ChatProvider";
import { type Chat, useChat } from "./useChat";

registerDom();
const { act, render, waitFor } = await import("@testing-library/react");

async function startHost(): Promise<{
	host: ChatHost;
	sessionId: string;
	dispose(): Promise<void>;
}> {
	const { harnesses } = fakeHarnessRegistry({
		turns: [
			[
				{ kind: "turn", turn: turn("t1") },
				{ kind: "item", item: agentMessage("a1", "done"), turnId: "t1" },
				{
					kind: "turn",
					turn: turn("t1", { status: "completed", completedAtMs: 2 }),
				},
				{ kind: "session", session: { status: "idle" } },
			],
		],
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
		host: {
			transport,
			streamBaseUrl: "ws://test/chat-v3",
			createSocket: server.createSocket,
		},
		sessionId: created.sessionId,
		dispose: () => runtime.dispose(),
	};
}

const seen: Record<string, Chat> = {};

function Probe({
	name,
	sessionId,
}: {
	name: string;
	sessionId: string | null;
}) {
	seen[name] = useChat(sessionId);
	return null;
}

test("a draft is a ready, empty chat with no actions", async () => {
	const stack = await startHost();
	const view = render(
		<ChatProvider host={stack.host}>
			<Probe name="draft" sessionId={null} />
		</ChatProvider>,
	);
	expect(seen.draft?.status).toBe("ready");
	expect(seen.draft?.turns).toEqual([]);
	expect(seen.draft?.actions).toBeNull();
	view.unmount();
	await stack.dispose();
});

test("two views of one session share a chat, and its actions never change", async () => {
	const stack = await startHost();
	const view = render(
		<ChatProvider host={stack.host}>
			<Probe name="one" sessionId={stack.sessionId} />
			<Probe name="two" sessionId={stack.sessionId} />
		</ChatProvider>,
	);
	await waitFor(() => expect(seen.one?.status).toBe("ready"));
	const actions = seen.one?.actions;
	expect(actions).not.toBeNull();
	expect(seen.two?.actions).toBe(actions);

	act(() => {
		actions?.send([{ type: "text", text: "hello" }]);
	});
	await waitFor(() =>
		expect(seen.two?.turns.at(-1)?.turn?.status).toBe("completed"),
	);
	expect(seen.one?.turns).toBe(seen.two?.turns);
	expect(seen.one?.actions).toBe(actions);

	view.unmount();
	await stack.dispose();
});
