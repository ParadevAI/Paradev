import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as activeOrg from "../utils/active-org";

const dialect = new PgDialect();
let whereParams: unknown[] = [];

function fakeQuery(): unknown {
	const chain: unknown = new Proxy(
		{},
		{
			get(_, key) {
				if (key === "then") {
					return (resolve: (rows: unknown[]) => void) => resolve([]);
				}
				if (key === "where") {
					return (condition: SQL) => {
						whereParams = dialect.sqlToQuery(condition).params;
						return chain;
					};
				}
				return () => chain;
			},
		},
	);
	return chain;
}

stub(db, { select: () => fakeQuery() });
stub(activeOrg, { requireActiveOrgMembership: async () => "org-1" });

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
	whereParams = [];
});

describe("task list label filter", () => {
	test("task.list and task.listPage filter on every label", async () => {
		await caller.task.list({ labels: [" Acme ", "client-one"] });
		expect(whereParams).toEqual([
			"org-1",
			"acme",
			"acme",
			"acme/%",
			"client-one",
			"client-one",
			"client-one/%",
		]);

		whereParams = [];
		await caller.task.listPage({ labels: ["acme"] });
		expect(whereParams).toEqual(["org-1", "acme", "acme", "acme/%"]);
	});

	test("rejects a label that is only spaces", async () => {
		await expect(caller.task.list({ labels: ["   "] })).rejects.toThrow();
	});
});
