import { describe, expect, test } from "bun:test";
import type { DurableEvent } from "@superset/chat/protocol";
import {
	eventBytes,
	MAX_EVENT_BYTES,
	prepareEventForCloud,
} from "./prepareEvent";

describe("prepareEventForCloud", () => {
	test("cuts long tool output and keeps only a session's short fields", () => {
		const tool = prepareEventForCloud({
			type: "item",
			turnId: "t",
			item: {
				id: "x",
				kind: "tool_call",
				title: "cat big.log",
				toolKind: "read",
				toolName: "Read",
				status: "completed",
				content: [],
				rawOutput: "a".repeat(200_000),
				startedAtMs: 0,
			},
		} as DurableEvent);
		expect(JSON.stringify(tool).length).toBeLessThan(70_000);

		const session = prepareEventForCloud({
			type: "session",
			session: {
				status: "idle",
				harness: "claude-acp",
				title: "Fix the build",
				availableCommands: [{ name: "init", description: "" }],
				availableModels: Array.from({ length: 50_000 }, (_, index) => ({
					id: `model-${index}`,
					label: `Model ${index}`,
				})),
			},
		} as DurableEvent);
		expect(session).toEqual({
			type: "session",
			session: {
				status: "idle",
				harness: "claude-acp",
				title: "Fix the build",
			},
		} as DurableEvent);
	});

	function toolCall(fields: Record<string, unknown>): DurableEvent {
		return {
			type: "item",
			turnId: "t",
			item: {
				id: "x",
				kind: "tool_call",
				title: "run",
				toolKind: "execute",
				toolName: "Bash",
				status: "completed",
				content: [],
				startedAtMs: 0,
				...fields,
			},
		} as DurableEvent;
	}

	test("keeps message text that fits, and cuts it only when it does not", () => {
		const text = "m".repeat(200_000);
		const kept = prepareEventForCloud({
			type: "item",
			turnId: "t",
			item: { id: "a", kind: "agent_message", text, startedAtMs: 0 },
		} as DurableEvent);
		expect(kept.type === "item" && kept.item.text).toBe(text);

		const cut = prepareEventForCloud({
			type: "item",
			turnId: "t",
			item: {
				id: "a",
				kind: "agent_message",
				text: "m".repeat(600_000),
				startedAtMs: 0,
			},
		} as DurableEvent);
		expect(eventBytes(cut)).toBeLessThanOrEqual(MAX_EVENT_BYTES);
	});

	test("cuts a message's other strings before its text", () => {
		const text = "m".repeat(300_000);
		const event = prepareEventForCloud({
			type: "item",
			turnId: "t",
			item: {
				id: "a",
				kind: "agent_message",
				text,
				model: "x".repeat(200_000),
				startedAtMs: 0,
			},
		} as DurableEvent);
		expect(event.type === "item" && event.item.text).toBe(text);
		expect(eventBytes(event)).toBeLessThanOrEqual(MAX_EVENT_BYTES);
	});

	test("cuts every long string tighter when their total is still too large", () => {
		const event = prepareEventForCloud(
			toolCall({
				content: Array.from({ length: 10 }, () => ({
					type: "text",
					text: "a".repeat(60_000),
				})),
			}),
		);
		expect(eventBytes(event)).toBeLessThan(60_000);
	});

	test("keeps only the outline of an item made of many small parts", () => {
		const event = prepareEventForCloud(
			toolCall({
				content: Array.from({ length: 200_000 }, () => ({
					type: "text",
					text: "ab",
				})),
			}),
		);
		expect(eventBytes(event)).toBeLessThanOrEqual(MAX_EVENT_BYTES);
		expect(event.type === "item" && event.item).toMatchObject({
			id: "x",
			kind: "tool_call",
			content: [],
			bodyOmitted: true,
		});
	});

	test("keeps long ids whole", () => {
		const id = "i".repeat(10_000);
		const turnId = "t".repeat(10_000);
		const long = toolCall({
			content: Array.from({ length: 10 }, () => ({
				type: "text",
				text: "a".repeat(60_000),
			})),
		}) as Extract<DurableEvent, { type: "item" }>;
		const prepared = prepareEventForCloud({
			...long,
			turnId,
			item: { ...long.item, id },
		} as DurableEvent);
		expect(prepared.type === "item" && prepared.item.id).toBe(id);
		expect(prepared.type === "item" && prepared.turnId).toBe(turnId);
	});

	test("does not cut a character in half", () => {
		const event = prepareEventForCloud(
			toolCall({ rawOutput: `${"a".repeat(64 * 1024 - 1)}😀tail` }),
		);
		const output = event.type === "item" ? String(event.item.rawOutput) : "";
		expect(output.startsWith("a".repeat(64 * 1024 - 1))).toBe(true);
		expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(output)).toBe(false);
	});
});
