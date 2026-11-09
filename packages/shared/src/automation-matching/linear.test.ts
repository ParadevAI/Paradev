import { describe, expect, test } from "bun:test";
import { linearTriggerConfigSchema } from "../automation-triggers";
import { resolveMeScopes } from "./core";
import {
	type LinearMatchableEvent,
	linearEventNames,
	linearTriggerMatches,
} from "./linear";

const config = linearTriggerConfigSchema.parse({
	kind: "linear",
	event: "comment.created",
	teams: { mode: "list", ids: ["team"] },
	projects: { mode: "list", ids: ["project"] },
	labels: { mode: "list", ids: ["label"] },
	actor: { mode: "me" },
	commentFilter: { pattern: "/superset" },
});
const event: LinearMatchableEvent = {
	provider: "linear",
	eventType: "Comment.create",
	names: ["comment.created"],
	body: "/SUPERSET fix this",
	actorId: "author",
	actorLogin: "Author",
	teamId: "team",
	projectId: "project",
	labelIds: ["label"],
	stateId: "state",
	assigneeId: null,
};

describe("Linear comments", () => {
	test("only new issue comments name a trigger", () => {
		const delivery = {
			type: "Comment",
			action: "create",
			issueId: "issue",
			updatedFrom: null,
			assigneeId: null,
			completedAt: null,
		};
		expect(linearEventNames(delivery)).toEqual(["comment.created"]);
		expect(linearEventNames({ ...delivery, action: "update" })).toEqual([]);
		expect(linearEventNames({ ...delivery, action: "remove" })).toEqual([]);
		expect(linearEventNames({ ...delivery, issueId: null })).toEqual([]);
	});

	test("matches text and author against the parent issue scopes", () => {
		const resolved = resolveMeScopes(config, "author");
		expect(linearTriggerMatches(resolved, event)).toEqual({ matches: true });
		for (const [field, value, reason] of [
			["body", "Thanks!", "commentFilter"],
			["actorId", "someone-else", "actor"],
			["teamId", "other-team", "team"],
			["projectId", "other-project", "project"],
			["labelIds", [], "label"],
		] as const) {
			expect(
				linearTriggerMatches(resolved, { ...event, [field]: value }),
			).toEqual({ matches: false, reason });
		}
	});

	test("old Linear configs keep their matching behavior", () => {
		const legacy = linearTriggerConfigSchema.parse({
			kind: "linear",
			event: "issue.created",
		});
		expect(legacy.actor).toEqual({ mode: "any" });
		expect(legacy.commentFilter).toBeNull();
		expect(
			linearTriggerMatches(legacy, {
				...event,
				names: ["issue.created"],
				body: null,
			}),
		).toEqual({ matches: true });
	});
});
