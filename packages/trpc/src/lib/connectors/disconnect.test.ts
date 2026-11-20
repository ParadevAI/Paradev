import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { connections, type SelectConnection } from "@superset/db/schema";
import { eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as release from "../../router/integration/google/release";
import * as proxy from "../../router/plugins/proxy";
import { deleteGoogleConnections, disconnectConnections } from "./disconnect";

let stored: SelectConnection[];
let events: string[];
let deleteQuery: ReturnType<PgDialect["sqlToQuery"]>;
let updateQuery: ReturnType<PgDialect["sqlToQuery"]>;
const dialect = new PgDialect();

stub(db, {
	delete: () => ({
		where: (condition: SQL) => ({
			returning: async () => {
				deleteQuery = dialect.sqlToQuery(condition);
				const removed = stored;
				stored = [];
				events.push("delete");
				return removed;
			},
		}),
	}),
	update: () => ({
		set: () => ({
			where: (condition: SQL) => ({
				returning: async () => {
					updateQuery = dialect.sqlToQuery(condition);
					return [{ id: "non-google" }];
				},
			}),
		}),
	}),
});
stub(proxy, {
	forgetUpstreamTools: (id: string) => events.push(`forget ${id}`),
});
stub(release, {
	releaseGoogleGrant: async (row: SelectConnection) => {
		expect(stored).toEqual([]);
		events.push(`release ${row.id}`);
	},
});

beforeEach(() => {
	stored = [{ id: "google-1" }, { id: "google-2" }] as SelectConnection[];
	events = [];
});

describe("Google connection deletion", () => {
	test("removes all selected credentials and cached tools before releasing shared grants", async () => {
		const result = await deleteGoogleConnections([
			eq(connections.connectedByUserId, "user-1"),
			eq(connections.ownerKind, "user"),
		]);
		expect(result).toEqual([{ id: "google-1" }, { id: "google-2" }]);
		expect(deleteQuery).toMatchObject({
			sql: '("connections"."connected_by_user_id" = $1 and "connections"."owner_kind" = $2 and "connections"."connector" = $3)',
			params: ["user-1", "user", "google"],
		});
		expect(events).toEqual([
			"delete",
			"forget google-1",
			"forget google-2",
			"release google-1",
			"release google-2",
		]);
	});

	test("preserves the caller's selection and soft disconnects only other connectors", async () => {
		await disconnectConnections([eq(connections.id, "selected")], "user");
		expect(deleteQuery).toMatchObject({
			sql: '("connections"."id" = $1 and "connections"."connector" = $2)',
			params: ["selected", "google"],
		});
		expect(updateQuery).toMatchObject({
			sql: '("connections"."id" = $1 and "connections"."connector" <> $2)',
			params: ["selected", "google"],
		});
		expect(events).toContain("forget non-google");
	});
});
