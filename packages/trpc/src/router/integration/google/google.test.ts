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
const { summarizeGoogleConnections } = await import("./state");

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

describe("summarizeGoogleConnections", () => {
	const row = (id: string, email: string, disconnectedAt: Date | null) =>
		({
			id,
			externalAccountId: email,
			connectedByUserId: "user-1",
			createdAt: new Date(0),
			disconnectedAt,
		}) as unknown as SelectConnection;

	test("returns null without connections", () => {
		expect(summarizeGoogleConnections([])).toBeNull();
	});

	test("lists every live address for a member with two accounts", () => {
		const summary = summarizeGoogleConnections([
			row("a", "a@example.com", null),
			row("b", "b@example.com", null),
		]);
		expect(summary?.emails).toEqual(["a@example.com", "b@example.com"]);
		expect(summary?.needsReconnect).toBe(false);
	});

	test("needs a reconnect only when no connection is live", () => {
		const gone = new Date(1);
		expect(
			summarizeGoogleConnections([
				row("a", "a@example.com", gone),
				row("b", "b@example.com", null),
			])?.needsReconnect,
		).toBe(false);
		expect(
			summarizeGoogleConnections([row("a", "a@example.com", gone)])
				?.needsReconnect,
		).toBe(true);
	});
});
