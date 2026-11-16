import { expect, test } from "bun:test";
import {
	type LinearDelivery,
	matchableFrom,
	normalizeLinearDelivery,
} from "./normalizeLinearDelivery";

test("comment triggers and prompts use the parent issue without losing the comment", () => {
	const delivery: LinearDelivery = {
		type: "Comment",
		action: "create",
		organizationId: "linear-org",
		webhookTimestamp: 123,
		url: "https://linear.app/team/issue/TEAM-1#comment-1",
		actor: { id: "author", name: "Author" },
		data: {
			id: "comment-1",
			issueId: "issue-1",
			userId: "author",
			body: "/superset fix this",
		},
		commentIssue: {
			id: "issue-1",
			identifier: "TEAM-1",
			title: "Fix login",
			url: "https://linear.app/team/issue/TEAM-1",
			teamId: "team",
			projectId: "project",
			labelIds: ["bug"],
			stateId: "todo",
			assigneeId: "owner",
		},
	};
	const event = matchableFrom(delivery);
	expect(event).toMatchObject({
		names: ["comment.created"],
		teamId: "team",
		projectId: "project",
		labelIds: ["bug"],
		actorId: "author",
		assigneeId: "owner",
		body: "/superset fix this",
	});
	const result = normalizeLinearDelivery({
		delivery,
		event,
		deliveryId: "delivery",
		connection: {
			id: "connection",
			organizationId: "org",
			connectedByUserId: "user",
		},
		webhookEventId: "webhook",
	});
	expect(result.event).toMatchObject({
		resourceKey: "linear:issue:issue-1",
		title: "TEAM-1 Fix login",
		url: delivery.url,
		payload: delivery,
	});
});
