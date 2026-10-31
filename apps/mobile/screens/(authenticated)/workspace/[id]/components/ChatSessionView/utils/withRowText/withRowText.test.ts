import { describe, expect, test } from "bun:test";
import type { ChatRow } from "../../../../utils/chatRows";
import { withRowText } from "./withRowText";

const working: ChatRow = { kind: "working", key: "working:t1" };
const reply: ChatRow = { kind: "working", key: "reply" };

describe("withRowText", () => {
	test("gives only the row whose text changed a new entry", () => {
		const cache = new WeakMap();
		const texts = new Map([[reply, "Hel"]]);
		const textOf = (row: ChatRow) => texts.get(row) ?? "";

		const first = withRowText([working, reply], textOf, cache);
		texts.set(reply, "Hello");
		const second = withRowText([working, reply], textOf, cache);

		expect(second[0]).toBe(first[0]);
		expect(second[1]).not.toBe(first[1]);
		expect(second[1]).toEqual({ row: reply, text: "Hello" });
	});
});
