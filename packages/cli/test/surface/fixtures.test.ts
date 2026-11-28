import { describe, it } from "bun:test";
import statusesList from "../../src/commands/tasks/statuses/list/command";
import { expectFixture, fakeApi, fakeContext, runForFixture } from "./fixtures";

const statuses = [
	{ id: "st_todo", name: "Todo", type: "unstarted", position: 0 },
	{ id: "st_done", name: "Done", type: "completed", position: 1 },
];

function ctx() {
	return fakeContext({
		api: fakeApi({
			"organization.getActive": () => ({ taskTracker: "superset" }),
			"task.statuses.list": () => statuses,
		}).api,
	});
}

describe("tasks statuses list fixtures", () => {
	it("prints the organization's statuses", async () => {
		expectFixture(
			"tasks-statuses-list",
			"paradev tracker",
			await runForFixture(statusesList, {
				options: { tracker: undefined, team: undefined },
				args: {},
				ctx: ctx(),
			}),
		);
	});

	it("rejects --team for Paradev statuses", async () => {
		expectFixture(
			"tasks-statuses-list",
			"team on paradev tracker",
			await runForFixture(statusesList, {
				options: { tracker: undefined, team: "ENG" },
				args: {},
				ctx: ctx(),
			}),
		);
	});
});
