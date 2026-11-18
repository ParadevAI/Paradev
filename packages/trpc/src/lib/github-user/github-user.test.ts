import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { db } from "@superset/db/client";
import * as dbUtils from "@superset/db/utils";
import { stub } from "../../../test/stub";
import { env } from "../../env";
import * as refreshCredentials from "../sandbox/refresh-credentials";
import * as secretBox from "../secret-box";
import { githubUserTokenFor } from "./github-user";

const MINUTE = 60_000;

function connection(accessTokenExpiresAt: Date) {
	return {
		userId: "user_1",
		encryptedAccessToken: "old-access",
		encryptedRefreshToken: "old-refresh",
		accessTokenExpiresAt,
	};
}

describe("githubUserTokenFor", () => {
	let stored = connection(new Date());
	const reapplied: string[] = [];
	stub(env, { GH_APP_CLIENT_ID: "client", GH_APP_CLIENT_SECRET: "secret" });
	stub(secretBox, {
		open: (sealed: string) => sealed,
		seal: (plaintext: string) => plaintext,
	});
	stub(db.query.githubUserConnections, { findFirst: async () => stored });
	stub(dbUtils, {
		withConnectionLock: (
			_id: string,
			fn: (tx: unknown) => Promise<unknown>,
		) => {
			const chain = {
				select: () => chain,
				from: () => chain,
				where: () => Promise.resolve([stored]),
				update: () => ({ set: () => ({ where: async () => {} }) }),
			};
			return fn(chain);
		},
	});
	stub(refreshCredentials, {
		reapplyRulesOfBoxesCreatedBy: async (userId: string) => {
			reapplied.push(userId);
		},
	});
	beforeAll(() => {
		spyOn(globalThis, "fetch").mockImplementation((async () =>
			Response.json({
				access_token: "new-access",
				expires_in: 8 * 60 * 60,
				refresh_token: "new-refresh",
			})) as unknown as typeof fetch);
	});
	afterAll(() => {
		(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore();
	});

	test("a refresh revokes the old token, so the person's boxes get the new one before it returns", async () => {
		stored = connection(new Date(Date.now() + 5 * MINUTE));
		reapplied.length = 0;
		expect(await githubUserTokenFor("user_1")).toBe("new-access");
		expect(reapplied).toEqual(["user_1"]);
	});

	test("a token far from expiry touches no box", async () => {
		stored = connection(new Date(Date.now() + 60 * MINUTE));
		reapplied.length = 0;
		expect(await githubUserTokenFor("user_1")).toBe("old-access");
		expect(reapplied).toEqual([]);
	});
});
