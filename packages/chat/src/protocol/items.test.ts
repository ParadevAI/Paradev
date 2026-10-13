import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	type AgentMessage,
	agentMessageSchema,
	isImageAttachment,
	itemSchema,
	type ToolCall,
	toolCallSchema,
	toolCallStatusSchema,
	toolContentSchema,
	toolKindSchema,
} from "./items";

/**
 * Frozen copy of the schemas in desktop-v1.37.0. Do not import the live
 * ones: the test must fail when a change breaks a released client.
 */
const releasedItemBaseFields = {
	id: z.string().min(1),
	parentItemId: z.string().min(1).optional(),
	startedAtMs: z.number(),
	completedAtMs: z.number().optional(),
};
const releasedToolContentSchema = z.discriminatedUnion("type", [
	z.looseObject({ type: z.literal("text"), text: z.string() }),
	z.looseObject({
		type: z.literal("diff"),
		path: z.string(),
		oldText: z.string().nullable(),
		newText: z.string(),
	}),
	z.looseObject({
		type: z.literal("terminal"),
		command: z.string(),
		output: z.string(),
		exitCode: z.number().int().optional(),
		truncated: z.boolean().optional(),
	}),
]);
const releasedAgentMessageSchema = z.looseObject({
	...releasedItemBaseFields,
	kind: z.literal("agent_message"),
	text: z.string(),
});
const releasedToolCallSchema = z.looseObject({
	...releasedItemBaseFields,
	kind: z.literal("tool_call"),
	title: z.string(),
	toolKind: toolKindSchema,
	toolName: z.string(),
	status: toolCallStatusSchema,
	content: z.array(releasedToolContentSchema),
	locations: z
		.array(
			z.looseObject({ path: z.string(), line: z.number().int().optional() }),
		)
		.optional(),
	rawInput: z.unknown().optional(),
	rawOutput: z.unknown().optional(),
	subagent: z.boolean().optional(),
});
const releasedKnownItemSchema = z.discriminatedUnion("kind", [
	releasedAgentMessageSchema,
	releasedToolCallSchema,
]);

const image = {
	type: "image" as const,
	path: ".superset/attachments/shot-0123456789ab.png",
	mimeType: "image/png",
	width: 800,
	height: 600,
};

const toolCall: ToolCall = {
	id: "tc-1",
	kind: "tool_call",
	title: "Read shot.png",
	toolKind: "read",
	toolName: "Read",
	status: "completed",
	content: [{ type: "text", text: "Read 1 image" }],
	attachments: [image],
	startedAtMs: 1,
	completedAtMs: 2,
};

const agentMessage: AgentMessage = {
	id: "am-1",
	kind: "agent_message",
	text: "Here is what I see.",
	attachments: [image],
	startedAtMs: 3,
	completedAtMs: 4,
};

describe("item attachments", () => {
	test("a released client still parses an item that carries attachments as its known kind", () => {
		const call = releasedKnownItemSchema.parse(toolCall);
		expect(call.kind).toBe("tool_call");
		expect(call.kind === "tool_call" ? call.content : []).toEqual(
			toolCall.content,
		);
		const message = releasedKnownItemSchema.parse(agentMessage);
		expect(message.kind).toBe("agent_message");
		expect(message.kind === "agent_message" ? message.text : "").toBe(
			agentMessage.text,
		);
	});

	test("the live schema keeps attachments on both item kinds", () => {
		expect(itemSchema.parse(toolCall)).toEqual(toolCall);
		expect(itemSchema.parse(agentMessage)).toEqual(agentMessage);
		expect(toolCallSchema.parse(toolCall).attachments).toEqual([image]);
		expect(agentMessageSchema.parse(agentMessage).attachments).toEqual([image]);
	});

	test("an attachment kind this schema does not know parses and is not an image", () => {
		const parsed = toolCallSchema.parse({
			...toolCall,
			attachments: [image, { type: "audio", path: "clip.m4a" }],
		});
		expect(parsed.attachments?.length).toBe(2);
		expect(parsed.attachments?.filter(isImageAttachment)).toEqual([image]);
	});

	test("an image entry without a path parses and is not an image", () => {
		const parsed = toolCallSchema.parse({
			...toolCall,
			attachments: [{ type: "image" }],
		});
		expect(parsed.attachments?.filter(isImageAttachment)).toEqual([]);
	});

	test("tool content stays the released union", () => {
		expect(
			toolContentSchema.safeParse({ type: "image", path: "x.png" }).success,
		).toBe(false);
	});
});
