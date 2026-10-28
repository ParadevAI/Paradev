import { describe, expect, test } from "bun:test";
import { resolveCollisions } from "./commandCollisions";

const APP = [
	{ name: "new", aliases: ["clear", "reset"] },
	{ name: "plan" },
	{ name: "fork", aliases: ["branch"] },
	{ name: "resume", aliases: ["continue"] },
	{ name: "find" },
];

function names(resolved: ReturnType<typeof resolveCollisions>) {
	return resolved.app.map(({ command, aliases }) => [command.name, ...aliases]);
}

describe("resolveCollisions", () => {
	test("hides the agent's command where the app's is better and keeps the rest", () => {
		const resolved = resolveCollisions(APP, [
			"plan",
			"continue",
			"compact",
			"review",
		]);
		expect([...resolved.hiddenAgentNames].sort()).toEqual(["continue", "plan"]);
		expect(names(resolved)).toEqual([
			["new", "clear", "reset"],
			["plan"],
			["fork", "branch"],
			["resume", "continue"],
			["find"],
		]);
	});

	test("gives a name the table does not list to the agent", () => {
		const resolved = resolveCollisions(APP, ["find", "reset"], {
			reset: "agent",
		});
		expect(resolved.hiddenAgentNames.size).toBe(0);
		expect(names(resolved)).toEqual([
			["new", "clear"],
			["plan"],
			["fork", "branch"],
			["resume", "continue"],
		]);
	});
});
