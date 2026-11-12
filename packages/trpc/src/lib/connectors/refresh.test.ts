import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as crypto from "../../router/plugins/crypto";
import * as discovery from "./discovery";

// A refresh is a token-endpoint call plus what gets written back. A real
// registry connector with a static client is used, so `resolveEndpoints` runs
// for real and reaches no network, and the token endpoint is intercepted at
// `globalThis.fetch`.

let rows: Array<Record<string, unknown>> = [];
let stored: Record<string, unknown> | null = null;
let reads: Array<Record<string, unknown> | null> = [];
let updates: Array<Record<string, unknown>> = [];
let swaps: boolean[] = [];
let written: Array<Record<string, unknown>> = [];
let response: { status: number; ok: boolean; body: unknown } | null = null;
let fetchError: Error | null = null;
let tokenRequests: URLSearchParams[] = [];
let oauthClients: Array<Record<string, unknown>> = [];

let limits: number[] = [];

// `refresh` re-reads one row by id; the lookups read two to detect a second.
// The stored dynamic clients are read whole, ordered, with no limit.
const selectChain = {
	from: () => selectChain,
	where: () => selectChain,
	orderBy: () =>
		Object.assign(Promise.resolve(oauthClients), { limit: selectChain.limit }),
	limit: (n: number) => {
		limits.push(n);
		if (rows.length) return Promise.resolve(rows.slice(0, n));
		if (reads.length) {
			const next = reads.shift();
			return Promise.resolve(next ? [next] : []);
		}
		return Promise.resolve(stored ? [stored] : []);
	},
};

// `where()` is both awaited directly and chained into `returning()`, so it
// answers a real promise carrying that method rather than a hand-rolled
// thenable.
const updateResult = Object.assign(Promise.resolve(undefined), {
	returning: () => {
		if (swaps.shift() === false) return Promise.resolve([]);
		written.push(updates.at(-1) ?? {});
		return Promise.resolve([stored]);
	},
});

const updateChain = {
	set: (values: Record<string, unknown>) => {
		updates.push(values);
		return updateChain;
	},
	where: () => updateResult,
};

stub(db, { select: () => selectChain, update: () => updateChain });

const ISSUER = "https://api.useautumn.com/api/auth";
stub(discovery, {
	discoverServer: () =>
		Promise.resolve({
			resource: "https://mcp.useautumn.com/mcp",
			issuer: ISSUER,
			metadata: {
				issuer: ISSUER,
				authorization_endpoint: `${ISSUER}/oauth2/authorize`,
				token_endpoint: `${ISSUER}/oauth2/token`,
				registration_endpoint: `${ISSUER}/oauth2/register`,
			},
		}),
});

stub(crypto, {
	decryptSecret: (value: string) => Promise.resolve(value),
	decryptOptional: (value: string | null) => Promise.resolve(value),
	encryptSecret: (value: string) => Promise.resolve(value),
	encryptOptional: (value: string | null) => Promise.resolve(value),
});

const {
	ConnectorUnavailableError,
	ensureFreshConnection,
	NEEDS_REAUTH,
	UnrefreshableConnectionError,
} = await import("./refresh");
const { AmbiguousConnectionError, orgConnection, userConnection } =
	await import("./lookup");

const CONNECTOR = "linear";
const ENV = { LINEAR_CLIENT_ID: "id", LINEAR_CLIENT_SECRET: "secret" };
const original: Record<string, string | undefined> = {};
for (const [key, value] of Object.entries(ENV)) {
	original[key] = process.env[key];
	process.env[key] = value;
}
afterAll(() => {
	for (const key of Object.keys(ENV)) {
		if (original[key] === undefined) delete process.env[key];
		else process.env[key] = original[key];
	}
});

const EXPIRED = new Date(Date.now() - 60_000);

function connection(overrides: Record<string, unknown> = {}) {
	return {
		id: "conn-1",
		connector: CONNECTOR,
		authMethod: "oauth2",
		accessToken: "old-access",
		refreshToken: "refresh",
		tokenExpiresAt: EXPIRED,
		config: null,
		...overrides,
	} as never;
}

const realFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	updates = [];
	swaps = [];
	written = [];
	limits = [];
	rows = [];
	reads = [];
	response = null;
	fetchError = null;
	tokenRequests = [];
	oauthClients = [];
	stored = connection();
	globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
		if (fetchError) throw fetchError;
		tokenRequests.push(new URLSearchParams(String(init?.body)));
		const current = response;
		if (!current) throw new Error("no token-endpoint response configured");
		const body =
			typeof current.body === "string"
				? current.body
				: JSON.stringify(current.body);
		return new Response(body, {
			status: current.status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
});

