import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { members, pluginInstalls } from "@superset/db/schema";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";

const dialect = new PgDialect();
let installsQuery: { sql: string; params: unknown[] } | null = null;

const result = <T>(value: T[]) =>
	Object.assign(Promise.resolve(value), {
		limit: () => Promise.resolve(value),
		orderBy: () => Promise.resolve(value),
	});

stub(db, {
	select: () => ({
		from: (table: unknown) => {
			const chain = {
				leftJoin: () => chain,
				where: (condition: SQL) => {
					if (table === members) return result([{ role: "member" }]);
					if (table === pluginInstalls) {
						installsQuery = dialect.sqlToQuery(condition);
					}
					return result([]);
				},
			};
			return chain;
		},
	}),
});

const { creatorPlugins } = await import("./plugins");

describe("creatorPlugins", () => {
	test("a cloud workspace gets only the organization plugins the creator's role may use", async () => {
		await creatorPlugins("user-1", "org-1");
		expect(installsQuery?.sql).toContain('"install_policy" ->>');
		expect(installsQuery?.params).toEqual(
			expect.arrayContaining(["member", "available", "installed"]),
		);
	});

	test("a workspace with no creator gets no plugins", async () => {
		expect(await creatorPlugins(null, "org-1")).toEqual([]);
	});
});
