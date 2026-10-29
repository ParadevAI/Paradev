import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import {
	members,
	organizationPlugins,
	pluginInstalls,
} from "@superset/db/schema";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";

const dialect = new PgDialect();
let asked = "";
let managed: { id: string; name: string }[] = [];
let held: { organizationPluginId: string }[] = [];
let inserted: { organizationPluginId: string }[][] = [];

const rows = <T>(value: T[]) =>
	Object.assign(Promise.resolve(value), { limit: async () => value });

stub(db, {
	select: () => ({
		from: (table: unknown) => ({
			where: (condition: SQL) => {
				if (table === members) return rows([{ role: "member" }]);
				if (table === pluginInstalls) return rows(held);
				if (table === organizationPlugins) {
					asked = dialect.sqlToQuery(condition).sql;
					return rows(
						managed.map((plugin) => ({
							...plugin,
							version: "1.0.0",
							manifest: { name: plugin.name },
						})),
					);
				}
				return rows([]);
			},
		}),
	}),
	insert: () => ({
		values: (values: { organizationPluginId: string }[]) => ({
			onConflictDoNothing: async () => {
				inserted.push(values);
			},
		}),
	}),
});

const { accessiblePlugin, ensureManagedInstalls } = await import("./access");

beforeEach(() => {
	asked = "";
	managed = [];
	held = [];
	inserted = [];
});

describe("accessiblePlugin", () => {
	test("a plugin that left its repository is not offered for a new install", async () => {
		await accessiblePlugin("org-1", "member", "deploy", { offered: true });
		expect(asked).toContain('"removed_from_source_at" is null');
	});

	test("members who have such a plugin can still download it", async () => {
		await accessiblePlugin("org-1", "member", "deploy");
		expect(asked).not.toContain("removed_from_source_at");
		expect(asked).toContain('"install_policy" ->>');
	});
});

describe("ensureManagedInstalls", () => {
	test("installs only what the member does not have yet", async () => {
		managed = [
			{ id: "p1", name: "deploy" },
			{ id: "p2", name: "notes" },
		];
		held = [{ organizationPluginId: "p1" }];
		await ensureManagedInstalls("user-1", "org-1");
		expect(
			inserted.map((batch) => batch.map((v) => v.organizationPluginId)),
		).toEqual([["p2"]]);
	});

	test("writes nothing when the member has every installed plugin", async () => {
		managed = [{ id: "p1", name: "deploy" }];
		held = [{ organizationPluginId: "p1" }];
		await ensureManagedInstalls("user-1", "org-1");
		expect(inserted).toEqual([]);
	});

	test("a plugin that left its repository is not installed for new members", async () => {
		await ensureManagedInstalls("user-1", "org-1");
		expect(asked).toContain('"removed_from_source_at" is null');
	});
});
