import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SelectConnection } from "@superset/db/schema";
import { stub } from "../../../../test/stub";
import * as crypto from "../../plugins/crypto";
import * as tokenRefresh from "../token-refresh";
import * as tracker from "./tracker";

let otherConnections: Array<{ id: string }> = [];
let revoked: string[] = [];
let disconnected: string[] = [];

const selectChain = {
	from: () => selectChain,
	where: () => selectChain,
	limit: () => Promise.resolve(otherConnections),
};

stub(db, { select: () => selectChain });
stub(crypto, {
	decryptOptional: (value: string | null) => Promise.resolve(value),
	decryptSecret: (value: string) => Promise.resolve(value),
});
stub(tokenRefresh, {
	markDisconnected: async (connectionId: string) => {
		disconnected.push(connectionId);
	},
});
stub(tracker, { trackTasksInSupersetWithoutLinear: async () => {} });
stub(globalThis, {
	fetch: async (_url: string, init: { body: URLSearchParams }) => {
		revoked.push(init.body.get("token_type_hint") ?? "");
		return new Response(null);
	},
});

const { revokeLinearConnection } = await import("./revoke");

const connection = {
	id: "conn-1",
	organizationId: "org-1",
	connector: "linear",
	externalUserId: "linear-user-1",
	accessToken: "access",
	refreshToken: "refresh",
} as unknown as SelectConnection;

beforeEach(() => {
	revoked = [];
	disconnected = [];
});

describe("revokeLinearConnection", () => {
	test("revokes both tokens for the last connection", async () => {
		otherConnections = [];
		expect(await revokeLinearConnection(connection)).toBe("revoked");
		expect(revoked).toEqual(["access_token", "refresh_token"]);
		expect(disconnected).toEqual(["conn-1"]);
	});

	test("only disconnects the row while another org uses the same Linear user", async () => {
		otherConnections = [{ id: "conn-other-org" }];
		expect(await revokeLinearConnection(connection)).toBe("revoked");
		expect(revoked).toEqual([]);
		expect(disconnected).toEqual(["conn-1"]);
	});
});
