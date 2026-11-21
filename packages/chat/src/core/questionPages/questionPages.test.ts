import { describe, expect, it } from "bun:test";
import type { FormField } from "../../protocol";
import {
	isInvalidNumber,
	isPageAnswered,
	isPageComplete,
	questionPages,
} from "./questionPages";

const choice = (id: string): FormField => ({
	id,
	input: "single",
	options: [{ value: "a", label: "a" }],
});
const text = (id: string): FormField => ({ id, input: "text" });

describe("questionPages", () => {
	it("pairs each choice with the text field that follows it", () => {
		const pages = questionPages([
			choice("q0"),
			text("q0_custom"),
			choice("q1"),
			text("q1_custom"),
			text("note"),
		]);
		expect(pages.map((page) => [page.field.id, page.other?.id])).toEqual([
			["q0", "q0_custom"],
			["q1", "q1_custom"],
			["note", undefined],
		]);
	});

	it("accepts a Codex note as the only answer to its required choice", () => {
		const pages = questionPages([
			{ ...choice("delivery"), required: true },
			{ ...text("delivery_note1"), answerFor: "delivery" },
		]);
		expect(pages).toHaveLength(1);
		const [page] = pages;
		if (!page) throw new Error("Missing question");
		expect(isPageAnswered(page, { delivery_note1: "Pickup" })).toBe(true);
		expect(isPageAnswered(page, { delivery_note1: " " })).toBe(false);
	});

	it("attaches a delayed note to its own question without replacing an earlier note", () => {
		const pages = questionPages([
			choice("1"),
			choice("2"),
			{ ...text("first_note"), answerFor: "1" },
			{ ...text("second_note"), answerFor: "2" },
			{ ...text("duplicate"), answerFor: "1" },
		]);
		expect(pages.map(({ field, other }) => [field.id, other?.id])).toEqual([
			["1", "first_note"],
			["2", "second_note"],
			["duplicate", undefined],
		]);
	});

	it("attaches a preceding note without moving its choice ahead of other questions", () => {
		const pages = questionPages([
			{ ...text("note"), answerFor: "delivery" },
			text("address"),
			choice("delivery"),
		]);
		expect(pages.map(({ field, other }) => [field.id, other?.id])).toEqual([
			["address", undefined],
			["delivery", "note"],
		]);
	});

	it("prefers an explicit note and keeps the legacy field separately editable", () => {
		const pages = questionPages([
			choice("delivery"),
			text("delivery_custom"),
			{ ...text("note"), answerFor: "delivery" },
		]);
		expect(pages.map(({ field, other }) => [field.id, other?.id])).toEqual([
			["delivery", "note"],
			["delivery_custom", undefined],
		]);
	});

	it("requires a linked field marked required even after picking a choice", () => {
		const [page] = questionPages([
			{ ...choice("delivery"), required: true },
			{ ...text("note"), answerFor: "delivery", required: true },
		]);
		if (!page) throw new Error("Missing question");
		expect(isPageComplete(page, { delivery: "a" })).toBe(false);
		expect(isPageComplete(page, { note: "Pickup" })).toBe(true);
		expect(
			isPageComplete(page, { delivery: "a", note: "Leave at reception" }),
		).toBe(true);
	});

	it("keeps a suffix field independent of an unrelated required scalar", () => {
		const pages = questionPages([
			{ id: "count", input: "integer", required: true },
			text("count_custom"),
		]);
		expect(pages).toHaveLength(2);
		const [count] = pages;
		if (!count) throw new Error("Missing count");
		expect(isPageComplete(count, { count_custom: "several" })).toBe(false);
	});

	it("still requires an array selection when a required multi-choice has a legacy note", () => {
		const [page] = questionPages([
			{ ...choice("meals"), input: "multi", required: true },
			text("meals_custom"),
		]);
		if (!page) throw new Error("Missing meals");
		expect(isPageComplete(page, { meals_custom: "a note" })).toBe(false);
		expect(isPageComplete(page, { meals: ["a"], meals_custom: "a note" })).toBe(
			true,
		);
	});

	it("keeps a generic text field on its own page", () => {
		const pages = questionPages([choice("priority"), text("notes")]);
		expect(pages.map((page) => [page.field.id, page.other?.id])).toEqual([
			["priority", undefined],
			["notes", undefined],
		]);
	});

	it("flags a decimal in a whole-number field but not an empty one", () => {
		const integer: FormField = { id: "count", input: "integer" };
		const number: FormField = { id: "ratio", input: "number" };
		expect(isInvalidNumber(integer, "3.9")).toBe(true);
		expect(isInvalidNumber(integer, "4")).toBe(false);
		expect(isInvalidNumber(integer, "")).toBe(false);
		expect(isInvalidNumber(number, "3.9")).toBe(false);
		expect(isInvalidNumber(number, ["3"])).toBe(true);
	});
});
