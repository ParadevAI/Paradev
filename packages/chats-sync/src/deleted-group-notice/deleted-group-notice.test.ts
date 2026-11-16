import { describe, expect, test } from "bun:test";
import { fromBootstrap } from "../from-api/from-api.ts";
import { bootstrap } from "../test-fixtures/test-fixtures.ts";
import { deletedGroupNotice } from "./deleted-group-notice.ts";

const state = fromBootstrap(bootstrap());
const deleted = (deletedBy: string) => ({
	type: "group.deleted" as const,
	groupId: "g-trip",
	title: "Trip",
	deletedBy,
});

describe("the deleted-group notice", () => {
	test("tells someone inside the group who deleted it", () => {
		const by = state.members.u2!.name;
		expect(deletedGroupNotice(state, deleted("u2"), "g-trip")).toEqual({
			title: "This group was deleted",
			description: `${by} deleted “Trip”.`,
		});
	});

	test("falls back when the deleter isn't known here", () => {
		expect(
			deletedGroupNotice(state, deleted("u-gone"), "g-trip")?.description,
		).toBe("Its owner deleted “Trip”.");
	});

	test("says nothing elsewhere, to the person who deleted it, or for other events", () => {
		expect(deletedGroupNotice(state, deleted("u2"), "g-me")).toBeNull();
		expect(deletedGroupNotice(state, deleted("u2"), null)).toBeNull();
		expect(deletedGroupNotice(state, deleted(state.meId), "g-trip")).toBeNull();
		expect(
			deletedGroupNotice(state, { type: "groups.changed" }, "g-trip"),
		).toBeNull();
	});
});
