import { expect, test } from "bun:test";
import { toolsFor } from "./register";

const names = (kind: "person" | "dev") =>
	toolsFor(kind).map((tool) => tool.name);

test("a Dev sees its own tools and the page tools, nothing a person runs on a host", () => {
	expect(names("dev")).toEqual([
		"pages_list",
		"pages_get",
		"pages_versions",
		"pages_pull",
		"pages_publish",
		"reply",
		"list_work",
		"read_task",
		"start_task",
		"message_task",
		"stop_task",
		"remember",
		"recall",
		"list_environments",
		"read_channel",
		"channel_tasks",
		"routine_update",
	]);
});

test("a person sees no Dev tool", () => {
	const dev = new Set(
		toolsFor("dev")
			.filter((tool) => !tool.callers?.includes("person"))
			.map((tool) => tool.name),
	);
	expect(names("person").filter((name) => dev.has(name))).toEqual([]);
});
