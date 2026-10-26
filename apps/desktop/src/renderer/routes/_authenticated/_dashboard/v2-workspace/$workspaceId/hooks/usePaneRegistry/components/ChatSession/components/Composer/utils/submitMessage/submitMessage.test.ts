import { expect, mock, test } from "bun:test";
import { parsePastedText } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import type { PromptInputSubmitPayload } from "@superset/chat-ui/PromptInput";
import { submitMessage } from "./submitMessage";

const draft: PromptInputSubmitPayload = {
	text: "Review the file",
	files: [],
	mentions: [],
	pastedTexts: [],
	steer: false,
};

test("failed attachment upload declines submission without sending", async () => {
	const onSend = mock();
	const result = await submitMessage(draft, {
		uploadAttachments: async () => null,
		onSend,
	});
	expect(result).toBe(false);
	expect(onSend).not.toHaveBeenCalled();
});

test("submission remains pending until the send callback accepts", async () => {
	let accept!: () => void;
	const pending = new Promise<void>((resolve) => {
		accept = resolve;
	});
	let settled = false;
	const result = submitMessage(draft, {
		uploadAttachments: async () => [],
		onSend: () => pending,
	}).then(() => {
		settled = true;
	});
	await Promise.resolve();
	await Promise.resolve();
	expect(settled).toBe(false);
	accept();
	await result;
	expect(settled).toBe(true);
});

test("a declined send propagates false so the composer retains its draft", async () => {
	expect(
		await submitMessage(draft, {
			uploadAttachments: async () => [],
			onSend: async () => false,
		}),
	).toBe(false);
});

test("rejected sends remain rejected so the composer does not clear its draft", async () => {
	const failure = new Error("Transport unavailable");
	await expect(
		submitMessage(draft, {
			uploadAttachments: async () => [],
			onSend: async () => {
				throw failure;
			},
		}),
	).rejects.toBe(failure);
});

test("accepted sends retain attachment tags, chip metadata and steering", async () => {
	const onSend = mock(() => ({ clientId: "accepted-outbox-entry" }));
	await submitMessage(
		{
			...draft,
			text: "Read example.ts",
			mentions: [
				{
					label: "Example",
					serialized: "example.ts",
					data: { elementKind: "file_mention" },
				},
			],
			steer: true,
		},
		{
			uploadAttachments: async () => ["[attachment: review.txt]"],
			onSend,
		},
	);
	expect(onSend).toHaveBeenCalledWith(
		[
			{
				type: "text",
				text: "Read example.ts\n[attachment: review.txt]",
				elements: [
					{
						byteRange: { start: 5, end: 15 },
						elementKind: "file_mention",
						label: "Example",
					},
				],
			},
		],
		{ steer: true },
	);
});

test("accepted sends keep pasted-card contents and hidden MCP context", async () => {
	const onSend = mock<
		(content: UserContent[], options: { steer: boolean }) => Promise<void>
	>(async () => undefined);
	const mcpContext =
		'MCP context: Use the configured MCP server "Fixture MCP" when relevant to this request.';
	await submitMessage(
		{
			...draft,
			text: "  Review the log  ",
			pastedTexts: ["first pasted log", "second pasted log"],
		},
		{
			uploadAttachments: async () => ["[attachment: review.txt]"],
			onSend,
			mcpContext,
		},
	);
	expect(onSend).toHaveBeenCalledTimes(1);
	const [content, options] = onSend.mock.calls[0] ?? [];
	expect(content).toHaveLength(2);
	const first = content?.[0];
	if (first?.type !== "text") throw new Error("Expected text content");
	expect(parsePastedText(first.text)).toEqual({
		text: "Review the log\n[attachment: review.txt]",
		pastes: ["first pasted log", "second pasted log"],
	});
	expect(content?.[1]).toEqual({
		type: "text",
		text: mcpContext,
		hidden: true,
	});
	expect(options).toEqual({ steer: false });
});

test("a pasted-card-only message sends its content without a fabricated visible prompt", async () => {
	const onSend = mock<
		(content: UserContent[], options: { steer: boolean }) => Promise<void>
	>(async () => undefined);
	await submitMessage(
		{ ...draft, text: "", pastedTexts: ["complete pasted message"] },
		{ uploadAttachments: async () => [], onSend, mcpContext: null },
	);
	const [content] = onSend.mock.calls[0] ?? [];
	expect(content).toHaveLength(1);
	const first = content?.[0];
	if (first?.type !== "text") throw new Error("Expected text content");
	expect(parsePastedText(first.text)).toEqual({
		text: "",
		pastes: ["complete pasted message"],
	});
});
