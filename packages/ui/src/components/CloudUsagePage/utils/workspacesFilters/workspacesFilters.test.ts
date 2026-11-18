import { expect, test } from "bun:test";
import { workspacesFilters } from "./workspacesFilters";

test("keeps valid values and drops what the router would refuse", () => {
	const read = (search: Record<string, string>) => (key: string) => search[key];
	expect(
		workspacesFilters(
			read({
				user: "b0000000-0000-4000-8000-000000000001",
				size: "large",
				status: "asleep",
				q: "  fix ",
				sort: "name",
			}),
		),
	).toEqual({
		user: "b0000000-0000-4000-8000-000000000001",
		size: "large",
		status: "asleep",
		q: "fix",
		sort: "name",
	});
	expect(
		workspacesFilters(
			read({
				user: "maya",
				size: "huge",
				status: "ready",
				q: " ",
				sort: "boots",
			}),
		),
	).toEqual({
		user: undefined,
		size: undefined,
		status: undefined,
		q: undefined,
		sort: undefined,
	});
});
