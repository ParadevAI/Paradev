import { beforeEach, describe, expect, test } from "bun:test";
import { dbWs } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as orgResourceAccess from "../utils/org-resource-access";

const TASK_ID = "6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5d6e";
const row = {
	id: TASK_ID,
	organizationId: "org-1",
	title: "Fix the sidebar",
	description: null,
	statusId: "status-todo",
	priority: "none",
	assigneeId: "user-1",
};

let writes: Record<string, unknown>[] = [];

function fakeTx(): unknown {
	const chain: unknown = new Proxy(
		{},
		{
			get(_, key) {
				if (key === "then") {
					return (resolve: (rows: unknown[]) => void) => resolve([row]);
				}
				if (key === "set") {
					return (values: Record<string, unknown>) => {
						writes.push(values);
						return chain;
					};
				}
				if (key === "execute") {
					return async () => ({ rows: [{ txid: "1" }] });
				}
				return () => chain;
			},
		},
	);
	return chain;
}

stub(dbWs, {
	transaction: async (run: (tx: unknown) => unknown) => run(fakeTx()),
});
stub(orgResourceAccess, {
	requireOrgResourceAccess: async () => ({
		id: TASK_ID,
		organizationId: "org-1",
	}),
});

const { taskRouter } = await import("./task");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const caller = createCallerFactory(createTRPCRouter({ task: taskRouter }))(
	createTRPCContext({
		session: {
			user: { id: "user-1", email: "user@example.com" },
			session: { activeOrganizationId: "org-1" },
		} as never,
		auth: {} as never,
		headers: new Headers(),
		sandboxCaller: null,
	}),
);

beforeEach(() => {
	writes = [];
});

describe("task.update", () => {
	test("keeps the assignee when assigneeId is sent as undefined", async () => {
		await caller.task.update({
			id: TASK_ID,
			title: "Renamed",
			assigneeId: undefined,
		});
		expect(writes).toHaveLength(1);
		expect(writes[0]).not.toHaveProperty("assigneeId", null);
	});

	test("unassigns when assigneeId is null", async () => {
		await caller.task.update({ id: TASK_ID, assigneeId: null });
		expect(writes[0]).toHaveProperty("assigneeId", null);
	});
});