describe("a connection that cannot be refreshed", () => {
	test("is recorded as needing reauthorization, not only thrown", async () => {
		stored = connection({ refreshToken: null });

		await expect(
			ensureFreshConnection(connection({ refreshToken: null })),
		).rejects.toBeInstanceOf(UnrefreshableConnectionError);

		// Without this write the row still reads as connected everywhere.
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject({ disconnectReason: NEEDS_REAUTH });
		expect(updates[0]?.disconnectedAt).toBeInstanceOf(Date);
	});

	test("a rejected refresh token is recorded the same way", async () => {
		response = { ok: false, status: 400, body: { error: "invalid_grant" } };

		await expect(
			ensureFreshConnection(connection(), { raceSettleMs: 0 }),
		).rejects.toBeInstanceOf(UnrefreshableConnectionError);
		expect(updates[0]).toMatchObject({ disconnectReason: NEEDS_REAUTH });
	});

	test("a provider's own dead-token code is recorded the same way", async () => {
		response = { ok: true, status: 200, body: { error: "bad_refresh_token" } };

		await expect(
			ensureFreshConnection(connection(), { raceSettleMs: 0 }),
		).rejects.toBeInstanceOf(UnrefreshableConnectionError);
		expect(updates[0]).toMatchObject({ disconnectReason: NEEDS_REAUTH });
	});
});

describe("two processes refreshing a rotating refresh token at once", () => {
	test("the loser adopts the winner's tokens instead of disconnecting", async () => {
		const winner = connection({
			accessToken: "new-access",
			refreshToken: "rotated",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});
		reads = [connection(), winner];
		response = { ok: false, status: 400, body: { error: "invalid_grant" } };

		await expect(
			ensureFreshConnection(connection(), { raceSettleMs: 0 }),
		).resolves.toBe(winner);
		expect(updates).toHaveLength(0);
	});

	test("the loser waits for a winner that has not written yet", async () => {
		const winner = connection({ accessToken: "new-access" });
		reads = [connection(), connection(), winner];
		response = { ok: false, status: 400, body: { error: "invalid_grant" } };

		await expect(
			ensureFreshConnection(connection(), { raceSettleMs: 1 }),
		).resolves.toBe(winner);
		expect(updates).toHaveLength(0);
	});

	test("the winner's write clears a mark the loser made first", async () => {
		response = {
			ok: true,
			status: 200,
			body: { access_token: "new-access", expires_in: 3600 },
		};

		await ensureFreshConnection(connection());
		expect(updates[0]).toMatchObject({
			accessToken: "new-access",
			disconnectedAt: null,
			disconnectReason: null,
		});
	});
});

describe("a refresh race the server let both sides win", () => {
	let grant: { current: string; previous: string | null };
	let issued = 0;

	beforeEach(() => {
		issued = 0;
		globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
			const sent = new URLSearchParams(String(init?.body));
			tokenRequests.push(sent);
			const token = sent.get("refresh_token");
			if (token !== grant.current && token !== grant.previous)
				return Response.json({ error: "invalid_grant" }, { status: 400 });
			issued += 1;
			grant = { previous: token, current: `rotated-${issued}` };
			return Response.json({
				access_token: `access-${issued}`,
				refresh_token: grant.current,
				expires_in: 28800,
			});
		}) as typeof fetch;
	});

	const winnerRow = (refreshToken: string) =>
		connection({
			accessToken: "winner-access",
			refreshToken,
			tokenExpiresAt: new Date(Date.now() + 28_800_000),
		});

	test("keeps our tokens when the winner stored the one the server superseded", async () => {
		grant = { previous: "refresh", current: "winner" };
		reads = [connection(), winnerRow("winner")];
		swaps = [false];

		await ensureFreshConnection(connection());
		expect(grant.current).toBe("rotated-1");
		expect(written).toEqual([
			expect.objectContaining({ refreshToken: "rotated-1" }),
		]);
	});

	test("checks again when a third process stores before our reconciliation", async () => {
		grant = { previous: "refresh", current: "b" };
		reads = [connection(), winnerRow("a"), winnerRow("b")];
		swaps = [false, false];

		await ensureFreshConnection(connection());
		expect(grant.current).toBe("rotated-1");
		expect(written).toEqual([
			expect.objectContaining({ refreshToken: "rotated-1" }),
		]);
	});

	test("rotates the winner's token when it is the live one", async () => {
		grant = { previous: "refresh", current: "rotated-0" };
		const redeemOursFirst = globalThis.fetch;
		let first = true;
		globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
			const response = await redeemOursFirst(input, init);
			if (first) {
				first = false;
				grant = { previous: "refresh", current: "winner" };
			}
			return response;
		}) as typeof fetch;
		reads = [connection(), winnerRow("winner")];
		swaps = [false];

		await ensureFreshConnection(connection());
		expect(grant.previous).toBe("winner");
		expect(written).toEqual([
			expect.objectContaining({ refreshToken: grant.current }),
		]);
	});
});

