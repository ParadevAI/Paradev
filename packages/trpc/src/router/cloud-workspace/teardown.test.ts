import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as sandbox from "../../lib/sandbox";
import { anyOf, teardownBox } from "./teardown";

let calls: string[] = [];
let named: string[] = [];

const rows = () => ({
	from: () => ({
		where: async () => named.map((name) => ({ name })),
	}),
});
stub(db, { select: rows });
stub(sandbox, {
	stopSandbox: async (name: string) => {
		calls.push(`stop:${name}`);
		return { sessionId: null };
	},
	deleteSandbox: async (name: string) => {
		calls.push(`delete:${name}`);
	},
});

beforeEach(() => {
	calls = [];
	named = [];
});

describe("teardownBox", () => {
	test("stops, then deletes a box no row names", async () => {
		expect(await teardownBox("ws-old")).toBe(true);
		expect(calls).toEqual(["stop:ws-old", "delete:ws-old"]);
	});

	test("keeps a box a row names", async () => {
		named = ["ws-old"];
		expect(await teardownBox("ws-old")).toBe(false);
		expect(calls).toEqual([]);
	});

	test("outside production it stops and deletes nothing", async () => {
		process.env.VERCEL_ENV = "preview";
		try {
			expect(await teardownBox("ws-old")).toBe(false);
		} finally {
			process.env.VERCEL_ENV = "production";
		}
		expect(calls).toEqual([]);
	});
});

test("a name list goes to SQL as one array parameter, whatever its length", () => {
	const names = Array.from({ length: 5000 }, (_, i) => `ws-${i}`);
	const query = new PgDialect().sqlToQuery(
		anyOf(cloudWorkspaces.providerSandboxId, names),
	);
	expect(query.params).toEqual([names]);
	expect(query.sql).toContain("= any($1::text[])");
});
