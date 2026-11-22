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

const { allowedPlugins, creatorPlugins, environmentMcpAllowlist } =
	await import("./plugins");

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

describe("allowedPlugins", () => {
	const linear = { marketplace: "superset", name: "linear", version: "1.0.0" };
	const github = { marketplace: "superset", name: "github", version: "1.0.0" };
	const forkedLinear = {
		marketplace: "acme",
		name: "linear",
		version: "1.0.0",
	};

	test("a box gets only the plugins the config's [mcp] allow lists, matched on name and marketplace", () => {
		const allowlist = environmentMcpAllowlist(
			'[mcp]\nallow = ["linear@superset"]\n',
		);
		expect(allowedPlugins([linear, github, forkedLinear], allowlist)).toEqual([
			linear,
		]);
	});

	test("no [mcp] allow lets every plugin through; a config that does not parse lets none through", () => {
		const plugins = [linear, github];
		expect(allowedPlugins(plugins, environmentMcpAllowlist(null))).toEqual(
			plugins,
		);
		expect(
			allowedPlugins(
				plugins,
				environmentMcpAllowlist('[install]\nrun = "x"\n'),
			),
		).toEqual(plugins);
		expect(allowedPlugins(plugins, environmentMcpAllowlist("[mcp\n"))).toEqual(
			[],
		);
	});

	test("[mcp] enabled = false lets no plugin through, whatever allow lists", () => {
		const allowlist = environmentMcpAllowlist(
			'[mcp]\nenabled = false\nallow = ["linear@superset"]\n',
		);
		expect(allowedPlugins([linear, github], allowlist)).toEqual([]);
	});
});
