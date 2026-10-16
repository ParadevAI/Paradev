import { describe, expect, test } from "bun:test";
import { bugDraft } from "../../../handoffFixtures";
import { bug, team, todo } from "../../../linearFixtures";
import { draftInput, draftValue } from "./draftInput";

describe("draftInput", () => {
	test("sends the team by id and only the properties that are set", () => {
		expect(draftInput(bugDraft, draftValue(bugDraft))).toEqual({
			team: team.id,
			title: bugDraft.title,
			description: bugDraft.description,
			fields: { state: todo.id, priority: 2, labels: [bug.id] },
		});
	});

	test("keeps an explicit none and drops what was never set", () => {
		const input = draftInput(bugDraft, {
			title: "  Safari sign-in loop ",
			description: "",
			fields: { assignee: null, priority: undefined },
		});
		expect(input).toEqual({
			team: team.id,
			title: "Safari sign-in loop",
			description: "",
			fields: { assignee: null },
		});
	});

	test("an empty title files nothing", () => {
		expect(
			draftInput(bugDraft, { ...draftValue(bugDraft), title: "  " }),
		).toBeNull();
	});
});
