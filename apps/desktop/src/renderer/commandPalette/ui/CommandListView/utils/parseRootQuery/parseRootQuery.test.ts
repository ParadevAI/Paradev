import { describe, expect, test } from "bun:test";
import { parseRootQuery } from "./parseRootQuery";

describe("parseRootQuery", () => {
	test("a plain query searches everything", () => {
		expect(parseRootQuery("re")).toEqual({ commandsOnly: false, query: "re" });
	});

	test("a leading > narrows to commands and is dropped from the query", () => {
		expect(parseRootQuery(">re")).toEqual({ commandsOnly: true, query: "re" });
		expect(parseRootQuery("  > re")).toEqual({
			commandsOnly: true,
			query: " re",
		});
	});

	test("> alone lists every command", () => {
		expect(parseRootQuery(">")).toEqual({ commandsOnly: true, query: "" });
	});
});
