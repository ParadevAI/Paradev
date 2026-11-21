import { expect, test } from "bun:test";
import { parseModelMetadata } from "./metadata";

test("metadata keeps provider identities separate and tolerates invalid model entries", () => {
	const result = parseModelMetadata({
		a: {
			models: {
				one: { id: "model", tool_call: true, limit: { context: 1000 } },
				bad: { id: 12 },
			},
		},
		b: { models: { one: { id: "model", tool_call: false } } },
	});
	expect(result.size).toBe(2);
	expect(result.get("a/model")?.contextWindow).toBe(1000);
	expect(result.get("b/model")?.toolCall).toBe(false);
});
