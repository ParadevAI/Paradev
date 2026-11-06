import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import {
	members,
	organizationPluginSources,
	organizationPlugins,
	pluginInstalls,
} from "@superset/db/schema";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as r2 from "../../lib/r2";
import * as realtime from "../../lib/realtime";

const ORG = "11111111-0000-4000-8000-000000000000";
const ROLES = ["owner", "admin", "member"];
const dialect = new PgDialect();

interface PluginRow {
	id: string;
	name: string;
	version: string;
	contentHash: string;
	installPolicy: Record<string, string>;
}

let role = "member";
const MEMBERS = [
	{ userId: "owner-1", role: "owner" },
	{ userId: "admin-1", role: "admin" },
	{ userId: "member-1", role: "member" },
	{ userId: "member-2", role: "member" },
];
let plugins: PluginRow[] = [];
let deletedInstalls: unknown[][] = [];

/** Applies the role filter only when the query carries the access check, so a missing check shows. */
function visible(condition: SQL | undefined): PluginRow[] {
	if (!condition) return plugins;
	const { sql, params } = dialect.sqlToQuery(condition);
	if (/\bfalse\b/.test(sql)) return [];
	const named = plugins.filter(
		(row) =>
			!params.some((p) => typeof p === "string" && p.startsWith("p-")) ||
			params.includes(row.name),
	);
	if (!sql.includes("->>")) return named;
	const asked = params.find((p) => ROLES.includes(p as string)) as string;
	return named.filter((row) =>
		["available", "installed"].includes(row.installPolicy[asked] ?? ""),
	);
}

const result = <T>(value: T[]) =>
	Object.assign(Promise.resolve(value), {
		limit: () => Promise.resolve(value),
		orderBy: () => Promise.resolve(value),
	});

stub(realtime, { nudge: () => {} });
let deletedObjects: string[][] = [];

stub(r2, {
	getObject: async () => new Response(new Uint8Array([1, 2, 3])),
	deleteObjects: async (keys: string[]) => {
		deletedObjects.push([...keys]);
	},
});
stub(db, {
	query: {
		members: { findFirst: async () => ({ role }) },
	},
	select: () => ({
		from: (table: unknown) => {
			const chain = {
				leftJoin: () => chain,
				where: (condition: SQL) => {
					if (table === members) {
						const { params } = dialect.sqlToQuery(condition);
						const roles = params.filter((p) => ROLES.includes(p as string));
						return result(
							roles.length
								? MEMBERS.filter((m) => roles.includes(m.role))
								: [{ role }],
						);
					}
					if (table !== organizationPlugins) return result([]);
					return result(
						visible(condition).map((plugin) => ({
							...plugin,
							plugin: {
								...plugin,
								manifest: { name: plugin.name },
								sourceId: null,
								removedFromSourceAt: null,
								updatedAt: new Date(0),
							},
							repo: null,
						})),
					);
				},
			};
			return chain;
		},
	}),
	update: () => ({
		set: (values: { installPolicy: SQL }) => ({
			where: (condition: SQL) => ({
				returning: async () => {
					const { params } = dialect.sqlToQuery(condition);
					const row = plugins.find((p) => params.includes(p.name));
					if (!row) return [];
					const patch = dialect
						.sqlToQuery(values.installPolicy)
						.params.find((p) => typeof p === "string" && p.startsWith("{"));
					row.installPolicy = {
						...row.installPolicy,
						...JSON.parse(patch as string),
					};
					return [row];
				},
			}),
		}),
	}),
	delete: (table: unknown) => ({
		where: (condition: SQL) => {
			if (table === pluginInstalls) {
				deletedInstalls.push(dialect.sqlToQuery(condition).params);
			}
			return Object.assign(Promise.resolve(), {
				returning: async () =>
					table === organizationPluginSources ? [{ id: "source-1" }] : [],
			});
		},
	}),
});

const { organizationPluginsRouter } = await import("./organization");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const caller = createCallerFactory(
	createTRPCRouter({
		organization: createTRPCRouter(organizationPluginsRouter),
	}),
)(
	createTRPCContext({
		session: {
			user: { id: "user-1", email: "me@superset.sh" },
			session: { activeOrganizationId: ORG },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	}),
);

const plugin = (name: string, installPolicy: Record<string, string>) => ({
	id: `id-${name}`,
	name: `p-${name}`,
	version: "1.0.0",
	contentHash: "hash",
	installPolicy,
});

beforeEach(() => {
	role = "member";
	deletedInstalls = [];
	deletedObjects = [];
	plugins = [
		plugin("admins", { owner: "available", admin: "available" }),
		plugin("everyone", { member: "available", admin: "available" }),
	];
});

describe("organization plugins access", () => {
	test("a member cannot download a plugin offered only to admins", async () => {
		await expect(
			caller.organization.bundle({ name: "p-admins" }),
		).rejects.toThrow();
		expect(
			(await caller.organization.bundle({ name: "p-everyone" })).name,
		).toBe("p-everyone");
	});

	test("a member lists only the plugins offered to members", async () => {
		const names = (await caller.organization.list()).map((p) => p.name);
		expect(names).toEqual(["p-everyone"]);
	});

	test("an admin lists every plugin", async () => {
		role = "admin";
		const names = (await caller.organization.list()).map((p) => p.name);
		expect(names).toEqual(["p-admins", "p-everyone"]);
	});

	test("a change to one role keeps the others another admin set", async () => {
		role = "admin";
		await caller.organization.setPolicy({
			name: "p-everyone",
			policy: { owner: "installed" },
		});
		expect(plugins[1]?.installPolicy).toEqual({
			member: "available",
			admin: "available",
			owner: "installed",
		});
		expect(deletedInstalls).toEqual([]);
	});

	test("removing a source deletes its plugins' bundles from storage", async () => {
		role = "admin";
		await caller.organization.sources.remove({
			id: "00000000-0000-4000-8000-000000000001",
		});
		expect(deletedObjects).toEqual([
			[
				`organization-plugins/${ORG}/hash`,
				`organization-plugins/${ORG}/hash`,
			].map((key) => `${key}.json.gz`),
		]);
	});

	test("a member cannot change a plugin's access", async () => {
		await expect(
			caller.organization.setPolicy({
				name: "p-admins",
				policy: { member: "installed" },
			}),
		).rejects.toThrow(/Admin access required/);
		expect(plugins[0]?.installPolicy.member).toBeUndefined();
	});

	test("revoking a role's access removes its members' installs", async () => {
		role = "admin";
		await caller.organization.setPolicy({
			name: "p-everyone",
			policy: { admin: "available", member: "unavailable" },
		});
		expect(deletedInstalls).toHaveLength(1);
		expect(deletedInstalls[0]).toEqual(["id-everyone", "member-1", "member-2"]);
	});
});
