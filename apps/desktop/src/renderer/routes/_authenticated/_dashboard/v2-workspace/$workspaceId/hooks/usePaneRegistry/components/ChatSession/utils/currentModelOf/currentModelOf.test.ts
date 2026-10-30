import { describe, expect, it } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { currentModelOf } from "./currentModelOf";

const modelOption = (
	currentValue: string,
	labelled = true,
): SessionConfigOption =>
	({
		id: "model",
		category: "model",
		currentValue,
		options: labelled ? [{ id: "a", label: "Model A" }] : [{ id: "b" }],
	}) as unknown as SessionConfigOption;

describe("currentModelOf", () => {
	it("is null without a model option", () => {
		expect(currentModelOf(undefined)).toBeNull();
		expect(currentModelOf([])).toBeNull();
	});

	it("reads the selected model and its label", () => {
		expect(currentModelOf([modelOption("a")])).toEqual({
			id: "a",
			label: "Model A",
		});
	});

	it("keeps the id when the label is unknown", () => {
		expect(currentModelOf([modelOption("b")])).toEqual({
			id: "b",
			label: "b",
		});
	});
});
