import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SelectConnection } from "@superset/db/schema";
import { stub } from "../../../../test/stub";
import * as crypto from "../../plugins/crypto";
import { releaseGoogleGrant } from "./release";

let otherConnections: Array<{ id: string }>;
let requests: Array<{ url: string; init: RequestInit }>;
let warnings: unknown[][];
let watchStatus: number;
let revokeFailure: boolean;

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
stub(console, { warn: (...args: unknown[]) => warnings.push(args) });
stub(globalThis, {
	fetch: async (url: string, init: RequestInit) => {
		requests.push({ url, init });
		if (url.endsWith("/stop"))
			return new Response(null, { status: watchStatus });
		if (revokeFailure) throw new Error("request failed with secret-token");
		return new Response(null);
	},
});

const connection = {
	id: "conn-1",
	connector: "google",
	externalUserId: "google-sub-1",
	accessToken: "access",
	refreshToken: "refresh",
	state: { provider: "google", gmail: { watchExpiresAt: 1 } },
} as unknown as SelectConnection;

beforeEach(() => {
	otherConnections = [];
	requests = [];
	warnings = [];
	watchStatus = 200;
	revokeFailure = false;
});

describe("releaseGoogleGrant", () => {
	test("stops the last connection's watch before revoking its grant", async () => {
		await releaseGoogleGrant(connection);
		expect(requests.map(({ url }) => url)).toEqual([
			"https://gmail.googleapis.com/gmail/v1/users/me/stop",
			"https://oauth2.googleapis.com/revoke",
		]);
		expect(requests[0]?.init).toMatchObject({
			method: "POST",
			headers: { Authorization: "Bearer access" },
		});
		expect(requests[1]?.init.method).toBe("POST");
		expect(String(requests[1]?.init.body)).toBe("token=refresh");
	});

	test("preserves the watch and grant used by another live connection", async () => {
		otherConnections = [{ id: "conn-other-org" }];
		await releaseGoogleGrant(connection);
		expect(requests).toEqual([]);
	});

	test("revokes with an access token when no refresh token was stored", async () => {
		await releaseGoogleGrant({
			...connection,
			refreshToken: null,
			state: null,
		});
		expect(requests).toHaveLength(1);
		expect(String(requests[0]?.init.body)).toBe("token=access");
	});

	test("still revokes when an expired access token cannot stop the watch", async () => {
		watchStatus = 401;
		await releaseGoogleGrant(connection);
		expect(requests).toHaveLength(2);
		expect(warnings).toEqual([
			[
				"[google/disconnect] Could not stop mailbox watch",
				{ connectionId: "conn-1", status: 401 },
			],
		]);
	});

	test("a revocation failure does not fail local deletion or expose credentials", async () => {
		revokeFailure = true;
		await releaseGoogleGrant(connection);
		expect(warnings).toEqual([
			[
				"[google/disconnect] Could not revoke grant",
				{ connectionId: "conn-1" },
			],
		]);
	});
});
