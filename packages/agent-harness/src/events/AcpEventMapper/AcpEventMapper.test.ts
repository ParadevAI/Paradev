import { describe, expect, it } from "bun:test";
import type {
	AssistantMessage,
	AssistantMessageEvent,
} from "@earendil-works/pi-ai";
import type { DurableEvent, Item } from "@superset/chat/protocol";
import { PiToAcp } from "../../acp/piToAcp";
import { AcpEventMapper } from "./AcpEventMapper";

function assistant(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "toolUse",
		timestamp: 1,
	} as AssistantMessage;
}

function itemsOf(events: DurableEvent[]): Map<string, Item> {
	const items = new Map<string, Item>();
	for (const event of events) {
		if (event.type === "item") items.set(event.item.id, event.item);
	}
	return items;
}

describe("pi events through ACP into chat-v3 events", () => {
	it("produces the user message, streamed text and a finished tool card", () => {
		const toAcp = new PiToAcp("/workspace");
		const mapper = new AcpEventMapper({
			harness: "agent-harness",
			now: () => 1_000,
		});
		const turnId = "turn-1";
		const events: DurableEvent[] = [];
		const deltas: string[] = [];
		const run = (out: ReturnType<AcpEventMapper["apply"]>) => {
			events.push(...out.events);
			for (const delta of out.deltas)
				if (delta.type === "text") deltas.push(delta.append);
		};

		run(mapper.startTurn(turnId, 1_000));
		run(mapper.apply(toAcp.userMessage("u-1", "run the tests", "p-1"), turnId));

		const toolCall = {
			type: "toolCall" as const,
			id: "call_1",
			name: "bash",
			arguments: { command: "bun test" },
		};
		const partial = assistant([{ type: "text", text: "Running" }, toolCall]);
		const stream: AssistantMessageEvent[] = [
			{ type: "text_delta", contentIndex: 0, delta: "Run", partial },
			{ type: "text_delta", contentIndex: 0, delta: "ning", partial },
			{ type: "toolcall_start", contentIndex: 1, partial },
			{ type: "toolcall_end", contentIndex: 1, toolCall, partial },
		];
		for (const event of stream) {
			for (const update of toAcp.assistantEvent(event, "m-1"))
				run(mapper.apply(update, turnId));
		}
		for (const update of toAcp.assistantEnd(partial, "m-1"))
			run(mapper.apply(update, turnId));

		run(
			mapper.apply(
				toAcp.toolStart("call_1", "bash", { command: "bun test" }),
				turnId,
			),
		);
		run(
			mapper.apply(
				toAcp.toolEnd({
					toolCallId: "call_1",
					toolName: "bash",
					result: { content: [{ type: "text", text: "12 pass, 0 fail" }] },
					isError: false,
				}),
				turnId,
			),
		);
		run(
			mapper.endTurn({
				id: turnId,
				status: "completed",
				startedAtMs: 1_000,
				completedAtMs: 2_000,
			}),
		);

		const items = [...itemsOf(events).values()];
		const user = items.find((item) => item.kind === "user_message");
		const reply = items.find((item) => item.kind === "agent_message");
		const tool = items.find((item) => item.kind === "tool_call");
		expect(user).toMatchObject({
			content: [{ type: "text", text: "run the tests" }],
			clientId: "p-1",
		});
		expect(reply && "text" in reply ? reply.text : null).toBe("Running");
		expect(deltas.join("")).toBe("Running");
		expect(tool).toMatchObject({
			title: "bun test",
			toolName: "bash",
			toolKind: "execute",
			status: "completed",
		});
		expect(JSON.stringify(tool)).toContain("12 pass, 0 fail");
		expect(events.at(-2)).toMatchObject({
			type: "turn",
			turn: { status: "completed" },
		});
		expect(events.at(-1)).toMatchObject({
			type: "session",
			session: { status: "idle" },
		});
	});

	it("shows an edit as a diff", () => {
		const toAcp = new PiToAcp("/workspace");
		const mapper = new AcpEventMapper({ harness: "agent-harness" });
		mapper.apply(toAcp.toolStart("call_2", "edit", { path: "a.ts" }), "t");
		const out = mapper.apply(
			toAcp.toolEnd({
				toolCallId: "call_2",
				toolName: "edit",
				result: {},
				isError: false,
				fileChange: { path: "/workspace/a.ts", oldText: "a\n", newText: "b\n" },
			}),
			"t",
		);
		const tool = [...itemsOf(out.events).values()][0];
		expect(tool).toMatchObject({
			toolKind: "edit",
			status: "completed",
			title: "a.ts",
		});
		expect(JSON.stringify(tool)).toContain("-a");
		expect(JSON.stringify(tool)).toContain("+b");
	});
});
