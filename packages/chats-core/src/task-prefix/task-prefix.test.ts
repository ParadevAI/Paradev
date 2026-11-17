import { describe, expect, test } from "bun:test";
import { hasTaskPrefix, withTaskPrefix } from "./task-prefix.ts";

describe("withTaskPrefix", () => {
	test("prefixes an empty or typed draft", () => {
		expect(withTaskPrefix("")).toBe("/task ");
		expect(withTaskPrefix("  Pay rent")).toBe("/task Pay rent");
	});

	test("leaves a task command alone, even an unfinished one", () => {
		expect(withTaskPrefix("/task ")).toBe("/task ");
		expect(withTaskPrefix("/task Pay rent")).toBe("/task Pay rent");
	});

	test("a word that merely starts with /task is not a command", () => {
		expect(hasTaskPrefix("/tasks")).toBe(false);
		expect(withTaskPrefix("/tasks")).toBe("/task /tasks");
	});
});
