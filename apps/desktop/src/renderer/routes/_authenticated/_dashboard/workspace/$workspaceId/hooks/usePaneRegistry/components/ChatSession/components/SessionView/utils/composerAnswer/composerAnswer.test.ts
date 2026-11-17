import { describe, expect, it } from "bun:test";
import type {
	ApprovalRequest,
	FormField,
	UserContent,
} from "@superset/chat/protocol";
import { composerAnswer } from "./composerAnswer";

const request = (fields: FormField[]): ApprovalRequest => ({
	id: "approval-1",
	kind: "approval_request",
	targetItemId: null,
	title: "Which one?",
	status: "pending",
	startedAtMs: 0,
	form: { message: "Which one?", fields },
});
const reply = (text: string): UserContent[] => [{ type: "text", text }];
const choice: FormField = {
	id: "answer",
	input: "single",
	options: [
		{ value: "opt-a", label: "Option A" },
		{ value: "opt-b", label: "Option B" },
	],
};
const other: FormField = { id: "answer_custom", input: "text" };

describe("composerAnswer", () => {
	it("picks the option whose label matches the reply", () => {
		expect(
			composerAnswer(request([choice, other]), reply(" option b ")),
		).toEqual({ type: "form", values: { answer: "opt-b" } });
	});

	it("puts any other reply in the free-text answer", () => {
		expect(
			composerAnswer(request([choice, other]), reply("Neither, use C")),
		).toEqual({ type: "form", values: { answer_custom: "Neither, use C" } });
	});

	it("fills a text, number, multi, or yes/no question", () => {
		expect(
			composerAnswer(request([{ id: "name", input: "text" }]), reply("Ada")),
		).toEqual({ type: "form", values: { name: "Ada" } });
		expect(
			composerAnswer(request([{ id: "n", input: "integer" }]), reply("3")),
		).toEqual({ type: "form", values: { n: "3" } });
		expect(
			composerAnswer(
				request([{ ...choice, input: "multi" }]),
				reply("Option A"),
			),
		).toEqual({ type: "form", values: { answer: ["opt-a"] } });
		expect(
			composerAnswer(request([{ id: "ok", input: "boolean" }]), reply("yes")),
		).toEqual({ type: "form", values: { ok: "true" } });
	});

	it("does not answer what the reply cannot fill", () => {
		expect(composerAnswer(request([choice]), reply("something else"))).toBe(
			null,
		);
		expect(
			composerAnswer(request([{ id: "n", input: "integer" }]), reply("1.5")),
		).toBe(null);
		expect(
			composerAnswer(
				request([choice, other, { id: "notes", input: "text" }]),
				reply("Option A"),
			),
		).toBe(null);
		expect(composerAnswer(request([other]), reply("   "))).toBe(null);
		const permission = { ...request([]), form: undefined };
		expect(composerAnswer(permission, reply("yes"))).toBe(null);
	});
});
