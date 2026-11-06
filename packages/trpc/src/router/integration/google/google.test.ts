import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SelectConnection } from "@superset/db/schema";
import { stub } from "../../../../test/stub";
import * as crypto from "../../plugins/crypto";
import * as gmail from "./gmail";

let otherConnections: Array<{ id: string }> = [];
let upstream: string[] = [];

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
stub(gmail, {
	stopMailboxWatch: async () => {
		upstream.push("stop watch");
	},
});
stub(globalThis, {
	fetch: async () => {
		upstream.push("revoke grant");
		return new Response(null);
	},
});

const { releaseGoogleGrant } = await import("./google");

const connection = {
	id: "conn-1",
	connector: "google",
	externalUserId: "google-sub-1",
	accessToken: "access",
	refreshToken: "refresh",
	state: { provider: "google", gmail: { watchExpiresAt: 1 } },
} as unknown as SelectConnection;

beforeEach(() => {
	upstream = [];
});

describe("releaseGoogleGrant", () => {
	test("revokes the grant and stops the watch for the last connection", async () => {
		otherConnections = [];
		await releaseGoogleGrant(connection);
		expect(upstream.sort()).toEqual(["revoke grant", "stop watch"]);
	});

	test("leaves both alone while another org uses the same Google account", async () => {
		otherConnections = [{ id: "conn-other-org" }];
		await releaseGoogleGrant(connection);
		expect(upstream).toEqual([]);
	});
});
