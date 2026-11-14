import { describe, expect, test } from "bun:test";
import { db, dbWs } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as crypto from "../../router/plugins/crypto";
import * as triggerPins from "./trigger-pins";

// Every connection read answers with a live row in another organization.
const otherOrgRow = [{ email: "owner@other.test" }];
const selectChain = {
	from: () => selectChain,
	innerJoin: () => selectChain,
	where: () => selectChain,
	limit: () => Promise.resolve(otherOrgRow),
};

const insertChain = {
	values: () => insertChain,
	onConflictDoUpdate: () => insertChain,
	returning: () => Promise.resolve([{ id: "conn-new" }]),
};

stub(db, { select: () => selectChain });
stub(dbWs, {
	transaction: (run: (tx: unknown) => unknown) =>
		run({ insert: () => insertChain }),
});
stub(crypto, {
	encryptSecret: (value: string) => Promise.resolve(value),
	encryptOptional: (value: string | null | undefined) =>
		Promise.resolve(value ?? null),
});
stub(triggerPins, {
	liveConnectionIds: () => Promise.resolve([]),
	pinTriggersToExistingAccount: () => Promise.resolve(),
});

const { requireConnector } = await import("./index");
const { upsertConnection } = await import("./upsert");

function connect(slug: string) {
	return upsertConnection({
		connector: requireConnector(slug),
		slug,
		authMethod: "oauth2",
		organizationId: "org-mine",
		userId: "user-1",
		tokens: {
			accessToken: "token",
			refreshToken: null,
			expiresAt: null,
			scopes: null,
			stored: {},
			raw: {},
		},
		identity: {
			account: { id: "shared-workspace", label: null },
			user: { id: "external-user-1", label: null },
		},
	});
}

describe("upsertConnection across organizations", () => {
	test("connects a Notion workspace that another organization also connected", async () => {
		expect(await connect("notion_mcp")).toEqual({ connectionId: "conn-new" });
	});

	test("refuses a Slack workspace that another organization connected", async () => {
		expect(await connect("slack")).toEqual({
			conflict: { ownerEmail: "owner@other.test" },
		});
	});
});
