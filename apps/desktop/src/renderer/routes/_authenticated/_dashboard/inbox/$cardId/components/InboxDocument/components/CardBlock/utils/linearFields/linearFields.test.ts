import { describe, expect, test } from "bun:test";
import {
	backlog,
	bug,
	cycle1,
	cycle2,
	desktop,
	labels,
	mobile,
	options,
	todo,
	triageIssue,
} from "../../components/linearFixtures";
import {
	acceptState,
	changedFields,
	nextCycle,
	toggleLabel,
} from "./linearFields";

describe("changedFields", () => {
	test("keeps only what differs from the issue", () => {
		const current = { ...triageIssue.fields, labels: [bug.id, desktop.id] };
		expect(
			changedFields(current, {
				...current,
				labels: [desktop.id, bug.id],
				priority: 2,
				assignee: null,
			}),
		).toEqual({ priority: 2 });
	});

	test("a cleared property is a change", () => {
		const current = { ...triageIssue.fields, estimate: 3, cycle: cycle1.id };
		expect(
			changedFields(current, { ...current, estimate: null, cycle: null }),
		).toEqual({ estimate: null, cycle: null });
	});
});

describe("toggleLabel", () => {
	test("adds and removes", () => {
		expect(toggleLabel([], bug.id, labels)).toEqual([bug.id]);
		expect(toggleLabel([bug.id], bug.id, labels)).toEqual([]);
	});

	test("a group holds one label", () => {
		expect(toggleLabel([bug.id, desktop.id], mobile.id, labels)).toEqual([
			bug.id,
			mobile.id,
		]);
	});
});

test("acceptState is the first backlog status, or the first unstarted one", () => {
	expect(acceptState(options)).toBe(backlog.id);
	expect(
		acceptState({
			...options,
			states: options.states.filter((state) => state.type !== "backlog"),
		}),
	).toBe(todo.id);
});

test("nextCycle is the first one that has not started", () => {
	expect(nextCycle(options.cycles, Date.parse("2037-10-01T00:00:00Z"))).toBe(
		cycle1,
	);
	expect(nextCycle(options.cycles, Date.parse("2037-10-10T00:00:00Z"))).toBe(
		cycle2,
	);
	expect(
		nextCycle(options.cycles, Date.parse("2038-01-01T00:00:00Z")),
	).toBeUndefined();
});
