import { afterEach, expect, test } from "bun:test";
import type { SessionClient, StreamStatus } from "@superset/chat/client";
import { type OutboxEntry, userMessageText } from "@superset/chat/core";
import { type ChatSession, useChatSession } from "@superset/chat/react";
import { type ComposerDraft, draftText } from "@superset/chat-ui/PromptInput";
import {
	act,
	cleanup,
	render,
	renderHook,
	waitFor,
} from "@testing-library/react";
import { useComposerDraft } from "../../../Composer/hooks/useComposerDraft";
import { useRestoreUnsentPrompts } from "./useRestoreUnsentPrompts";

const DRAFT_KEY = "chat-v3-draft:stopped-outbox";
const draftOf = (entry: OutboxEntry): ComposerDraft => ({
	segments: [
		{ type: "text", text: userMessageText({ content: entry.content }) },
	],
	attachments: [],
});
let current: ChatSession;

function Probe({
	client,
	sendEnabled,
}: {
	client: SessionClient;
	sendEnabled: boolean;
}) {
	current = useChatSession({ client, sendEnabled });
	useRestoreUnsentPrompts(DRAFT_KEY, current.outbox, draftOf);
	return null;
}

afterEach(cleanup);

test("stopped-session replacement preserves unsent text without flushing on transcript reconnect", async () => {
	let oldLive = true;
	let prompts = 0;
	const connections = new Map<string, (status: StreamStatus) => void>();
	const makeClient = (sessionId: string): SessionClient => ({
		sessionId,
		getSession: async () => ({
			live: sessionId === "old" ? oldLive : true,
			session: null,
			cursor: null,
		}),
		getOutline: async () => {
			throw new Error("use the items page");
		},
		getItems: async () => ({ ok: true, envelopes: [], nextBefore: null }),
		getItemBodies: async () => ({ ok: true, items: [] }),
		prompt: async () => {
			prompts++;
			if (sessionId === "old" && !oldLive) throw new Error("session stopped");
			return { itemId: "prompt", queued: false };
		},
		removeQueuedPrompt: async () => {},
		steerQueuedPrompt: async () => {},
		updateQueuedPrompt: async () => {},
		resumeQueue: async () => {},
		cancelTurn: async () => {},
		stopBackgroundTask: async () => false,
		steerSubagent: async () => "unsupported",
		backgroundSubagent: async () => "unsupported",
		respondToApproval: async () => {},
		setMode: async () => {},
		setConfigOption: async () => {},
		subscribe: (options) => {
			connections.set(sessionId, (status) => options.onStatusChange?.(status));
			queueMicrotask(() => options.onStatusChange?.("open"));
			return {
				cursor: () => null,
				close: () => connections.delete(sessionId),
			};
		},
		close: () => connections.delete(sessionId),
	});
	const client = makeClient("old");
	window.localStorage.setItem(DRAFT_KEY, "unfinished draft");
	const view = render(<Probe key="old" client={client} sendEnabled />);
	await waitFor(() => expect(current.connection).toBe("open"));
	act(() => {
		connections.get("old")?.("closed");
		current.sendPrompt([{ type: "text", text: "unsent message" }]);
	});
	view.rerender(<Probe key="old" client={client} sendEnabled={false} />);
	oldLive = false;
	act(() => connections.get("old")?.("open"));
	await waitFor(() => expect(current.connection).toBe("open"));
	expect(prompts).toBe(0);
	expect(current.outbox).toMatchObject([{ state: "queued", attempts: 0 }]);
	expect((await client.getSession()).live).toBe(false);
	view.rerender(
		<Probe key="replacement" client={makeClient("replacement")} sendEnabled />,
	);
	await waitFor(() => expect(current.connection).toBe("open"));
	const draft = renderHook(() => useComposerDraft(DRAFT_KEY));
	expect(draftText(draft.result.current.storedDraft?.segments ?? [])).toBe(
		"unsent message\n\nunfinished draft",
	);
	expect(prompts).toBe(0);
	view.unmount();
	expect(
		draftText(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "[]")),
	).toBe("unsent message\n\nunfinished draft");
});

test("replacement does not restore a prompt whose delivery is uncertain", () => {
	const entry: OutboxEntry = {
		commandId: "command",
		clientId: "client",
		content: [{ type: "text", text: "possibly delivered" }],
		state: "inflight",
		attempts: 1,
		lastError: null,
	};
	const key = "chat-v3-draft:uncertain-outbox";
	const hook = renderHook(
		({ outbox }) => useRestoreUnsentPrompts(key, outbox, draftOf),
		{ initialProps: { outbox: [entry] } },
	);
	hook.rerender({ outbox: [{ ...entry, state: "queued" }] });
	hook.unmount();
	expect(window.localStorage.getItem(key)).toBeNull();
});
