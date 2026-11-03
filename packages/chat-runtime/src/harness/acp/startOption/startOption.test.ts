import { describe, expect, test } from "bun:test";
import { startOptionId } from "./startOption";

const claude = [
	{ id: "default", label: "Default (recommended)" },
	{ id: "claude-opus-5-5", label: "Opus 5.5" },
	{ id: "claude-opus-5-5[1m]", label: "Opus 5.5 (1M context)" },
	{ id: "claude-haiku-4-5", label: "Haiku 4.5" },
];

describe("startOptionId", () => {
	test("an exact id wins", () => {
		expect(startOptionId(claude, "claude-opus-5-5")).toBe("claude-opus-5-5");
	});

	test("a CLI alias finds the one option of its family", () => {
		expect(startOptionId(claude, "haiku")).toBe("claude-haiku-4-5");
	});

	test("a context suffix is the same model, and the plain id is preferred", () => {
		expect(startOptionId([...claude].reverse(), "claude-opus-5-5")).toBe(
			"claude-opus-5-5",
		);
		expect(startOptionId(claude, "Opus 5.5")).toBe("claude-opus-5-5");
	});

	test("variants of one model count once", () => {
		expect(startOptionId(claude, "opus")).toBe("claude-opus-5-5");
	});

	test("a name two models share picks neither", () => {
		const both = [...claude, { id: "claude-opus-5", label: "Opus 5" }];
		expect(startOptionId(both, "opus")).toBeUndefined();
		expect(startOptionId(claude, "gpt-6-sol")).toBeUndefined();
	});
});
