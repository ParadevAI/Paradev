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

describe("startOptionId against claude-agent-acp 0.85 options", () => {
	const acp = [
		{ id: "default", label: "Default (recommended)" },
		{ id: "opus", label: "Opus 5.5" },
		{ id: "claude-fable-5-1", label: "Fable 5.1" },
		{ id: "sonnet", label: "Sonnet 5.5" },
		{ id: "haiku", label: "Haiku 4.5" },
		{ id: "claude-sonnet-5", label: "Sonnet 5" },
		{ id: "claude-opus-5", label: "Opus 5" },
		{ id: "claude-fable-5", label: "Fable 5" },
		{ id: "claude-opus-4-8", label: "Opus 4.8" },
		{ id: "claude-opus-4-7", label: "Opus 4.7" },
		{ id: "claude-opus-4-6", label: "Opus 4.6" },
		{ id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
	];

	test("a pinned dotted version is not taken for its major version", () => {
		expect(startOptionId(acp, "claude-opus-5-5")).toBe("opus");
		expect(startOptionId(acp, "claude-sonnet-5-5")).toBe("sonnet");
		expect(startOptionId(acp, "claude-haiku-4-5")).toBe("haiku");
	});

	test("a pinned Fable id finds the alias that lists its version", () => {
		const fable = [...acp, { id: "fable", label: "Fable 5.2" }];
		expect(startOptionId(fable, "claude-fable-5-2")).toBe("fable");
		expect(startOptionId(fable, "claude-fable-5-1")).toBe("claude-fable-5-1");
	});

	test("pinned ids the agent lists keep their exact option", () => {
		expect(startOptionId(acp, "claude-opus-5")).toBe("claude-opus-5");
		expect(startOptionId(acp, "claude-opus-4-8")).toBe("claude-opus-4-8");
		expect(startOptionId(acp, "opus")).toBe("opus");
	});

	test("a label without the version never stands in for a pinned one", () => {
		const unversioned = [
			{ id: "default", label: "Default (recommended)" },
			{ id: "opus", label: "Opus" },
			{ id: "claude-opus-5", label: "Opus 5" },
		];
		expect(startOptionId(unversioned, "claude-opus-5-5")).toBeUndefined();
	});

	test("a two-digit minor version is one version, not two numbers", () => {
		const opus = [
			{ id: "claude-opus-4", label: "Opus 4" },
			{ id: "opus", label: "Opus 4.10" },
		];
		expect(startOptionId(opus, "claude-opus-4-10")).toBe("opus");
	});

	test("a short label never takes a pinned id that names another version", () => {
		const longContext = [
			{ id: "default", label: "Default (recommended)" },
			{ id: "claude-opus-5-5[1m]", label: "Opus" },
		];
		expect(startOptionId(longContext, "claude-opus-5")).toBeUndefined();
	});
});

describe("startOptionId never takes a sibling model", () => {
	test("a wanted id with words the label lacks picks nothing", () => {
		const codex = [
			{ id: "gpt-5.1-codex", label: "GPT-5.1-Codex" },
			{ id: "gpt-5.1-codex-max", label: "GPT-5.1-Codex-Max" },
		];
		expect(startOptionId(codex, "gpt-5.1-codex-mini")).toBeUndefined();
		const gemini = [
			{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
			{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
		];
		expect(startOptionId(gemini, "gemini-2.5-flash-lite")).toBeUndefined();
		const opus = [{ id: "opus", label: "Opus 4.8" }];
		expect(startOptionId(opus, "claude-opus-4-8-1")).toBeUndefined();
	});

	test("a vendor prefix and a date do not count as extra words", () => {
		const sonnet = [{ id: "sonnet", label: "Sonnet 4.5" }];
		expect(startOptionId(sonnet, "claude-sonnet-4-5-20250929")).toBe("sonnet");
	});

	test("a context variant only matches the same variant", () => {
		const opus = [
			{ id: "default", label: "Default (recommended)" },
			{ id: "opus", label: "Opus 5.5" },
			{ id: "claude-opus-5-5[1m]", label: "Opus 5.5 (1M context)" },
		];
		expect(startOptionId(opus, "claude-opus-5-5")).toBe("opus");
		expect(startOptionId(opus, "claude-opus-5-5[1m]")).toBe(
			"claude-opus-5-5[1m]",
		);
		expect(
			startOptionId([{ id: "opus", label: "Opus 5.5" }], "claude-opus-5-5[1m]"),
		).toBeUndefined();
	});

	test("a label with only a version names no model", () => {
		expect(
			startOptionId([{ id: "x", label: "5.5" }], "claude-opus-5-5"),
		).toBeUndefined();
	});
});
