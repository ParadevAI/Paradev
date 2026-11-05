import { describe, expect, test } from "bun:test";
import { readToolCall } from "./readToolCall";

describe("readToolCall", () => {
	test("reads a well-formed call", () => {
		expect(
			readToolCall({
				id: "a.1",
				request: { plugin: "neon", tool: "run_sql", args: { sql: "1" } },
			}),
		).toEqual({
			id: "a.1",
			request: { plugin: "neon", tool: "run_sql", args: { sql: "1" } },
		});
	});

	test("a call without an id cannot be answered", () => {
		expect(readToolCall({ request: {} })).toBeNull();
		expect(readToolCall(null)).toBeNull();
	});

	test("a bad request keeps its id so the page gets an answer", () => {
		for (const request of [
			undefined,
			"neon",
			{ plugin: 1, tool: "run_sql", args: {} },
			{ plugin: "neon", tool: "run_sql" },
			{ plugin: "neon", tool: "run_sql", args: [1] },
		]) {
			expect(readToolCall({ id: "a.2", request })).toEqual({
				id: "a.2",
				request: null,
			});
		}
	});
});
