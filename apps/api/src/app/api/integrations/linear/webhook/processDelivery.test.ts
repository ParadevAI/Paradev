import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import * as connectors from "@superset/trpc/connectors";
import * as linear from "@superset/trpc/integrations/linear";
import * as syncPolicy from "@superset/trpc/sync-policy";
import * as automationEvent from "@/lib/automations/ingestAutomationEvent";
import * as webhookDelivery from "@/lib/ingest/recordWebhookDelivery";
import { stub } from "../../../../../../test/stub";

const ORG = "org-1";
const WORKSPACE = "linear-workspace-1";

function connection(id: string, userId: string) {
	return {
		id,
		organizationId: ORG,
		connectedByUserId: userId,
		connector: "linear",
		ownerKind: "user",
		externalAccountId: WORKSPACE,
		disconnectedAt: null,
	};
}

let subscribers: ReturnType<typeof connection>[] = [];
stub(connectors, {
	accountConnection: mock(async () => subscribers[0] ?? null),
	accountConnections: mock(async () => subscribers),
	connectionBotToken: mock(async () => "bot-token"),
});

// The plan gate is exercised on the route, not here: these cases are about
// how one delivery fans out across connections.
stub(syncPolicy, {
	organizationSyncs: mock(() => undefined),
	organizationSyncsNow: mock(async () => true),
	syncingOrganizationIds: mock(
		async (organizationIds: string[]) => new Set(organizationIds),
	),
});

const issueReads: string[] = [];
const issueClient = {
	client: {
		rawRequest: async () => ({
			data: {
				issue: {
					id: "issue-1",
					title: "Fix login",
					identifier: "TEAM-1",
					url: "https://linear.app/issue/TEAM-1",
					team: { id: "team-1" },
					project: null,
					state: { id: "todo" },
					assignee: null,
					labels: {
						nodes: [],
						pageInfo: { hasNextPage: false, endCursor: null },
					},
				},
			},
		}),
	},
} as unknown as LinearClient;
stub(linear, {
	getLinearClient: mock(async () => null),
	linearClientFor: mock(async () => null),
	callLinearForConnection: mock(
		async (id: string, fn: (client: LinearClient) => Promise<unknown>) => {
			issueReads.push(id);
			return id === "conn-a" ? fn(issueClient) : null;
		},
	),
});

let eventSeq = 0;
stub(webhookDelivery, {
	recordWebhookDelivery: mock(async () => ({
		id: `webhook-event-${++eventSeq}`,
		status: "pending",
		retryCount: 0,
		receivedAt: new Date(),
	})),
});

const ingestCalls: Array<{
	connectionId: string | null;
	externalEventId: string;
	ownerUserId: string | null;
	title: string | null;
	teamId: string | null;
}> = [];
stub(automationEvent, {
	ingestAutomationEvent: mock(async (_db: unknown, delivery: never) => {
		const d = delivery as {
			skip?: string;
			event?: {
				integrationConnectionId: string | null;
				externalEventId: string;
				title: string;
			};
			dispatch?: { ownerUserId?: string; event?: { teamId?: string } } | null;
		};
		if (d.skip) return { status: "skipped", reason: d.skip };
		ingestCalls.push({
			connectionId: d.event?.integrationConnectionId ?? null,
			externalEventId: d.event?.externalEventId ?? "",
			ownerUserId: d.dispatch?.ownerUserId ?? null,
			title: d.event?.title ?? null,
			teamId: d.dispatch?.event?.teamId ?? null,
		});
		return { status: "dispatched", eventId: "e" };
	}),
});

stub(db, {
	update: () => ({ set: () => ({ where: async () => undefined }) }),
});

const { processDelivery } = await import("./processDelivery");

const DELIVERY = {
	organizationId: WORKSPACE,
	type: "Issue",
	action: "create",
	webhookTimestamp: 1_700_000_000,
	data: { id: "issue-1", title: "Repro", teamId: "team-1", assigneeId: null },
	updatedFrom: null,
} as never;

describe("one Linear delivery, two connections in the same organization", () => {
	beforeEach(() => {
		ingestCalls.length = 0;
		eventSeq = 0;
		issueReads.length = 0;
		subscribers = [
			connection("conn-a", "user-a"),
			connection("conn-b", "user-b"),
		];
	});

	test("records one automation event per connection", async () => {
		await processDelivery({ payload: DELIVERY, deliveryId: "delivery-1" });
		expect(ingestCalls.map((c) => c.connectionId)).toEqual([
			"conn-a",
			"conn-b",
		]);
	});

	test("both events name the same delivery", async () => {
		await processDelivery({ payload: DELIVERY, deliveryId: "delivery-1" });
		const ids = new Set(ingestCalls.map((c) => c.externalEventId));
		expect(ids.size).toBe(1);
	});

	test("narrows each dispatch to the member who owns that connection", async () => {
		await processDelivery({ payload: DELIVERY, deliveryId: "delivery-1" });
		expect(ingestCalls.map((c) => c.ownerUserId)).toEqual(["user-a", "user-b"]);
	});

	test.each([
		"create",
		"update",
	] as const)("hydrates comment %s with each connection's access and skips inaccessible issues", async (action) => {
		await processDelivery({
			payload: {
				organizationId: WORKSPACE,
				type: "Comment",
				action,
				updatedFrom:
					action === "update" ? { body: "previous text" } : undefined,
				webhookTimestamp: 123,
				data: { id: "comment", issueId: "issue-1", body: "/superset fix this" },
			} as never,
			deliveryId: "comment-delivery",
		});
		expect(issueReads).toEqual(["conn-a", "conn-b"]);
		expect(ingestCalls).toEqual([
			{
				connectionId: "conn-a",
				externalEventId: "comment-delivery",
				ownerUserId: "user-a",
				title: "TEAM-1 Fix login",
				teamId: "team-1",
			},
		]);
	});

	test("comment updates without a body change never fetch an issue or dispatch", async () => {
		await processDelivery({
			payload: {
				organizationId: WORKSPACE,
				type: "Comment",
				action: "update",
				updatedFrom: { resolvedAt: null },
				webhookTimestamp: 123,
				data: { id: "comment", issueId: "issue-1", body: "/superset fix this" },
			} as never,
			deliveryId: "edit-delivery",
		});
		expect(issueReads).toEqual([]);
		expect(ingestCalls).toEqual([]);
	});
});
