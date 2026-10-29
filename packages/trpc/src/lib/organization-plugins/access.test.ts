import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";

const dialect = new PgDialect();
let asked = "";

stub(db, {
	select: () => ({
		from: () => ({
			where: (condition: SQL) => {
				asked = dialect.sqlToQuery(condition).sql;
				return { limit: async () => [] };
			},
		}),
	}),
});

const { accessiblePlugin } = await import("./access");

beforeEach(() => {
	asked = "";
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
