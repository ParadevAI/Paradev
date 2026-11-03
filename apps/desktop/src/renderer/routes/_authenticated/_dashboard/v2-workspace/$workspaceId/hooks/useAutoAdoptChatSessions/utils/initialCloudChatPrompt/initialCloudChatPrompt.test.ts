import { expect, test } from "bun:test";
import type { ChatTransport } from "@superset/chat/client";
import { emptySnapshot, outlineSnapshot } from "@superset/chat/core";
import type {
	DurableEnvelope,
	Item,
	UserMessage,
} from "@superset/chat/protocol";
import { hashCloudAgentPrompt } from "@superset/shared/cloud-agent-launch";
import { initialCloudChatPromptHash } from "./initialCloudChatPrompt";

function message(clientId: string, text: string): UserMessage {
	return {
		id: clientId,
		kind: "user_message",
		clientId,
		startedAtMs: 1,
		content: [{ type: "text", text }],
	};
}

function transport(
	items: Item[],
): Pick<ChatTransport, "getOutline" | "getItems"> {
	return {
		getOutline: async () => ({
			ok: true,
			outline: {
				...outlineSnapshot(emptySnapshot()),
				items: items.map((item) => ({ item, turnId: "turn" })),
			},
		}),
		getItems: async () => {
			throw new Error("outline should be sufficient");
		},
	};
}

test("matches the original server prompt even after newer messages arrive", async () => {
	const initial = "the exact initial prompt\n";
	const client = transport([
		message("superset-sessions", initial),
		message("later-client", "another message"),
	]);
	expect(await initialCloudChatPromptHash(client, "chat")).toBe(
		await hashCloudAgentPrompt(initial),
	);
});

test("never claims a collaborator's chat even when the prompt text is identical", async () => {
	expect(
		await initialCloudChatPromptHash(
			transport([message("desktop-client", "same prompt")]),
			"chat",
		),
	).toBeNull();
});

test("waits for the first user message instead of treating an empty session as unrelated", async () => {
	expect(
		await initialCloudChatPromptHash(transport([]), "chat"),
	).toBeUndefined();
});

test("an older host can find the initial prompt beyond the newest history page", async () => {
	const envelope = (item: UserMessage, seq: number): DurableEnvelope => ({
		v: 1,
		sessionId: "chat",
		ts: seq,
		cursor: { epoch: "epoch", seq },
		event: { type: "item", item, turnId: "turn" },
	});
	let reads = 0;
	const client: Pick<ChatTransport, "getOutline" | "getItems"> = {
		getOutline: async () => {
			throw new Error("No procedure found for getOutline");
		},
		getItems: async ({ before }) => {
			reads++;
			return before
				? {
						ok: true,
						envelopes: [envelope(message("superset-sessions", "initial"), 1)],
						nextBefore: null,
					}
				: {
						ok: true,
						envelopes: [envelope(message("later", "newest"), 10)],
						nextBefore: { epoch: "epoch", seq: 10 },
					};
		},
	};
	expect(await initialCloudChatPromptHash(client, "chat")).toBe(
		await hashCloudAgentPrompt("initial"),
	);
	expect(reads).toBe(2);
});

test("does not hide a network error behind the legacy history fallback", async () => {
	const client = transport([]);
	client.getOutline = async () => {
		throw new Error("fetch failed");
	};
	await expect(initialCloudChatPromptHash(client, "chat")).rejects.toThrow(
		"fetch failed",
	);
});