describe("a token endpoint that is merely down", () => {
	test("does not disconnect the connection", async () => {
		response = { ok: false, status: 503, body: {} };

		await expect(ensureFreshConnection(connection())).rejects.toBeInstanceOf(
			ConnectorUnavailableError,
		);
		// Someone else's outage must not cost the user their connection.
		expect(updates).toHaveLength(0);
	});

	test("a rate limit keeps the connection", async () => {
		response = {
			ok: false,
			status: 429,
			body: { error: "temporarily_unavailable" },
		};

		await expect(ensureFreshConnection(connection())).rejects.toBeInstanceOf(
			ConnectorUnavailableError,
		);
		expect(updates).toHaveLength(0);
	});

	test("a JSON body that is not an object is unavailable", async () => {
		response = { ok: false, status: 400, body: '"Bad Request"' };

		await expect(ensureFreshConnection(connection())).rejects.toBeInstanceOf(
			ConnectorUnavailableError,
		);
		expect(updates).toHaveLength(0);
	});

	test("a gateway error page is unavailable, not a parse failure", async () => {
		response = { ok: false, status: 403, body: "<html>Forbidden</html>" };

		await expect(ensureFreshConnection(connection())).rejects.toBeInstanceOf(
			ConnectorUnavailableError,
		);
		expect(updates).toHaveLength(0);
	});

	test("an unreachable endpoint is unavailable, not unrefreshable", async () => {
		fetchError = new Error("ECONNREFUSED");

		const error = await ensureFreshConnection(connection()).catch((e) => e);
		expect(error).toBeInstanceOf(ConnectorUnavailableError);
		expect(updates).toHaveLength(0);
	});
});

describe("a connection that is still valid", () => {
	test("is returned without calling the token endpoint", async () => {
		const fresh = connection({
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});
		await expect(ensureFreshConnection(fresh)).resolves.toBe(fresh);
		expect(updates).toHaveLength(0);
	});
});

describe("one account, or an error", () => {
	test("a single match resolves", async () => {
		rows = [{ id: "conn-1" }];
		await expect(
			userConnection("org", "linear", "user"),
		).resolves.toMatchObject({ id: "conn-1" });
	});

	test("two live rows throw rather than resolving to the newest", async () => {
		rows = [{ id: "conn-newer" }, { id: "conn-older" }];
		const error = await userConnection("org", "linear", "user").catch((e) => e);
		expect(error).toBeInstanceOf(AmbiguousConnectionError);
		expect(error.connector).toBe("linear");
		expect(error.connectionIds).toEqual(["conn-newer", "conn-older"]);
	});

	test("the org lookup is ambiguous on the same terms", async () => {
		rows = [{ id: "a" }, { id: "b" }];
		await expect(orgConnection("org", "slack")).rejects.toBeInstanceOf(
			AmbiguousConnectionError,
		);
	});

	test("a second row is read, so a second row can be seen at all", async () => {
		rows = [{ id: "conn-1" }];
		await userConnection("org", "linear", "user");
		expect(limits).toEqual([2]);
	});
});

describe("a dynamic client's connection", () => {
	const autumn = (overrides: Record<string, unknown> = {}) =>
		connection({ connector: "autumn_mcp", ...overrides });
	const oauthClient = (clientId: string, scopes: string[] | null) => ({
		issuer: ISSUER,
		clientId,
		clientSecret: `${clientId}-secret`,
		clientSecretExpiresAt: null,
		tokenEndpointAuthMethod: "client_secret_post",
		scopes,
	});

	beforeEach(() => {
		response = {
			ok: true,
			status: 200,
			body: { access_token: "new-access", expires_in: 3600 },
		};
		oauthClients = [
			oauthClient("legacy-client", null),
			oauthClient("scoped-client", ["offline_access", "rewards:read"]),
		];
	});

	test("refreshes as the client its grant was issued to", async () => {
		stored = autumn({ oauthClientId: "scoped-client" });

		await ensureFreshConnection(autumn({ oauthClientId: "scoped-client" }));
		expect(tokenRequests[0]?.get("client_id")).toBe("scoped-client");
		expect(tokenRequests[0]?.get("client_secret")).toBe("scoped-client-secret");
	});

	test("from before client ids were recorded refreshes as the oldest client", async () => {
		stored = autumn({ oauthClientId: null });

		await ensureFreshConnection(autumn({ oauthClientId: null }));
		expect(tokenRequests[0]?.get("client_id")).toBe("legacy-client");
	});

	test("whose client was forgotten needs reauthorization", async () => {
		stored = autumn({ oauthClientId: "deleted-client" });

		await expect(
			ensureFreshConnection(autumn({ oauthClientId: "deleted-client" })),
		).rejects.toBeInstanceOf(UnrefreshableConnectionError);
		expect(tokenRequests).toHaveLength(0);
		expect(updates[0]).toMatchObject({ disconnectReason: NEEDS_REAUTH });
	});
});
