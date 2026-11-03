import { describe, expect, it } from "bun:test";
import type { DurableEvent, Item } from "@superset/chat/protocol";
import { type AcpUpdate, acp } from "../../acp/updates";
import { AcpEventMapper } from "./AcpEventMapper";
import pdevRun from "./fixtures/pdevRun.json";

function itemsOf(events: DurableEvent[]): Item[] {
	const items = new Map<string, Item>();
	for (const event of events) {
		if (event.type === "item") items.set(event.item.id, event.item);
	}
	return [...items.values()];
}

describe("pdev's ACP updates into chat-v3 events", () => {
	it("produces the user message, reply, a finished bash card and an edit diff", () => {
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
		run(mapper.apply(acp.userMessage("u-1", "run the tests", "p-1"), turnId));
		for (const update of pdevRun as AcpUpdate[])
			run(mapper.apply(update, turnId));
		run(
			mapper.endTurn({
				id: turnId,
				status: "completed",
				startedAtMs: 1_000,
				completedAtMs: 2_000,
			}),
		);

		const items = itemsOf(events);
		expect(items.find((item) => item.kind === "user_message")).toMatchObject({
			content: [{ type: "text", text: "run the tests" }],
			clientId: "p-1",
		});
		const reply = items.find((item) => item.kind === "agent_message");
		expect(reply && "text" in reply ? reply.text : null).toBe("done");
		expect(deltas.join("")).toBe("done");
		const tools = items.filter((item) => item.kind === "tool_call");
		expect(tools[0]).toMatchObject({
			title: "echo 12 pass",
			toolKind: "execute",
			status: "completed",
		});
		expect(JSON.stringify(tools[0])).toContain("12 pass");
		expect(tools[1]).toMatchObject({ toolKind: "edit", status: "completed" });
		expect(JSON.stringify(tools[1])).toContain("-a");
		expect(JSON.stringify(tools[1])).toContain("+b");
		expect(events.at(-1)).toMatchObject({
			type: "session",
			session: { status: "idle" },
		});
	});
});
