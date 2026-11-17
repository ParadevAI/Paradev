import { describe, expect, test } from "bun:test";
import { appAgentId } from "./app-agent.ts";

const wren = { id: "wren", kind: "group" as const };
const juniper = { id: "juniper", kind: "personal" as const };
const scout = { id: "scout", kind: "custom" as const };

describe("appAgentId", () => {
	test("the Dev that made the app, while it's in the chat", () => {
		expect(
			appAgentId({ kind: "group", devs: [wren, juniper] }, "juniper"),
		).toBe("juniper");
		expect(appAgentId({ kind: "direct", devs: [scout] }, "scout")).toBe(
			"scout",
		);
	});

	test("the group's own Dev once the maker has left, or when no Dev made it", () => {
		expect(appAgentId({ kind: "group", devs: [juniper, wren] }, "gone")).toBe(
			"wren",
		);
		expect(appAgentId({ kind: "group", devs: [juniper, wren] }, null)).toBe(
			"wren",
		);
	});

	test("a 1:1's Dev", () => {
		expect(appAgentId({ kind: "direct", devs: [juniper] }, null)).toBe(
			"juniper",
		);
	});

	test("nobody when the chat has no Dev of its own", () => {
		expect(appAgentId({ kind: "group", devs: [juniper] }, "gone")).toBeNull();
		expect(appAgentId({ kind: "direct", devs: [] }, null)).toBeNull();
	});
});
