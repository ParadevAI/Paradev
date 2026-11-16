import { describe, expect, test } from "bun:test";
import type { ApiTriggerField } from "../api-types/api-types.ts";
import { fieldChoices, withFieldOptions } from "./trigger-field-options.ts";

const team: ApiTriggerField = {
	name: "team_id",
	label: "Team",
	type: "string",
	required: true,
};
const project: ApiTriggerField = {
	name: "project_id",
	label: "Project",
	type: "string",
	required: false,
};
const teams = [
	{ value: "t1", label: "Design" },
	{ value: "t2", label: "Engineering" },
];

describe("a trigger field's choices", () => {
	test("an account's choices go on the fields that have any", () => {
		expect(
			withFieldOptions([team, project], { team_id: teams, project_id: [] }),
		).toEqual([{ ...team, options: teams }, project]);
	});

	test("a field without choices takes free text", () => {
		expect(fieldChoices(team, "")).toBeNull();
		expect(
			fieldChoices({ ...team, type: "number", options: teams }, ""),
		).toBeNull();
	});

	test("a required field offers the list; an optional one can be left as Any", () => {
		expect(fieldChoices({ ...team, options: teams }, "t1")).toEqual(teams);
		expect(fieldChoices({ ...project, options: teams }, "")).toEqual([
			{ value: "", label: "Any" },
			...teams,
		]);
	});

	test("a saved value the list doesn't have stays, under its id", () => {
		expect(fieldChoices({ ...team, options: teams }, "ENG")).toEqual([
			...teams,
			{ value: "ENG", label: "ENG" },
		]);
	});
});
